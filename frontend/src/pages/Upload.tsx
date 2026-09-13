import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UploadCloud, FileText, Loader2, ClipboardList, X, FileSearch, Lock } from "lucide-react";
import { apiPost, apiPut, ApiError } from "@/lib/api";
import { uploadFile } from "@/lib/session";
import type { CheckoutSession, Job, PageEstimate, SpecEntry, SpecPriceItem, SpecReadResult } from "@/lib/types";
import Shell, { Panel } from "@/components/Shell";
import { CAP, usePlanCaps } from "@/lib/plan";
import UsageMeter from "@/components/UsageMeter";
import ScanSequence from "@/components/ScanSequence";
import MaterialPricing from "@/components/MaterialPricing";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function Drop({
  file, onPick, testId, title, hint, icon: Icon, tall,
}: {
  file: File | null;
  onPick: (f: File | null) => void;
  testId: string;
  title: string;
  hint: string;
  icon: typeof UploadCloud;
  tall?: boolean;
}) {
  const [drag, setDrag] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      data-testid={testId}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); onPick(e.dataTransfer.files?.[0] ?? null); }}
      onClick={() => ref.current?.click()}
      className={cn(
        "relative flex cursor-pointer flex-col items-center justify-center border-2 border-dashed bg-surface p-8 text-center transition-colors",
        tall ? "min-h-[300px]" : "min-h-[190px]",
        drag ? "border-brand bg-surface-2" : "border-hairline hover:border-brand/50",
      )}
    >
      <input ref={ref} type="file" accept="application/pdf,.pdf" className="hidden"
             data-testid={`${testId}-input`} onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      {file ? (
        <>
          <FileText className={cn("text-brand", tall ? "h-12 w-12" : "h-9 w-9")} />
          <p className="mt-3 max-w-full truncate font-heading text-lg font-semibold text-ink" data-testid={`${testId}-filename`}>
            {file.name}
          </p>
          <p className="mt-1 font-mono text-sm text-ink-3">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
          <Button type="button" variant="ghost" size="sm" className="mt-2" data-testid={`${testId}-clear`}
                  onClick={(e) => { e.stopPropagation(); onPick(null); }}>
            <X className="h-3.5 w-3.5" /> Remove
          </Button>
        </>
      ) : (
        <>
          <Icon className={cn("text-ink-3", tall ? "h-12 w-12" : "h-9 w-9")} />
          <p className={cn("mt-3 font-heading font-semibold text-ink", tall ? "text-2xl" : "text-lg")}>{title}</p>
          <p className="mt-2 text-base text-ink-3">{hint}</p>
          <Button type="button" variant="outline" size={tall ? "lg" : "default"} className="mt-5">Choose PDF</Button>
        </>
      )}
    </div>
  );
}

