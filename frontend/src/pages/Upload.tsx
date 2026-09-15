import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  UploadCloud, FileText, Loader2, ClipboardList, X, FileSearch, Lock,
  Sparkles, ScanLine, Ruler, Calculator, CheckCircle2,
} from "lucide-react";
import { apiGet, apiPost, apiPut, ApiError } from "@/lib/api";
import { uploadFile } from "@/lib/session";
import type { CheckoutSession, Job, PageEstimate, SpecEntry, SpecPriceItem, SpecReadResult } from "@/lib/types";
import Shell, { Panel } from "@/components/Shell";
import { CAP, usePlanCaps } from "@/lib/plan";
import UsageMeter from "@/components/UsageMeter";
import MaterialPricing from "@/components/MaterialPricing";
import JobQuickCheck from "@/components/JobQuickCheck";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Drop zone (unchanged from current file)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Read progress — fills the wait with real status, cycling through the phases
// the backend actually executes: render → measure → trim → done.
// ---------------------------------------------------------------------------

const READ_PHASES = [
  { icon: ScanLine,    label: "Rendering sheets",    detail: "Converting each page to a high-resolution image" },
  { icon: Ruler,       label: "Reading dimensions",  detail: "Locking the printed scale and every written callout" },
  { icon: Sparkles,    label: "Measuring rooms",     detail: "Building the room-by-room takeoff, unit by unit" },
  { icon: Calculator,  label: "Pricing lines",       detail: "Applying your rates, waste factors and accessory catalogue" },
  { icon: CheckCircle2,label: "Finalising",          detail: "Cross-checking against printed totals and flags" },
];

