import { useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle, Check, Plus, Trash2, FileSignature, Send, Ruler, ClipboardList,
  Copy, GitCompare, FileDown, Sliders, Layers, Link2, Repeat, Lock, Eye,
} from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from "@/lib/api";
import { uploadFile } from "@/lib/session";
import type {
  Invoice, Job, JobCosting, PayIntent, Quote, QuoteDiff, ReferenceOptions,
  SendOut, Settings, SpecReadResult, TakeoffLine, UnitTemplate,
} from "@/lib/types";
import { FLOOR_TYPES, SCOPE_LABELS, SCOPE_SHORT, money, num } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { CAP, usePlanCaps } from "@/lib/plan";
import Shell, { Panel, StatusBadge } from "@/components/Shell";
import DocLineEditor, { type DocLinePatch } from "@/components/DocLineEditor";
import ProductLibraryDialog from "@/components/ProductLibraryDialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const PDF_TEMPLATES = [
  { id: "contractor_clean", label: "Contractor Clean" },
  { id: "technical_readout", label: "Technical Readout" },
  { id: "classic_professional", label: "Classic Professional" },
];

function EditNum({ value, onCommit, testId, suffix, disabled }: {
  value: number; onCommit: (v: number) => void; testId: string; suffix?: string; disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  if (disabled) return <div className="px-2 py-1.5 text-right font-mono text-base text-ink-4">—</div>;
  if (!editing) {
    return (
      <button
        type="button"
        data-testid={testId}
        onClick={() => { setDraft(String(value)); setEditing(true); }}
        className="w-full rounded-sm px-2 py-1.5 text-right font-mono text-base font-semibold text-ink transition-colors hover:bg-brand-soft hover:text-brand"
      >
        {num(value, value % 1 === 0 ? 0 : 2)}{suffix}
      </button>
    );
  }
  return (
    <Input
      autoFocus type="number" step="0.01" data-testid={`${testId}-input`} value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); const n = parseFloat(draft); if (!Number.isNaN(n) && n !== value) onCommit(n); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(false); }}
      className="h-10 text-right font-mono text-base"
    />
  );
}