export default function UploadPage() {
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [address, setAddress] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [spec, setSpec] = useState<File | null>(null);
  const { can, planName } = usePlanCaps();
  const canSpec = can(CAP.spec);
  // Spec-first flow: the finish schedule is read (and priced) BEFORE the drawings are measured.
  const [pendingJob, setPendingJob] = useState<Job | null>(null);
  const [specs, setSpecs] = useState<SpecEntry[]>([]);
  const [pricingSaved, setPricingSaved] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const pick = (setter: (f: File | null) => void) => (f: File | null) => {
    if (f && !f.name.toLowerCase().endsWith(".pdf")) {
      toast.error("That needs to be a PDF file");
      return;
    }
    setter(f);
  };

  // Page estimate: count the set and show what it will consume BEFORE we spend any AI
  // budget, so nobody is surprised by what a read costs them.
  const [estimate, setEstimate] = useState<PageEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);

  const pickBlueprint = (f: File | null) => {
    pick(setFile)(f);
    setEstimate(null);
    if (!f || !f.name.toLowerCase().endsWith(".pdf")) return;
    setEstimating(true);
    const form = new FormData();
    form.append("file", f);
    void fetch("/api/jobs/estimate", { method: "POST", body: form, credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? "Could not read that PDF");
        setEstimate((await r.json()) as PageEstimate);
      })
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setEstimating(false));
  };

  const topUp = useMutation({
    mutationFn: (packId: string) =>
      apiPost<CheckoutSession>("/payments/checkout", { plan_id: packId, period: "one_time", origin_url: window.location.origin }),
    onSuccess: (s) => { window.location.href = s.checkout_url; },
    onError: () => toast.error("Could not open the top-up checkout"),
  });

  const ensureJob = async () => {
    if (pendingJob) return pendingJob;
    const job = await apiPost<Job>("/jobs", {
      name: name || file?.name.replace(/\.pdf$/i, "") || spec?.name.replace(/\.pdf$/i, "") || "New takeoff",
      client_name: client, client_email: clientEmail, address,
    });
    setPendingJob(job);
    return job;
  };

  // Step 1 of the spec-first flow — read the schedule on its own, then prompt for pricing.
  const readSpec = useMutation({
    mutationFn: async () => {
      if (!spec) throw new Error("Choose the spec sheet first");
      const job = await ensureJob();
      return uploadFile<SpecReadResult>(`/jobs/${job.id}/spec-sheet`, spec);
    },
    onSuccess: (r) => {
      setSpecs(r.specs);
      setPricingSaved(false);
      toast.success(`Schedule read — ${r.specs.length} flooring product(s) found`);
    },
    onError: () => toast.error("Could not read that spec sheet"),
  });

  const savePricing = useMutation({
    mutationFn: async (items: SpecPriceItem[]) => {
      const job = await ensureJob();
      return apiPut<SpecReadResult>(`/jobs/${job.id}/specs/pricing`, { items, apply_to_lines: true });
    },
    onSuccess: (r) => {
      setSpecs(r.specs);
      setPricingSaved(true);
      toast.success(r.applied_to_lines > 0
        ? `Pricing saved — applied to ${r.applied_to_lines} line(s)`
        : "Pricing saved — it will land on every matching room when the blueprint is read");
    },
    onError: () => toast.error("Could not save that pricing"),
  });

  const run = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a blueprint PDF first");
      const job = await ensureJob();
      // Spec sheet first, drawings second: the products ride into the measuring pass.
      if (spec && specs.length === 0) {
        try {
          const res = await uploadFile<SpecReadResult>(`/jobs/${job.id}/spec-sheet`, spec);
          setSpecs(res.specs);
          toast.success(`Spec sheet read first — ${res.specs.length} product(s) in hand`);
        } catch {
          toast.error("Spec sheet could not be read — measuring without it");
        }
      }
      return uploadFile<Job>(`/jobs/${job.id}/upload`, file);
    },
    onSuccess: (job) => {
      setPendingJob(null);
      void qc.invalidateQueries({ queryKey: ["jobs"] });
      void qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Takeoff ready — review and approve");
      navigate(`/jobs/${job.id}`);
    },
    onError: (e: Error) => {
      // A 402 means the plan ran out of pages/jobs — surface the upgrade message itself.
      const detail = e instanceof ApiError ? (e.body as { detail?: string })?.detail : null;
      toast.error(detail ?? e.message, detail ? { duration: 9000 } : undefined);
    },
  });

  return (
    <Shell title="New takeoff" subtitle="Drop the blueprint in. Add the spec sheet too and we'll match products to rooms.">
      {run.isPending ? (
        <div className="gl-rise">
          <ScanSequence running filename={file?.name ?? "blueprint.pdf"} />
          <Panel className="mt-6 text-center">
            <p className="text-lg text-ink-2" data-testid="upload-progress-note">
              Reading the printed scale and every written dimension. Accuracy over speed — a large set can take a minute or two.
            </p>
            <p className="mt-2 font-mono text-sm text-ink-3">Leave this page open.</p>
          </Panel>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-5">
            <UsageMeter />
            <Drop
              tall file={file} onPick={pickBlueprint} testId="upload-dropzone" icon={UploadCloud}
              title="Drag your blueprint PDF here"
              hint="or click to browse — 100+ page sets are fine"
            />

            {estimating && (
              <p className="flex items-center gap-2 border border-hairline bg-surface px-4 py-3 font-mono text-sm text-ink-3"
                 data-testid="estimate-loading">
                <Loader2 className="h-4 w-4 animate-spin text-brand" /> Counting the set…
              </p>
            )}

            {estimate && (
              <div data-testid="page-estimate"
                   className={cn("border p-5", estimate.fits ? "border-brand/40 bg-surface" : "border-red-500/50 bg-red-500/10")}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-3">
                      <FileSearch className="h-3.5 w-3.5" /> Before we read it
                    </div>
                    <p className="mt-2 font-heading text-2xl font-semibold text-ink" data-testid="estimate-pages">
                      {estimate.pages} page{estimate.pages === 1 ? "" : "s"} · {estimate.size_mb} MB
                    </p>
                    <p className="mt-1 text-[15px] text-ink-2" data-testid="estimate-reason">{estimate.reason}</p>
                  </div>
                  {!estimate.fits && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" className="font-semibold" data-testid="estimate-topup-button"
                              disabled={topUp.isPending} onClick={() => topUp.mutate("topup25")}>
                        25-page top-up · $29
                      </Button>
                      <Link to="/billing" data-testid="estimate-upgrade-link"
                            className={cn(buttonVariants({ size: "sm" }), "font-semibold")}>Upgrade plan</Link>
                    </div>
                  )}
                </div>
                {estimate.pages_included > 0 && (
                  <div className="mt-4 grid grid-cols-3 gap-4 border-t border-hairline pt-4 font-mono">
                    {([["This set", `${estimate.pages} pages`, "estimate-cell-set"],
                       ["Left now", `${estimate.pages_remaining}`, "estimate-cell-now"],
                       ["Left after", `${estimate.pages_after}`, "estimate-cell-after"]] as const).map(([l, v, id]) => (
                      <div key={id}>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3">{l}</div>
                        <div className="mt-0.5 text-lg font-semibold text-ink" data-testid={id}>{v}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-brand" />
                <h2 className="font-heading text-base font-semibold text-ink">
                  Spec sheet / finish schedule <span className="font-normal text-ink-3">(optional)</span>
                </h2>
              </div>
              {!canSpec ? (
                <div className="border border-hairline bg-surface-2 p-6" data-testid="spec-locked-panel">
                  <p className="flex items-center gap-2 font-heading text-base font-semibold text-ink">
                    <Lock className="h-4 w-4 text-brand" /> Spec-sheet reading is Unlimited Pro only
                  </p>
                  <p className="mt-2 text-[15px] text-ink-3">
                    On {planName} you type product names onto each line yourself. Unlimited Pro reads the
                    finish schedule and writes the specified product into every quote and invoice line.
                  </p>
                  <Link to="/billing" data-testid="spec-locked-upgrade"
                        className={cn(buttonVariants({ variant: "outline" }), "mt-4 font-semibold")}>
                    See Unlimited Pro
                  </Link>
                </div>
              ) : (
                <>
              <Drop
                file={spec} onPick={pick(setSpec)} testId="spec-dropzone" icon={ClipboardList}
                title="Add the product schedule"
                hint="We'll read which product goes in which room, including backsplashes"
              />
              {spec && specs.length === 0 && (
                <Button
                  variant="outline" className="mt-3 w-full font-semibold"
                  data-testid="spec-first-button" disabled={readSpec.isPending}
                  onClick={() => readSpec.mutate()}
                >
                  {readSpec.isPending
                    ? (<><Loader2 className="h-4 w-4 animate-spin" /> Reading the schedule…</>)
                    : "Read the spec sheet first & price materials"}
                </Button>
              )}
              {specs.length > 0 && (
                <div className="mt-4">
                  <MaterialPricing
                    specs={specs}
                    saved={pricingSaved}
                    pending={savePricing.isPending}
                    onSave={(items) => savePricing.mutate(items)}
                    onSkip={() => setPricingSaved(true)}
                  />
                </div>
              )}
                </>
              )}
            </div>
          </div>

          <Panel className="h-fit">
            <h2 className="font-heading text-lg font-semibold text-ink">Job details</h2>
            <form className="mt-5 space-y-4" data-testid="upload-form"
                  onSubmit={(e) => { e.preventDefault(); run.mutate(); }}>
              <div className="space-y-2">
                <Label htmlFor="jobname" className="text-ink-2">Job name</Label>
                <Input id="jobname" data-testid="upload-jobname-input" value={name}
                       onChange={(e) => setName(e.target.value)} placeholder="Oakridge Commons — Phase 2" className="h-12 text-base" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client" className="text-ink-2">Client</Label>
                <Input id="client" data-testid="upload-client-input" value={client}
                       onChange={(e) => setClient(e.target.value)} placeholder="Meridian Construction" className="h-12 text-base" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cemail" className="text-ink-2">Client email</Label>
                <Input id="cemail" type="email" data-testid="upload-client-email-input" value={clientEmail}
                       onChange={(e) => setClientEmail(e.target.value)} placeholder="pm@client.com" className="h-12 text-base" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addr" className="text-ink-2">Site address</Label>
                <Input id="addr" data-testid="upload-address-input" value={address}
                       onChange={(e) => setAddress(e.target.value)} className="h-12 text-base" />
              </div>
              <Button type="submit" size="lg" className="w-full font-semibold" data-testid="upload-submit-button"
                      disabled={!file || estimating || (estimate ? !estimate.fits : false)}>
                {run.isPending ? (<><Loader2 className="h-4 w-4 animate-spin" /> Reading…</>)
                  : estimate && !estimate.fits ? "Not enough pages left"
                  : estimate ? `Read ${estimate.pages} page${estimate.pages === 1 ? "" : "s"}`
                  : "Read blueprint"}
              </Button>
              <p className="text-center text-sm text-ink-3">
                You approve every line before anything becomes a quote.
              </p>
            </form>
          </Panel>
        </div>
      )}
    </Shell>
  );
}
