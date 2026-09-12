import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Check, Plus, Trash2, FileSignature, Send, Ruler } from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type { Invoice, Job, Quote, Settings, TakeoffLine, SendOut } from "@/lib/types";
import { FLOOR_TYPES, money, num } from "@/lib/types";
import Shell, { Panel, StatusBadge } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

function EditNum({ value, onCommit, testId, suffix }: { value: number; onCommit: (v: number) => void; testId: string; suffix?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  if (!editing) {
    return (
      <button
        type="button"
        data-testid={testId}
        onClick={() => { setDraft(String(value)); setEditing(true); }}
        className="w-full rounded-sm px-2 py-1.5 text-right font-mono text-base font-semibold text-white transition-colors hover:bg-[#1C2712] hover:text-[#E2F952]"
      >
        {num(value, value % 1 === 0 ? 0 : 2)}{suffix}
      </button>
    );
  }
  return (
    <Input
      autoFocus
      type="number"
      step="0.01"
      data-testid={`${testId}-input`}
      value={draft}
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
  const [discount, setDiscount] = useState(0);
  const [taxRate, setTaxRate] = useState<number | null>(null);

  const job = useQuery<Job>({ queryKey: ["job", jobId], queryFn: () => apiGet<Job>(`/jobs/${jobId}`), retry: false });
  const lines = useQuery<TakeoffLine[]>({ queryKey: ["lines", jobId], queryFn: () => apiGet<TakeoffLine[]>(`/jobs/${jobId}/lines`), retry: false });
  const quotes = useQuery<Quote[]>({ queryKey: ["quotes", jobId], queryFn: () => apiGet<Quote[]>(`/jobs/${jobId}/quotes`), retry: false });
  const settings = useQuery<Settings>({ queryKey: ["settings"], queryFn: () => apiGet<Settings>("/settings"), retry: false });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["lines", jobId] });
    void qc.invalidateQueries({ queryKey: ["job", jobId] });
    void qc.invalidateQueries({ queryKey: ["quotes", jobId] });
    void qc.invalidateQueries({ queryKey: ["jobs"] });
    void qc.invalidateQueries({ queryKey: ["invoices"] });
    void qc.invalidateQueries({ queryKey: ["stats"] });
  };

  const patch = useMutation({
    mutationFn: (p: { id: string; body: Record<string, unknown> }) => apiPatch<TakeoffLine>(`/lines/${p.id}`, p.body),
    onSuccess: refresh,
    onError: () => toast.error("Could not save that change"),
  });
  const addLine = useMutation({
    mutationFn: () => apiPost<TakeoffLine>(`/jobs/${jobId}/lines`, { building: "Building A", unit: "Main", room: "New Room", floor_type: "Luxury Vinyl Plank", sqft: 100 }),
    onSuccess: () => { refresh(); toast.success("Line added"); },
  });
  const delLine = useMutation({
    mutationFn: (id: string) => apiDelete(`/lines/${id}`),
    onSuccess: () => { refresh(); toast.success("Line removed"); },
  });
  const approveAll = useMutation({
    mutationFn: () => apiPost<TakeoffLine[]>(`/jobs/${jobId}/approve-all`),
    onSuccess: () => { refresh(); toast.success("All lines approved"); },
  });
  const makeQuote = useMutation({
    mutationFn: () => apiPost<Quote>(`/jobs/${jobId}/quotes`, { discount_pct: discount, tax_rate: taxRate }),
    onSuccess: (q) => { refresh(); toast.success(`Quote ${q.number} created (revision ${q.revision})`); },
    onError: () => toast.error("Add and approve some lines first"),
  });
  const sendQuote = useMutation({
    mutationFn: (id: string) => apiPost<SendOut>(`/quotes/${id}/send`),
    onSuccess: (r) => { refresh(); toast.success(r.message); },
  });
  const acceptQuote = useMutation({
    mutationFn: (id: string) => apiPost<Quote>(`/quotes/${id}/accept`),
    onSuccess: () => { refresh(); toast.success("Quote marked accepted"); },
  });
  const toInvoice = useMutation({
    mutationFn: (id: string) => apiPost<Invoice>(`/quotes/${id}/invoice`),
    onSuccess: (inv) => { refresh(); toast.success(`Invoice ${inv.number} created`); },
    onError: () => toast.error("Accept the quote before invoicing"),
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

  const subtotal = rows.reduce((a, b) => a + b.cost, 0);
  const effTax = taxRate ?? settings.data?.tax_rate ?? 0;
  const discAmt = (subtotal * discount) / 100;
  const taxAmt = ((subtotal - discAmt) * effTax) / 100;
  const grand = subtotal - discAmt + taxAmt;
  const totalSqft = rows.reduce((a, b) => a + b.sqft, 0);
  const totalGal = rows.reduce((a, b) => a + b.adhesive_gallons, 0);
  const flagged = rows.filter((r) => r.needs_review).length;
  const latest = quotes.data?.[0];

  return (
    <Shell
      title={job.data?.name ?? "Takeoff"}
      subtitle={job.data ? `${job.data.client_name || "No client"} · ${job.data.filename || "no file"} · ${job.data.pages} page(s)` : "Loading job…"}
      action={job.data ? <StatusBadge status={job.data.status} testId="takeoff-job-status" /> : undefined}
    >
      {/* AI brief */}
      <Panel className="gl-rise">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#E2F952]">AI read brief</p>
            <p className="mt-3 text-lg leading-relaxed text-slate-200" data-testid="takeoff-brief">
              {job.data?.brief || "Upload a blueprint to generate a brief."}
            </p>
            {job.data?.cross_check_note && (
              <p className="mt-3 text-sm text-slate-400" data-testid="takeoff-crosscheck">{job.data.cross_check_note}</p>
            )}
            {job.data?.scale && (
              <p className="mt-3 inline-flex items-center gap-2 font-mono text-sm text-slate-400">
                <Ruler className="h-4 w-4 text-[#E2F952]" /> Printed scale: {job.data.scale}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 font-mono sm:grid-cols-4">
            {[["Buildings", job.data?.buildings ?? 0], ["Units", job.data?.units ?? 0], ["Bedrooms", job.data?.bedrooms ?? 0], ["Bathrooms", job.data?.bathrooms ?? 0]].map(([l, v]) => (
              <div key={String(l)}>
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{l}</div>
                <div className="mt-1 text-2xl font-semibold text-white" data-testid={`brief-${String(l).toLowerCase()}`}>{v}</div>
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
      <div className="mt-6 grid gap-px border border-slate-800/80 bg-slate-800/60 sm:grid-cols-4">
        {[
          ["Lines", num(rows.length), "takeoff-count"],
          ["Total sq ft", num(totalSqft, 1), "takeoff-sqft"],
          ["Adhesive (gal)", num(totalGal, 1), "takeoff-gallons"],
          ["Flagged", num(flagged), "takeoff-flagged"],
        ].map(([l, v, id]) => (
          <div key={l} className="bg-[#0F1722] px-5 py-4">
            <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">{l}</div>
            <div className="mt-1 font-mono text-2xl font-semibold text-white" data-testid={id}>{v}</div>
          </div>
        ))}
      </div>

      {/* line items */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-xl font-semibold text-slate-100">Line items — tap any number to edit</h2>
        <div className="flex gap-2">
          <Button variant="outline" data-testid="takeoff-add-line-button" onClick={() => addLine.mutate()}>
            <Plus className="h-4 w-4" /> Add line
          </Button>
          <Button data-testid="takeoff-approve-all-button" onClick={() => approveAll.mutate()} className="font-semibold">
            <Check className="h-4 w-4" /> Approve all
          </Button>
        </div>
      </div>

      {rows.length === 0 && (
        <Panel className="mt-4 text-center">
          <p className="text-slate-300" data-testid="takeoff-empty">No takeoff lines yet. Upload a blueprint or add a line manually.</p>
        </Panel>
      )}

      <div className="mt-4 space-y-8" data-testid="takeoff-groups">
        {grouped.map(([group, items]) => (
          <div key={group} className="border border-slate-800/80 bg-[#0F1722]">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
              <h3 className="font-mono text-sm uppercase tracking-[0.18em] text-[#E2F952]">{group}</h3>
              <span className="font-mono text-sm text-slate-400">{money(items.reduce((a, b) => a + b.cost, 0))}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left">
                <thead>
                  <tr className="border-b border-slate-800 font-mono text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Room</th>
                    <th className="px-4 py-3">Floor type</th>
                    <th className="px-3 py-3 text-right">Sq ft</th>
                    <th className="px-3 py-3 text-right">Waste %</th>
                    <th className="px-4 py-3">Adhesive</th>
                    <th className="px-3 py-3 text-right">Gal</th>
                    <th className="px-3 py-3 text-right">$/sf</th>
                    <th className="px-3 py-3 text-right">Labor hr</th>
                    <th className="px-3 py-3 text-right">Cost</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((l) => (
                    <tr key={l.id} data-testid={`line-row-${l.id}`} className={cn("border-b border-slate-800/60 align-middle", l.needs_review && "bg-amber-500/5")}>
                      <td className="px-4 py-3">
                        <div className="text-base font-medium text-slate-100" data-testid={`line-room-${l.id}`}>{l.room}</div>
                        {l.needs_review && (
                          <span className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-amber-300">
                            <AlertTriangle className="h-3 w-3" /> review
                          </span>
                        )}
                        {l.approved && <span className="mt-1 ml-2 inline-flex font-mono text-[11px] uppercase tracking-wider text-emerald-400">approved</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Select value={l.floor_type} onValueChange={(v: string) => patch.mutate({ id: l.id, body: { floor_type: v } })}>
                          <SelectTrigger className="h-10 w-[190px]" data-testid={`line-floortype-${l.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FLOOR_TYPES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-3"><EditNum testId={`line-sqft-${l.id}`} value={l.sqft} onCommit={(v) => patch.mutate({ id: l.id, body: { sqft: v } })} /></td>
                      <td className="px-3 py-3"><EditNum testId={`line-waste-${l.id}`} value={l.waste_pct} suffix="%" onCommit={(v) => patch.mutate({ id: l.id, body: { waste_pct: v } })} /></td>
                      <td className="px-4 py-3 text-sm text-slate-400" data-testid={`line-adhesive-${l.id}`}>{l.adhesive}</td>
                      <td className="px-3 py-3 text-right font-mono text-base text-slate-300" data-testid={`line-gallons-${l.id}`}>{num(l.adhesive_gallons, 2)}</td>
                      <td className="px-3 py-3"><EditNum testId={`line-rate-${l.id}`} value={l.material_cost_per_sqft} onCommit={(v) => patch.mutate({ id: l.id, body: { material_cost_per_sqft: v } })} /></td>
                      <td className="px-3 py-3"><EditNum testId={`line-hours-${l.id}`} value={l.labor_hours} onCommit={(v) => patch.mutate({ id: l.id, body: { labor_hours: v } })} /></td>
                      <td className="px-3 py-3 text-right font-mono text-base font-semibold text-[#E2F952]" data-testid={`line-cost-${l.id}`}>{money(l.cost)}</td>
                      <td className="px-3 py-3 text-right">
                        <Button variant="ghost" size="icon-sm" data-testid={`line-delete-${l.id}`} onClick={() => delLine.mutate(l.id)}>
                          <Trash2 className="h-4 w-4 text-slate-500" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* totals + quote */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_420px]">
        <Panel>
          <h2 className="font-heading text-lg font-semibold text-slate-100">Quote history</h2>
          {(quotes.data ?? []).length === 0 && <p className="mt-3 text-slate-400" data-testid="quote-history-empty">No quote yet. Create one from the approved lines.</p>}
          <div className="mt-4 space-y-3" data-testid="quote-history">
            {(quotes.data ?? []).map((q) => (
              <div key={q.id} data-testid={`quote-row-${q.id}`} className="flex flex-wrap items-center justify-between gap-3 border border-slate-800 bg-[#131D2A] px-4 py-3">
                <div>
                  <div className="font-mono text-base text-slate-100">{q.number}</div>
                  <div className="font-mono text-xs text-slate-500">Revision {q.revision} · {new Date(q.created_at).toLocaleDateString()}</div>
                </div>
                <div className="font-mono text-lg font-semibold text-white">{money(q.total)}</div>
                <StatusBadge status={q.status} testId={`quote-status-${q.id}`} />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" data-testid={`quote-send-${q.id}`} onClick={() => sendQuote.mutate(q.id)}><Send className="h-3.5 w-3.5" /> Email</Button>
                  {q.status !== "accepted" && q.status !== "superseded" && (
                    <Button size="sm" variant="outline" data-testid={`quote-accept-${q.id}`} onClick={() => acceptQuote.mutate(q.id)}>Mark accepted</Button>
                  )}
                  {q.status === "accepted" && (
                    <Button size="sm" data-testid={`quote-invoice-${q.id}`} onClick={() => toInvoice.mutate(q.id)}>Create invoice</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {latest && (
            <p className="mt-4 text-sm text-slate-500">
              Creating a new quote makes a change order: revision {latest.revision + 1} is added and the earlier revisions stay on record.
            </p>
          )}
          <Link to="/invoices" className="mt-4 inline-block font-mono text-xs uppercase tracking-widest text-[#E2F952] hover:underline" data-testid="takeoff-invoices-link">
            Go to invoices →
          </Link>
        </Panel>

        <Panel className="h-fit">
          <h2 className="font-heading text-lg font-semibold text-slate-100">Totals</h2>
          <dl className="mt-4 space-y-3 font-mono text-base">
            <div className="flex justify-between text-slate-300"><dt>Subtotal</dt><dd data-testid="totals-subtotal">{money(subtotal)}</dd></div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="discount" className="text-slate-300">Discount %</Label>
              <Input id="discount" type="number" step="0.5" data-testid="discount-input" value={discount}
                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} className="h-10 w-28 text-right font-mono" />
            </div>
            <div className="flex justify-between text-slate-400"><dt>Discount</dt><dd data-testid="totals-discount">−{money(discAmt)}</dd></div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="tax" className="text-slate-300">{settings.data?.tax_label ?? "Tax"} %</Label>
              <Input id="tax" type="number" step="0.05" data-testid="tax-input" value={effTax}
                onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)} className="h-10 w-28 text-right font-mono" />
            </div>
            <div className="flex justify-between text-slate-400"><dt>Tax</dt><dd data-testid="totals-tax">{money(taxAmt)}</dd></div>
            <div className="flex justify-between border-t border-slate-800 pt-4 text-xl font-semibold text-white">
              <dt>Grand total</dt><dd data-testid="totals-grand">{money(grand)}</dd>
            </div>
          </dl>
          <Button size="lg" className="mt-6 w-full font-semibold" data-testid="convert-to-quote-button" onClick={() => makeQuote.mutate()} disabled={makeQuote.isPending || rows.length === 0}>
            <FileSignature className="h-4 w-4" /> {latest ? "Create change order" : "Convert to quote"}
          </Button>
        </Panel>
      </div>
    </Shell>
  );
}