export default function Takeoff() {
  const { jobId = "" } = useParams();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { can, planName } = usePlanCaps();
  const canEdit = (user?.role ?? "owner") !== "viewer" && can(CAP.edit);
  const canPdf = can(CAP.pdf);
  const canQuote = canEdit && can(CAP.quote);
  const canInvoice = canEdit && can(CAP.invoice);
  const canSpec = canEdit && can(CAP.spec);

  const [discount, setDiscount] = useState(0);
  const [taxRate, setTaxRate] = useState<number | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [pdfTemplate, setPdfTemplate] = useState("contractor_clean");
  const [diffAgainst, setDiffAgainst] = useState<string | null>(null);
  const [tplName, setTplName] = useState("");
  const [tplUnitSource, setTplUnitSource] = useState("");
  const [applyTplId, setApplyTplId] = useState("");
  const [applyBuilding, setApplyBuilding] = useState("");
  const [applyUnits, setApplyUnits] = useState("");
  const specRef = useRef<HTMLInputElement>(null);

  const job = useQuery<Job>({ queryKey: ["job", jobId], queryFn: () => apiGet<Job>(`/jobs/${jobId}`), retry: false });
  const lines = useQuery<TakeoffLine[]>({ queryKey: ["lines", jobId], queryFn: () => apiGet<TakeoffLine[]>(`/jobs/${jobId}/lines`), retry: false });
  const quotes = useQuery<Quote[]>({ queryKey: ["quotes", jobId], queryFn: () => apiGet<Quote[]>(`/jobs/${jobId}/quotes`), retry: false });
  const settings = useQuery<Settings>({ queryKey: ["settings"], queryFn: () => apiGet<Settings>("/settings"), retry: false });
  const costing = useQuery<JobCosting>({ queryKey: ["costing", jobId], queryFn: () => apiGet<JobCosting>(`/jobs/${jobId}/costing`), retry: false });
  const templates = useQuery<UnitTemplate[]>({ queryKey: ["unit-templates"], queryFn: () => apiGet<UnitTemplate[]>("/unit-templates"), retry: false });
  const refOpts = useQuery<ReferenceOptions>({ queryKey: ["reference"], queryFn: () => apiGet<ReferenceOptions>("/reference/options"), retry: false });

  const refresh = () => {
    for (const key of [["lines", jobId], ["job", jobId], ["quotes", jobId], ["costing", jobId], ["jobs"], ["invoices"], ["stats"], ["unit-templates"]]) {
      void qc.invalidateQueries({ queryKey: key });
    }
  };
  const fail = (e: unknown, fallback: string) => {
    const detail = e instanceof ApiError ? (e.body as { detail?: string })?.detail : null;
    toast.error(detail ?? fallback);
  };

  const patch = useMutation({
    mutationFn: (p: { id: string; body: Record<string, unknown> }) => apiPatch<TakeoffLine>(`/lines/${p.id}`, p.body),
    onSuccess: refresh,
    onError: (e) => fail(e, "Could not save that change"),
  });
  const addLine = useMutation({
    mutationFn: (misc: boolean) => apiPost<TakeoffLine>(`/jobs/${jobId}/lines`, misc
      ? { building: "Building A", unit: "Main", room: "Floor prep / grinding", scope: "misc", flat_cost: 250 }
      : { building: "Building A", unit: "Main", room: "New Room", scope: "supply_install", floor_type: "Luxury Vinyl Plank", sqft: 100 }),
    onSuccess: () => { refresh(); toast.success("Line added"); },
    onError: (e) => fail(e, "Could not add a line"),
  });
  const delLine = useMutation({
    mutationFn: (id: string) => apiDelete(`/lines/${id}`),
    onSuccess: () => { refresh(); toast.success("Line removed"); },
    onError: (e) => fail(e, "Could not remove that line"),
  });
  const approveAll = useMutation({
    mutationFn: () => apiPost<TakeoffLine[]>(`/jobs/${jobId}/approve-all`),
    onSuccess: () => { refresh(); toast.success("All lines approved"); },
    onError: (e) => fail(e, "Could not approve"),
  });
  const makeQuote = useMutation({
    mutationFn: () => apiPost<Quote>(`/jobs/${jobId}/quotes`, { discount_pct: discount, tax_rate: taxRate }),
    onSuccess: (q) => { refresh(); toast.success(`Quote ${q.number} created (revision ${q.revision})`); },
    onError: (e) => fail(e, "Add and approve some lines first"),
  });
  const [editQuoteId, setEditQuoteId] = useState<string | null>(null);
  // Inline quote PDF — see the client's copy before emailing it.
  const [previewQuoteId, setPreviewQuoteId] = useState<string | null>(null);
  const editQuoteLine = useMutation({
    mutationFn: ({ quoteId, lineId, patch }: { quoteId: string; lineId: string; patch: DocLinePatch }) =>
      apiPatch<Quote>(`/quotes/${quoteId}/lines/${lineId}`, patch),
    onSuccess: (q) => { refresh(); toast.success(`${q.number} re-totalled — ${money(q.total)}`); },
    onError: (e) => fail(e, "Could not change that quote line"),
  });

  const sendChangeOrder = useMutation({
    mutationFn: ({ quoteId, against }: { quoteId: string; against: string }) =>
      apiPost<SendOut>(`/quotes/${quoteId}/change-order/send?against=${against}`),
    onSuccess: (r) => { refresh(); toast.success(r.message); },
    onError: (e) => fail(e, "Could not email that change order"),
  });

  const sendQuote = useMutation({
    mutationFn: (id: string) => apiPost<SendOut>(`/quotes/${id}/send`),
    onSuccess: (r) => { refresh(); toast.success(r.message); },
    onError: (e) => fail(e, "Could not email that quote"),
  });
  const acceptQuote = useMutation({
    mutationFn: (id: string) => apiPost<Quote>(`/quotes/${id}/accept`),
    onSuccess: () => { refresh(); toast.success("Quote marked accepted"); },
    onError: (e) => fail(e, "Could not accept"),
  });
  const toInvoice = useMutation({
    mutationFn: (id: string) => apiPost<Invoice>(`/quotes/${id}/invoice`),
    onSuccess: (inv) => { refresh(); toast.success(`Invoice ${inv.number} created`); },
    onError: (e) => fail(e, "Accept the quote before invoicing"),
  });
  const specUpload = useMutation({
    mutationFn: (f: File) => uploadFile<SpecReadResult>(`/jobs/${jobId}/spec-sheet`, f),
    onSuccess: (r) => {
      refresh();
      toast.success(`${r.specs.length} product(s) read — applied to ${r.applied_to_lines} line(s)`);
    },
    onError: (e) => fail(e, "Could not read that spec sheet"),
  });
  const reapply = useMutation({
    mutationFn: () => apiPost<SpecReadResult>(`/jobs/${jobId}/specs/reapply`),
    onSuccess: (r) => { refresh(); toast.success(`Specs re-applied to ${r.applied_to_lines} line(s)`); },
    onError: (e) => fail(e, "No spec sheet on this job yet"),
  });
  const saveTpl = useMutation({
    mutationFn: () => {
      const [building, unit] = tplUnitSource.split("|||");
      return apiPost<UnitTemplate>(`/unit-templates?job_id=${jobId}`, { name: tplName, building, unit });
    },
    onSuccess: (t) => { refresh(); setTplName(""); toast.success(`Saved template “${t.name}”`); },
    onError: (e) => fail(e, "Could not save that unit as a template"),
  });
  const applyTpl = useMutation({
    mutationFn: () => apiPost<TakeoffLine[]>(`/unit-templates/${applyTplId}/apply`, {
      job_id: jobId, building: applyBuilding || "Building A",
      units: applyUnits.split(",").map((u) => u.trim()).filter(Boolean),
      replace_existing: false,
    }),
    onSuccess: () => { refresh(); setApplyUnits(""); toast.success("Template applied"); },
    onError: (e) => fail(e, "Could not apply that template"),
  });

  const rows = lines.data ?? [];
  const grouped = useMemo(() => {
    const map = new Map<string, TakeoffLine[]>();
    for (const line of rows) {
      const key = `${line.building} › ${line.unit}`;
      map.set(key, [...(map.get(key) ?? []), line]);
    }
    return [...map.entries()];
  }, [rows]);
  const unitKeys = useMemo(
    () => [...new Set(rows.map((r) => `${r.building}|||${r.unit}`))],
    [rows],
  );

  const subtotal = rows.reduce((a, b) => a + b.cost, 0);
  const effTax = taxRate ?? settings.data?.tax_rate ?? 0;
  const discAmt = (subtotal * discount) / 100;
  const taxAmt = ((subtotal - discAmt) * effTax) / 100;
  const grand = subtotal - discAmt + taxAmt;
  const totalSqft = rows.reduce((a, b) => a + b.sqft, 0);
  const totalGal = rows.reduce((a, b) => a + b.adhesive_gallons, 0);
  const flagged = rows.filter((r) => r.needs_review).length;
  const quoteList = quotes.data ?? [];
  const latest = quoteList[0];

  const diff = useQuery<QuoteDiff>({
    queryKey: ["diff", latest?.id, diffAgainst],
    enabled: Boolean(latest?.id && diffAgainst),
    queryFn: () => apiGet<QuoteDiff>(`/quotes/${latest!.id}/diff?against=${diffAgainst}`),
    retry: false,
  });

  const pdfUrl = (path: string) => `/api${path}${path.includes("?") ? "&" : "?"}template=${pdfTemplate}`;

  return (
    <Shell
      title={job.data?.name ?? "Takeoff"}
      subtitle={job.data ? `${job.data.client_name || "No client"} · ${job.data.filename || "no file"} · ${job.data.pages} page(s)` : "Loading job…"}
      action={
        <div className="flex flex-wrap items-center gap-2">
          {job.data && <StatusBadge status={job.data.status} testId="takeoff-job-status" />}
          <Select value={pdfTemplate} onValueChange={(v: string) => setPdfTemplate(v)}>
            <SelectTrigger className="h-10 w-[190px]" data-testid="pdf-template-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(refOpts.data?.pdf_templates ?? PDF_TEMPLATES).map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canPdf ? (
            <a
              href={pdfUrl(`/jobs/${jobId}/takeoff.pdf`)} target="_blank" rel="noreferrer"
              data-testid="takeoff-pdf-button"
              className={cn(buttonVariants({ variant: "outline" }), "gap-2")}
            >
              <FileDown className="h-4 w-4" /> Takeoff PDF
            </a>
          ) : (
            <Link to="/billing" data-testid="takeoff-pdf-locked"
                  className={cn(buttonVariants({ variant: "outline" }), "gap-2 text-ink-3")}>
              <Lock className="h-4 w-4" /> PDF export — upgrade
            </Link>
          )}
        </div>
      }
    >
      {/* AI brief */}
      <Panel className="gl-rise">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-brand">AI read brief</p>
            <p className="mt-3 text-lg leading-relaxed text-ink-2" data-testid="takeoff-brief">
              {job.data?.brief || "Upload a blueprint to generate a brief."}
            </p>
            {job.data?.cross_check_note && (
              <p className="mt-3 text-sm text-ink-3" data-testid="takeoff-crosscheck">{job.data.cross_check_note}</p>
            )}
            {job.data?.index_variance && (
              <p className="mt-3 border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-200"
                 data-testid="takeoff-index-variance">
                Index sheet vs measured — {job.data.index_variance}
              </p>
            )}
            {((job.data?.doors ?? 0) > 0 || (job.data?.steps ?? 0) > 0) && (
              <p className="mt-3 font-mono text-sm text-ink-3" data-testid="takeoff-accessory-counts">
                Counted from the plans: {job.data?.doors ?? 0} door opening(s) → transition strips ·{" "}
                {job.data?.steps ?? 0} step(s) → stair nosings
              </p>
            )}
            {job.data?.scale && (
              <p className="mt-3 inline-flex items-center gap-2 font-mono text-sm text-ink-3">
                <Ruler className="h-4 w-4 text-brand" /> Printed scale: {job.data.scale}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 font-mono sm:grid-cols-4">
            {[["Buildings", job.data?.buildings ?? 0], ["Units", job.data?.units ?? 0], ["Bedrooms", job.data?.bedrooms ?? 0], ["Bathrooms", job.data?.bathrooms ?? 0]].map(([l, v]) => (
              <div key={String(l)}>
                <div className="text-[11px] uppercase tracking-[0.18em] text-ink-3">{l}</div>
                <div className="mt-1 text-2xl font-semibold text-ink" data-testid={`brief-${String(l).toLowerCase()}`}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        {(job.data?.flags.length ?? 0) > 0 && (
          <div className="mt-5 space-y-2" data-testid="takeoff-flags">
            {job.data?.flags.map((f) => (
              <p key={f} className="flex items-start gap-2 border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{f}
              </p>
            ))}
          </div>
        )}
      </Panel>

      {/* summary strip */}
      <div className="mt-6 grid gap-px border border-hairline/80 bg-hairline/60 sm:grid-cols-4">
        {[
          ["Lines", num(rows.length), "takeoff-count"],
          ["Total sq ft", num(totalSqft, 1), "takeoff-sqft"],
          ["Adhesive (gal)", num(totalGal, 1), "takeoff-gallons"],
          ["Flagged", num(flagged), "takeoff-flagged"],
        ].map(([l, v, id]) => (
          <div key={l} className="bg-surface px-5 py-4">
            <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">{l}</div>
            <div className="mt-1 font-mono text-2xl font-semibold text-ink" data-testid={id}>{v}</div>
          </div>
        ))}
      </div>

      {/* spec sheet + advanced tools */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-ink">
                <ClipboardList className="h-4 w-4 text-brand" /> Spec sheet / finish schedule
              </h2>
              <p className="mt-2 text-[15px] text-ink-3" data-testid="spec-status">
                {job.data?.spec_filename
                  ? `${job.data.spec_filename} — ${(job.data.specs ?? []).length} product mapping(s) on file`
                  : "No spec sheet yet. Add one and we'll put the specified product on each matching room."}
              </p>
              {job.data?.spec_brief && <p className="mt-2 text-sm text-ink-3">{job.data.spec_brief}</p>}
            </div>
            {canSpec ? (
              <div className="flex shrink-0 gap-2">
                <input ref={specRef} type="file" accept="application/pdf,.pdf" className="hidden"
                       data-testid="spec-file-input"
                       onChange={(e) => { const f = e.target.files?.[0]; if (f) specUpload.mutate(f); }} />
                <Button variant="outline" data-testid="spec-upload-button" disabled={specUpload.isPending}
                        onClick={() => specRef.current?.click()}>
                  {specUpload.isPending ? "Reading…" : "Add spec sheet"}
                </Button>
                {(job.data?.specs ?? []).length > 0 && (
                  <Button variant="ghost" data-testid="spec-reapply-button" onClick={() => reapply.mutate()}>
                    Re-apply
                  </Button>
                )}
              </div>
            ) : (
              <Link to="/billing" data-testid="spec-upload-locked"
                    className={cn(buttonVariants({ variant: "outline" }), "shrink-0 gap-2 text-ink-3")}>
                <Lock className="h-4 w-4" /> Spec-sheet reading is Unlimited Pro only
              </Link>
            )}
          </div>
          {(job.data?.specs ?? []).length > 0 && (
            <div className="mt-4 max-h-44 space-y-1.5 overflow-y-auto" data-testid="spec-list">
              {(job.data?.specs ?? []).map((sp, i) => (
                <div key={`${sp.room_pattern}-${i}`} className="flex items-start justify-between gap-3 border-l-2 border-brand/40 bg-surface-2 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs text-brand">{sp.room_pattern}{sp.surface === "wall" ? " (wall)" : ""}</div>
                    <div className="truncate text-sm text-ink-2">{sp.product || sp.floor_type}</div>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-ink-3">{sp.floor_type}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel>
          <div className="flex items-center justify-between gap-4">
            <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-ink">
              <Layers className="h-4 w-4 text-brand" /> Unit templates
            </h2>
            <span className="font-mono text-xs text-ink-3">{(templates.data ?? []).length} saved</span>
          </div>
          {canEdit ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-ink-2">Save a unit as a template</Label>
                <Select value={tplUnitSource} onValueChange={(v: string) => setTplUnitSource(v)}>
                  <SelectTrigger className="h-11" data-testid="tpl-source-select">
                    <SelectValue placeholder="Pick a unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {unitKeys.map((k) => (
                      <SelectItem key={k} value={k}>{k.replace("|||", " › ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input placeholder="Template name e.g. Type A 1bd/1ba" value={tplName} className="h-11"
                       data-testid="tpl-name-input" onChange={(e) => setTplName(e.target.value)} />
                <Button variant="outline" className="w-full" data-testid="tpl-save-button"
                        disabled={!tplName || !tplUnitSource || saveTpl.isPending} onClick={() => saveTpl.mutate()}>
                  <Copy className="h-4 w-4" /> Save template
                </Button>
              </div>
              <div className="space-y-2">
                <Label className="text-ink-2">Apply to matching units</Label>
                <Select value={applyTplId} onValueChange={(v: string) => setApplyTplId(v)}>
                  <SelectTrigger className="h-11" data-testid="tpl-apply-select">
                    <SelectValue placeholder="Pick a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {(templates.data ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name} ({t.lines.length} lines)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input placeholder="Building (e.g. Building B)" value={applyBuilding} className="h-11"
                       data-testid="tpl-building-input" onChange={(e) => setApplyBuilding(e.target.value)} />
                <Input placeholder="Units, comma separated: 201, 202, 203" value={applyUnits} className="h-11"
                       data-testid="tpl-units-input" onChange={(e) => setApplyUnits(e.target.value)} />
                <Button className="w-full font-semibold" data-testid="tpl-apply-button"
                        disabled={!applyTplId || !applyUnits || applyTpl.isPending} onClick={() => applyTpl.mutate()}>
                  <Plus className="h-4 w-4" /> Apply to units
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-[15px] text-ink-3">Your role is read-only.</p>
          )}
        </Panel>
      </div>

      {/* line items */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-xl font-semibold text-ink">Line items — tap any number to edit</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" data-testid="advanced-toggle" onClick={() => setAdvanced((a) => !a)}>
            <Sliders className="h-4 w-4" /> {advanced ? "Hide advanced" : "Advanced"}
          </Button>
          {canEdit && (
            <>
              <Button variant="outline" data-testid="takeoff-add-line-button" onClick={() => addLine.mutate(false)}>
                <Plus className="h-4 w-4" /> Add room
              </Button>
              <Button variant="outline" data-testid="takeoff-add-misc-button" onClick={() => addLine.mutate(true)}>
                <Plus className="h-4 w-4" /> Add misc / prep
              </Button>
              <Button data-testid="takeoff-approve-all-button" onClick={() => approveAll.mutate()} className="font-semibold">
                <Check className="h-4 w-4" /> Approve all
              </Button>
            </>
          )}
        </div>
      </div>

      {advanced && (
        <Panel className="mt-3">
          <p className="text-[15px] text-ink-2">
            <b>Scope</b> decides what gets billed on a line: <b>Supply &amp; Install</b> charges material + labor,
            <b> Install Only</b> charges labor alone (the GC supplies the material), <b>Supply Only</b> charges material
            alone, and <b>Miscellaneous</b> is a flat price for prep, leveling, demo, trims or cove base.
            Adhesive gallons are always computed from the square footage after waste.
          </p>
        </Panel>
      )}

      {rows.length === 0 && (
        <Panel className="mt-4 text-center">
          <p className="text-ink-2" data-testid="takeoff-empty">No takeoff lines yet. Upload a blueprint or add a line manually.</p>
        </Panel>
      )}

      <div className="mt-4 space-y-8" data-testid="takeoff-groups">
        {grouped.map(([group, items]) => (
          <div key={group} className="border border-hairline/80 bg-surface">
            <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
              <h3 className="font-mono text-sm uppercase tracking-[0.18em] text-brand">{group}</h3>
              <span className="font-mono text-sm text-ink-3">{money(items.reduce((a, b) => a + b.cost, 0))}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-left">
                <thead>
                  <tr className="border-b border-hairline font-mono text-[11px] uppercase tracking-wider text-ink-3">
                    <th className="px-4 py-3">Room</th>
                    <th className="px-3 py-3">Scope</th>
                    <th className="px-4 py-3">Floor / item</th>
                    <th className="px-3 py-3 text-right">Sq ft / qty</th>
                    <th className="px-3 py-3 text-right">Waste %</th>
                    {advanced && <th className="px-4 py-3">Adhesive</th>}
                    {advanced && <th className="px-3 py-3 text-right">Gal</th>}
                    <th className="px-3 py-3 text-right">$/sf or ea</th>
                    <th className="px-3 py-3 text-right">Labor hr</th>
                    <th className="px-3 py-3 text-right">Cost</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((l) => {
                    const misc = l.scope === "misc";
                    const acc = l.scope === "accessory";
                    return (
                      <tr key={l.id} data-testid={`line-row-${l.id}`}
                          className={cn("border-b border-hairline/60 align-middle", l.needs_review && "bg-amber-500/5")}>
                        <td className="px-4 py-3">
                          <div className="text-base font-medium text-ink" data-testid={`line-room-${l.id}`}>{l.room}</div>
                          {l.product
                            ? <div className="mt-0.5 max-w-[240px] truncate font-mono text-[11px] font-semibold text-brand" title={l.product} data-testid={`line-product-${l.id}`}>{l.product}</div>
                            : l.scope !== "misc" && l.scope !== "accessory"
                              ? <div className="mt-0.5 font-mono text-[11px] text-amber-300" data-testid={`line-product-missing-${l.id}`}>no specified product — add the brand</div>
                              : null}
                          {canEdit && l.scope !== "misc" && (
                            <ProductLibraryDialog line={l} onApplied={refresh} />
                          )}
                          {l.product_alt && canEdit && (
                            <button
                              type="button"
                              data-testid={`line-alt-swap-${l.id}`}
                              title={`Swap to ${l.product_alt}`}
                              onClick={() => patch.mutate({ id: l.id, body: { product: l.product_alt, product_alt: l.product } })}
                              className="mt-1 inline-flex max-w-[220px] items-center gap-1 truncate border border-hairline px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-3 transition-colors hover:border-brand/50 hover:text-brand"
                            >
                              <Repeat className="h-3 w-3 shrink-0" /> alt: {l.product_alt}
                            </button>
                          )}
                          {l.needs_review && (
                            <span className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-amber-300">
                              <AlertTriangle className="h-3 w-3" /> review
                            </span>
                          )}
                          {l.approved && <span className="mt-1 ml-2 inline-flex font-mono text-[11px] uppercase tracking-wider text-emerald-400">approved</span>}
                        </td>
                        <td className="px-3 py-3">
                          {canEdit ? (
                            <Select value={l.scope} onValueChange={(v: string) => patch.mutate({ id: l.id, body: { scope: v } })}>
                              <SelectTrigger className="h-10 w-[150px]" data-testid={`line-scope-${l.id}`}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Object.entries(SCOPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="font-mono text-xs text-ink-3" data-testid={`line-scope-${l.id}`}>{SCOPE_SHORT[l.scope]}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {acc ? (
                            <span className="font-mono text-xs uppercase tracking-wider text-ink-3" data-testid={`line-floortype-${l.id}`}>
                              counted pieces
                            </span>
                          ) : misc ? (
                            <span className="font-mono text-xs uppercase tracking-wider text-ink-3" data-testid={`line-floortype-${l.id}`}>flat price</span>
                          ) : canEdit ? (
                            <Select value={l.floor_type} onValueChange={(v: string) => patch.mutate({ id: l.id, body: { floor_type: v } })}>
                              <SelectTrigger className="h-10 w-[180px]" data-testid={`line-floortype-${l.id}`}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {(refOpts.data?.floor_types ?? FLOOR_TYPES).map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-sm text-ink-2" data-testid={`line-floortype-${l.id}`}>{l.floor_type}</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {acc ? (
                            <EditNum testId={`line-qty-${l.id}`} value={l.qty} disabled={!canEdit}
                                     onCommit={(v) => patch.mutate({ id: l.id, body: { qty: v } })} />
                          ) : (
                            <EditNum testId={`line-sqft-${l.id}`} value={l.sqft} disabled={misc || !canEdit}
                                     onCommit={(v) => patch.mutate({ id: l.id, body: { sqft: v } })} />
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <EditNum testId={`line-waste-${l.id}`} value={l.waste_pct} suffix="%" disabled={misc || acc || !canEdit}
                                   onCommit={(v) => patch.mutate({ id: l.id, body: { waste_pct: v } })} />
                        </td>
                        {advanced && (
                          <td className="px-4 py-3 text-sm text-ink-3" data-testid={`line-adhesive-${l.id}`}>{l.adhesive || "—"}</td>
                        )}
                        {advanced && (
                          <td className="px-3 py-3 text-right font-mono text-base text-ink-2" data-testid={`line-gallons-${l.id}`}>
                            {misc ? "—" : num(l.adhesive_gallons, 2)}
                          </td>
                        )}
                        <td className="px-3 py-3">
                          {acc ? (
                            <EditNum testId={`line-unitprice-${l.id}`} value={l.unit_price} disabled={!canEdit}
                                     onCommit={(v) => patch.mutate({ id: l.id, body: { unit_price: v } })} />
                          ) : (
                            <EditNum testId={`line-rate-${l.id}`} value={l.material_cost_per_sqft} disabled={misc || l.scope === "install_only" || !canEdit}
                                     onCommit={(v) => patch.mutate({ id: l.id, body: { material_cost_per_sqft: v } })} />
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <EditNum testId={`line-hours-${l.id}`} value={l.labor_hours} disabled={misc || (!acc && l.scope === "supply_only") || !canEdit}
                                   onCommit={(v) => patch.mutate({ id: l.id, body: { labor_hours: v } })} />
                        </td>
                        <td className="px-3 py-3">
                          {misc && canEdit ? (
                            <EditNum testId={`line-flat-${l.id}`} value={l.flat_cost}
                                     onCommit={(v) => patch.mutate({ id: l.id, body: { flat_cost: v } })} />
                          ) : (
                            <div className="text-right font-mono text-base font-semibold text-brand" data-testid={`line-cost-${l.id}`}>
                              {money(l.cost)}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {canEdit && (
                            <Button variant="ghost" size="icon-sm" data-testid={`line-delete-${l.id}`} onClick={() => delLine.mutate(l.id)}>
                              <Trash2 className="h-4 w-4 text-ink-3" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* bid vs actual */}
      {costing.data && (
        <Panel className="mt-8">
          <h2 className="font-heading text-lg font-semibold text-ink">Bid vs actual</h2>
          <div className="mt-4 grid gap-px border border-hairline/80 bg-hairline/60 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Quoted", money(costing.data.quoted_total), "costing-quoted"],
              ["Material in bid", money(costing.data.quoted_material), "costing-material"],
              ["Labor in bid", money(costing.data.quoted_labor), "costing-labor"],
              ["Actual spend", money(costing.data.actual_expenses), "costing-actual"],
              [`Margin ${costing.data.margin_pct}%`, money(costing.data.variance), "costing-variance"],
            ].map(([l, v, id]) => (
              <div key={l} className="bg-surface px-5 py-4">
                <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">{l}</div>
                <div className={cn("mt-1 font-mono text-xl font-semibold",
                  id === "costing-variance" ? (costing.data.variance >= 0 ? "text-brand" : "text-red-400") : "text-ink")}
                  data-testid={id}>{v}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-ink-3">
            Actual spend counts the {costing.data.expense_count} expense(s) tagged to this job on the Profit page.
          </p>
        </Panel>
      )}

      {/* totals + quote */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_420px]">
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-semibold text-ink">Quote history</h2>
            {quoteList.length > 1 && (
              <Dialog>
                <DialogTrigger
                  data-testid="diff-open-button"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
                  onClick={() => setDiffAgainst(quoteList[1]?.id ?? null)}
                >
                  <GitCompare className="h-4 w-4" /> Compare revisions
                </DialogTrigger>
                <DialogContent className="max-w-3xl">
                  <DialogHeader><DialogTitle>What changed between revisions</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-sm text-ink-3">Compare {latest?.number} against</span>
                      <Select value={diffAgainst ?? ""} onValueChange={(v: string) => setDiffAgainst(v)}>
                        <SelectTrigger className="h-10 w-[240px]" data-testid="diff-against-select"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {quoteList.slice(1).map((q) => (
                            <SelectItem key={q.id} value={q.id}>{q.number} (rev {q.revision})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {diff.data && diffAgainst && (
                      <Button
                        size="sm" variant="ghost" data-testid="change-order-send-button"
                        disabled={sendChangeOrder.isPending}
                        onClick={() => sendChangeOrder.mutate({ quoteId: latest!.id, against: diffAgainst })}
                      >
                        <Send className="h-3.5 w-3.5" />
                        {sendChangeOrder.isPending ? "Sending…" : "Email for e-sign"}
                      </Button>
                    )}
                    {diff.data && diffAgainst && (
                      <a
                        href={pdfUrl(`/quotes/${latest!.id}/change-order.pdf?against=${diffAgainst}`)}
                        target="_blank" rel="noreferrer"
                        data-testid="change-order-pdf-link"
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "font-semibold")}
                      >
                        <FileDown className="h-3.5 w-3.5" /> Change order PDF for sign-off
                      </a>
                    )}
                    {diff.data && (
                      <>
                        <div className="grid grid-cols-3 gap-px border border-hairline bg-hairline/60">
                          {[
                            [`Rev ${diff.data.from_revision}`, money(diff.data.from_total), "diff-from-total"],
                            [`Rev ${diff.data.to_revision}`, money(diff.data.to_total), "diff-to-total"],
                            ["Change", `${diff.data.delta >= 0 ? "+" : ""}${money(diff.data.delta)}`, "diff-delta"],
                          ].map(([l, v, id]) => (
                            <div key={l} className="bg-surface px-4 py-3">
                              <div className="font-mono text-[11px] uppercase tracking-widest text-ink-3">{l}</div>
                              <div className={cn("mt-1 font-mono text-lg font-semibold",
                                id === "diff-delta" ? (diff.data.delta >= 0 ? "text-brand" : "text-red-400") : "text-ink")}
                                data-testid={id}>{v}</div>
                            </div>
                          ))}
                        </div>
                        <div className="max-h-[360px] space-y-1.5 overflow-y-auto" data-testid="diff-lines">
                          {(() => {
                            const moved = diff.data.lines.filter((l) => l.change !== "unchanged");
                            const biggest = moved.reduce((m, l) => Math.max(m, Math.abs(l.delta)), 0);
                            return moved.map((l) => (
                            <div key={l.key} data-testid={`diff-row-${l.change}`}
                                 className={cn("border bg-surface-2 px-3 py-2",
                                   Math.abs(l.delta) === biggest && biggest > 0
                                     ? "border-brand/60 shadow-[0_0_0_1px_rgba(var(--t-glow),0.25)]"
                                     : "border-hairline")}>
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate text-[15px] text-ink">{l.room}</div>
                                  <div className="truncate font-mono text-[11px] text-ink-3">{l.building} › {l.unit}</div>
                                </div>
                                <div className="flex items-center gap-3 font-mono text-sm">
                                  {Math.abs(l.delta) === biggest && biggest > 0 && (
                                    <span className="border border-brand/50 bg-brand-soft px-2 py-0.5 text-[10px] uppercase tracking-widest text-brand"
                                          data-testid="diff-biggest-mover">biggest mover</span>
                                  )}
                                  <span className={cn("uppercase tracking-widest text-[11px]",
                                    l.change === "added" ? "text-emerald-400" : l.change === "removed" ? "text-red-400" : "text-amber-300")}>
                                    {l.change}
                                  </span>
                                  <span className="text-ink-3">{money(l.old_cost)}</span>
                                  <span className="text-ink-4">→</span>
                                  <span className="font-semibold text-ink">{money(l.new_cost)}</span>
                                  <span className={cn("font-semibold", l.delta >= 0 ? "text-brand" : "text-red-400")}
                                        data-testid={`diff-delta-${l.key}`}>
                                    {l.delta >= 0 ? "+" : "−"}{money(Math.abs(l.delta))}
                                  </span>
                                </div>
                              </div>
                              {l.changes.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5" data-testid={`diff-fields-${l.key}`}>
                                  {l.changes.map((c) => (
                                    <span key={c.field}
                                          className="border border-hairline bg-surface px-2 py-0.5 font-mono text-[11px] text-ink-2">
                                      {c.field}: <span className="text-ink-4 line-through">{c.before}</span>{" "}
                                      <span className="text-brand">{c.after}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            ));
                          })()}
                          {diff.data.lines.every((l) => l.change === "unchanged") && (
                            <p className="text-ink-3" data-testid="diff-no-changes">No line changed between these revisions.</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {quoteList.length === 0 && <p className="mt-3 text-ink-3" data-testid="quote-history-empty">No quote yet. Create one from the approved lines.</p>}
          <div className="mt-4 space-y-3" data-testid="quote-history">
            {quoteList.map((q) => (
              <div key={q.id} data-testid={`quote-row-${q.id}`} className="flex flex-wrap items-center justify-between gap-3 border border-hairline bg-surface-2 px-4 py-3">
                <div>
                  <div className="font-mono text-base text-ink">{q.number}</div>
                  <div className="font-mono text-xs text-ink-3">Revision {q.revision} · {new Date(q.created_at).toLocaleDateString()}</div>
                </div>
                <div className="font-mono text-lg font-semibold text-ink">{money(q.total)}</div>
                <StatusBadge status={q.status} testId={`quote-status-${q.id}`} />
                <div className="flex flex-wrap gap-2">
                  {canPdf && (
                    <a
                      href={pdfUrl(`/quotes/${q.id}/pdf`)} target="_blank" rel="noreferrer"
                      data-testid={`quote-pdf-${q.id}`}
                      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-2")}
                    >
                      <FileDown className="h-3.5 w-3.5" /> PDF
                    </a>
                  )}
                  {canEdit && (
                    <>
                      <Button size="sm" variant="outline" data-testid={`quote-send-${q.id}`} onClick={() => sendQuote.mutate(q.id)}>
                        <Send className="h-3.5 w-3.5" /> Email
                      </Button>
                      {q.status !== "accepted" && q.status !== "superseded" && (
                        <Button size="sm" variant="outline" data-testid={`quote-accept-${q.id}`} onClick={() => acceptQuote.mutate(q.id)}>Mark accepted</Button>
                      )}
                      {q.status === "accepted" && (canInvoice ? (
                        <Button size="sm" data-testid={`quote-invoice-${q.id}`} onClick={() => toInvoice.mutate(q.id)}>Create invoice</Button>
                      ) : (
                        <Link to="/billing" data-testid={`quote-invoice-locked-${q.id}`}
                              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2 text-ink-3")}>
                          <Lock className="h-3.5 w-3.5" /> Invoicing — upgrade
                        </Link>
                      ))}
                      <Button
                        size="sm" variant="ghost" data-testid={`quote-edit-lines-${q.id}`}
                        onClick={() => setEditQuoteId(editQuoteId === q.id ? null : q.id)}
                      >
                        <Sliders className="h-3.5 w-3.5" /> {editQuoteId === q.id ? "Close lines" : "Edit lines"}
                      </Button>
                    </>
                  )}
                  {canPdf && (
                    <Button
                      size="sm" variant="ghost" data-testid={`quote-preview-${q.id}`}
                      onClick={() => setPreviewQuoteId(previewQuoteId === q.id ? null : q.id)}
                    >
                      <Eye className="h-3.5 w-3.5" /> {previewQuoteId === q.id ? "Hide PDF" : "Preview PDF"}
                    </Button>
                  )}
                </div>
                {previewQuoteId === q.id && canPdf && (
                  <div className="w-full" data-testid={`quote-preview-panel-${q.id}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3 border border-hairline bg-surface-2 px-4 py-3">
                      <p className="text-[15px] text-ink-3">
                        Exactly what the client receives. Edit the lines and the preview re-renders
                        before you email it.
                      </p>
                      <a href={pdfUrl(`/quotes/${q.id}/pdf`)} target="_blank" rel="noreferrer"
                         data-testid={`quote-pdf-download-${q.id}`}
                         className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}>
                        <FileDown className="h-3.5 w-3.5" /> Open / download
                      </a>
                    </div>
                    <iframe
                      key={`${q.id}-${q.total}-${q.lines.length}`}
                      title={`Quote ${q.revision} preview`}
                      data-testid={`quote-pdf-frame-${q.id}`}
                      src={`${pdfUrl(`/quotes/${q.id}/pdf`)}#toolbar=0&view=FitH`}
                      className="h-[620px] w-full border border-t-0 border-hairline bg-white"
                    />
                  </div>
                )}
                {editQuoteId === q.id && (
                  <div className="w-full">
                    <DocLineEditor
                      testId={`quote-lines-${q.id}`}
                      lines={q.lines as unknown as TakeoffLine[]}
                      pending={editQuoteLine.isPending}
                      readOnly={q.status === "superseded"}
                      readOnlyNote="This revision is superseded and kept as history — edit the current revision instead."
                      onSave={(lineId, patch) => editQuoteLine.mutate({ quoteId: q.id, lineId, patch })}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          {latest && (
            <p className="mt-4 text-sm text-ink-3">
              Creating a new quote makes a change order: revision {latest.revision + 1} is added and the earlier revisions stay on record.
            </p>
          )}
          <Link to="/invoices" className="mt-4 inline-block font-mono text-xs uppercase tracking-widest text-brand hover:underline" data-testid="takeoff-invoices-link">
            Go to invoices →
          </Link>
        </Panel>

        <Panel className="h-fit">
          <h2 className="font-heading text-lg font-semibold text-ink">Totals</h2>
          <dl className="mt-4 space-y-3 font-mono text-base">
            <div className="flex justify-between text-ink-2"><dt>Subtotal</dt><dd data-testid="totals-subtotal">{money(subtotal)}</dd></div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="discount" className="text-ink-2">Discount %</Label>
              <Input id="discount" type="number" step="0.5" data-testid="discount-input" value={discount}
                     onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} className="h-10 w-28 text-right font-mono" />
            </div>
            <div className="flex justify-between text-ink-3"><dt>Discount</dt><dd data-testid="totals-discount">−{money(discAmt)}</dd></div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="tax" className="text-ink-2">{settings.data?.tax_label ?? "Tax"} %</Label>
              <Input id="tax" type="number" step="0.05" data-testid="tax-input" value={effTax}
                     onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)} className="h-10 w-28 text-right font-mono" />
            </div>
            <div className="flex justify-between text-ink-3"><dt>Tax</dt><dd data-testid="totals-tax">{money(taxAmt)}</dd></div>
            <div className="flex justify-between border-t border-hairline pt-4 text-xl font-semibold text-ink">
              <dt>Grand total</dt><dd data-testid="totals-grand">{money(grand)}</dd>
            </div>
          </dl>
          {canQuote ? (
            <Button size="lg" className="mt-6 w-full font-semibold" data-testid="convert-to-quote-button"
                    onClick={() => makeQuote.mutate()} disabled={makeQuote.isPending || rows.length === 0}>
              <FileSignature className="h-4 w-4" /> {latest ? "Create change order" : "Convert to quote"}
            </Button>
          ) : (
            <Link to="/billing" data-testid="convert-to-quote-locked"
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }), "mt-6 w-full gap-2 font-semibold text-ink-3")}>
              <Lock className="h-4 w-4" /> Quoting needs a paid plan ({planName})
            </Link>
          )}
          {/* The client pay link belongs to an INVOICE, not a quote — it lives on /invoices. */}
          {latest?.status === "accepted" && (
            <Link to="/invoices" data-testid="takeoff-pay-link-hint"
                  className="mt-3 flex items-center justify-center gap-2 border border-hairline px-4 py-2.5 font-mono text-xs uppercase tracking-widest text-ink-2 transition-colors hover:border-brand/50 hover:text-brand">
              <Link2 className="h-4 w-4" /> Get client pay link
            </Link>
          )}
        </Panel>
      </div>
    </Shell>
  );
}