function ReadProgress({ filename, pageCount }: { filename: string; pageCount: number }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    // Purely visual — advance every ~12s while the real request is in flight.
    // When the response arrives the parent unmounts this and shows the takeoff.
    const t = setInterval(() => setPhase((p) => Math.min(p + 1, READ_PHASES.length - 1)), 12000);
    return () => clearInterval(t);
  }, []);

  const pct = Math.round(((phase + 0.5) / READ_PHASES.length) * 100);

  return (
    <div className="gl-rise">
      {/* The readout */}
      <div className="border border-hairline bg-surface">
        <div className="flex items-center justify-between border-b border-hairline px-6 py-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-3">
            Reading · {filename}
          </span>
          <span className="font-mono text-[11px] text-ink-3">
            {pageCount > 0 ? `${Math.min(pageCount, Math.max(1, Math.round((phase + 1) / READ_PHASES.length * pageCount)))} / ${pageCount}` : ""}
          </span>
        </div>

        {/* Animated scan line across a light grid — the "futuristic readout" */}
        <div className="relative h-[220px] overflow-hidden bg-surface-2">
          <div className="absolute inset-0"
               style={{
                 backgroundImage: "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)",
                 backgroundSize: "28px 28px",
               }} />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-brand/70"
               style={{
                 animation: "scan 3.2s ease-in-out infinite alternate",
                 boxShadow: "0 0 18px 2px rgba(226,249,82,0.35)",
               }} />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-surface" />
          <style>{`
            @keyframes scan {
              from { transform: translateY(0); }
              to   { transform: translateY(218px); }
            }
          `}</style>

          {/* Room outlines appearing one by one — a decorative nod to the takeoff forming */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="grid grid-cols-3 gap-3 opacity-70">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i}
                     className="h-10 w-14 border border-brand/30"
                     style={{
                       opacity: i <= phase * 2 ? 1 : 0.15,
                       transition: "opacity 800ms ease-out",
                     }} />
              ))}
            </div>
          </div>
        </div>

        {/* Phase list */}
        <div className="divide-y divide-hairline">
          {READ_PHASES.map((p, i) => {
            const done = i < phase;
            const active = i === phase;
            const Icon = p.icon;
            return (
              <div key={p.label}
                   className={cn(
                     "flex items-start gap-4 px-6 py-3 transition-colors",
                     active && "bg-brand/5",
                   )}>
                <span className={cn(
                  "mt-0.5 grid h-6 w-6 place-items-center border",
                  done ? "border-brand/60 bg-brand/10 text-brand"
                       : active ? "border-brand text-brand"
                                : "border-hairline text-ink-4",
                )}>
                  {done ? <CheckCircle2 className="h-3.5 w-3.5" />
                        : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                 : <Icon className="h-3.5 w-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("font-heading text-[15px] font-semibold",
                                   done || active ? "text-ink" : "text-ink-3")}>
                    {p.label}
                  </p>
                  <p className="mt-0.5 text-[14px] text-ink-3">{p.detail}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="border-t border-hairline px-6 py-4">
          <div className="h-[3px] w-full bg-surface-2">
            <div className="h-full bg-brand transition-all duration-1000 ease-out"
                 style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-3 text-center font-mono text-[12px] text-ink-3">
            A large set can take a minute or two. You can leave this tab — the read continues on the server.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload page
// ---------------------------------------------------------------------------

export default function UploadPage() {
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [address, setAddress] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [spec, setSpec] = useState<File | null>(null);
  const { can, planName } = usePlanCaps();
  const canSpec = can(CAP.spec);
  const [pendingJob, setPendingJob] = useState<Job | null>(null);
  const [specs, setSpecs] = useState<SpecEntry[]>([]);
  const [pricingSaved, setPricingSaved] = useState(false);
  const [estimate, setEstimate] = useState<PageEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const pick = (setter: (f: File | null) => void) => (f: File | null) => {
    if (f && !f.name.toLowerCase().endsWith(".pdf")) {
      toast.error("That needs to be a PDF file");
      return;
    }
    setter(f);
  };

  const pickBlueprint = (f: File | null) => {
    pick(setFile)(f);
    setEstimate(null);
    if (!f || !f.name.toLowerCase().endsWith(".pdf")) return;
    setEstimating(true);
    void uploadFile<PageEstimate>("/jobs/estimate", f)
      .then((r) => setEstimate(r))
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

  // Ensure the job exists before the quick-check screen shows (it needs a job_id for overrides)
  const [quickCheckJob, setQuickCheckJob] = useState<Job | null>(null);
  const prepareQuickCheck = async () => {
    if (!file) return;
    try {
      const job = await ensureJob();
      setQuickCheckJob(job);
    } catch {
      toast.error("Could not create the job");
    }
  };

  const run = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a blueprint PDF first");
      const job = quickCheckJob ?? (await ensureJob());
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
      setQuickCheckJob(null);
      void qc.invalidateQueries({ queryKey: ["jobs"] });
      void qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Takeoff ready — review and approve");
      navigate(`/jobs/${job.id}`);
    },
    onError: (e: Error) => {
      const detail = e instanceof ApiError ? (e.body as { detail?: string })?.detail : null;
      toast.error(detail ?? e.message, detail ? { duration: 9000 } : undefined);
    },
  });

  const isReading = run.isPending;

  return (
    <Shell title="New takeoff" subtitle="Drop the blueprint in. Add the spec sheet too and we'll match products to rooms.">
      {isReading ? (
        <ReadProgress filename={file?.name ?? "blueprint.pdf"} pageCount={estimate?.pages ?? 0} />
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

            {/* Per-job quick-check — appears once a PDF is picked and fits */}
            {file && estimate?.fits && quickCheckJob && (
              <JobQuickCheck jobId={quickCheckJob.id} onReady={() => run.mutate()} />
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
                  onSubmit={(e) => { e.preventDefault(); void prepareQuickCheck(); }}>
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
                {estimating ? "Counting the set…"
                  : estimate && !estimate.fits ? "Not enough pages left"
                  : estimate ? `Continue — ${estimate.pages} page${estimate.pages === 1 ? "" : "s"}`
                  : "Continue"}
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