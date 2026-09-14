import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Plus, Trash2, Pencil, Check, X, Library, Ruler, ArrowRightToLine } from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type {
  AccessoryCatalogueRow, AccessoryCounts, Job, Product, ProductIn, TakeoffLine,
} from "@/lib/types";
import { FLOOR_TYPES, money, num } from "@/lib/types";
import Shell, { Panel } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const BLANK: ProductIn = { name: "", brand: "", floor_type: "", alternative: "", cost_per_sqft: 0, note: "" };
const BLANK_ACC: ProductIn = {
  name: "", brand: "", floor_type: "", alternative: "", cost_per_sqft: 0, note: "",
  kind: "accessory", accessory_kind: "transition", unit: "ea", unit_price: 0, labor_hr_each: 0,
};
const UNITS = [
  { id: "ea", label: "each / piece" },
  { id: "lf", label: "linear foot" },
  { id: "sf", label: "square foot" },
];

// Two catalogues in one place: the floor products this account quotes, and the accessory /
// trim catalogue (transitions, nosings, cove base, tile edge profiles). Accessory quantities
// come from what the AI counted on the drawings or read off the spec sheet, so the trim work
// is priced instead of forgotten.
export default function Products() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"floor" | "accessory">("floor");
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<ProductIn>(BLANK);
  const [accDraft, setAccDraft] = useState<ProductIn>(BLANK_ACC);
  const [editing, setEditing] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string>("");
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});

  const products = useQuery<Product[]>({
    queryKey: ["products", tab, q],
    queryFn: () => apiGet<Product[]>(`/products?kind=${tab}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  });
  const catalogue = useQuery<AccessoryCatalogueRow[]>({
    queryKey: ["accessory-catalogue"],
    queryFn: () => apiGet<AccessoryCatalogueRow[]>("/accessory-catalogue"),
    retry: false,
  });
  const jobs = useQuery<Job[]>({ queryKey: ["jobs"], queryFn: () => apiGet<Job[]>("/jobs"), retry: false });
  const counts = useQuery<AccessoryCounts>({
    queryKey: ["accessory-counts", jobId],
    enabled: Boolean(jobId),
    queryFn: () => apiGet<AccessoryCounts>(`/jobs/${jobId}/accessory-counts`),
    retry: false,
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ["products"] });

  const create = useMutation({
    mutationFn: (body: ProductIn) => apiPost<Product>("/products", body),
    onSuccess: (p) => {
      refresh();
      if (p.kind === "accessory") setAccDraft(BLANK_ACC); else setDraft(BLANK);
      toast.success(`${p.name} added to your ${p.kind === "accessory" ? "accessory catalogue" : "library"}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ProductIn }) => apiPatch<Product>(`/products/${id}`, body),
    onSuccess: () => { refresh(); setEditing(null); toast.success("Saved"); },
    onError: () => toast.error("Could not update that item"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete<{ deleted: string }>(`/products/${id}`),
    onSuccess: () => { refresh(); toast.success("Removed from your catalogue"); },
    onError: () => toast.error("Could not remove that item"),
  });
  const addLine = useMutation({
    mutationFn: ({ id, qty }: { id: string; qty: number }) =>
      apiPost<TakeoffLine>(`/products/${id}/add-line`, {
        job_id: jobId, qty, building: "Building A", unit: "Whole job",
      }),
    onSuccess: (line) => {
      void qc.invalidateQueries({ queryKey: ["lines", jobId] });
      refresh();
      toast.success(`${line.room} added to the takeoff — ${money(line.cost ?? 0)}`);
    },
    onError: () => toast.error("Could not add that line — pick a job first"),
  });

  const rows = products.data ?? [];
  const topBrand = useMemo(() => rows[0]?.brand || "—", [rows]);
  const countFor = (kind: string) => counts.data?.rows.find((r) => r.kind === kind);
  const jobRows = jobs.data ?? [];

  return (
    <Shell
      title="Product & accessory catalogue"
      subtitle="Floor products with your cost per sq ft, plus the trim catalogue — transitions, nosings, cove base and tile edge profiles — priced per piece or linear foot."
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 border border-hairline bg-surface p-1" data-testid="products-tabs">
          {([["floor", "Floor products"], ["accessory", "Accessory catalogue"]] as const).map(([k, label]) => (
            <button
              key={k} type="button" data-testid={`products-tab-${k}`}
              onClick={() => { setTab(k); setEditing(null); }}
              className={cn("px-4 py-2 font-mono text-xs uppercase tracking-widest transition-colors duration-150",
                tab === k ? "bg-brand text-on-brand" : "text-ink-3 hover:text-ink-2")}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 border border-hairline bg-surface-2 px-3">
          <Search className="h-4 w-4 text-ink-3" />
          <Input
            data-testid="products-search-input" placeholder="Search brand, product or floor type"
            value={q} onChange={(e) => setQ(e.target.value)}
            className="h-12 w-[290px] border-0 bg-transparent text-base focus-visible:ring-0"
          />
        </div>
      </div>

      {tab === "accessory" && (
        <Panel className="mt-6" testId="accessory-addon-panel">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 font-heading text-lg font-semibold text-ink">
                <Ruler className="h-4 w-4 text-brand" /> What the AI counted
              </h2>
              <p className="mt-2 max-w-2xl text-[15px] text-ink-3">
                Door openings, steps, wall-base linear feet and tile edge profiles are counted on the
                drawings and read off the finish schedule. Pick a job to pull those quantities in, then
                drop any catalogue item onto the takeoff as its own line item.
              </p>
            </div>
            <div className="w-[280px]">
              <Label className="text-ink-3">Job</Label>
              <Select value={jobId} onValueChange={(v) => setJobId(v)}>
                <SelectTrigger className="mt-1 h-11 text-base" data-testid="accessory-job-select">
                  <SelectValue placeholder="Choose a job">
                    {jobRows.find((j) => j.id === jobId)?.name ?? "Choose a job"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {jobRows.map((j) => <SelectItem key={j.id} value={j.id}>{j.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-5 grid gap-px border border-hairline/80 bg-hairline/60 sm:grid-cols-2 lg:grid-cols-4"
               data-testid="accessory-counts">
            {(catalogue.data ?? []).map((c) => {
              const row = countFor(c.kind);
              return (
                <div key={c.kind} className="bg-surface px-5 py-4" data-testid={`accessory-count-${c.kind}`}>
                  <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">{c.label}</div>
                  <div className="mt-1 font-mono text-2xl font-semibold text-ink">
                    {row ? `${num(row.qty, row.unit === "lf" ? 1 : 0)} ${row.unit}` : `— ${c.unit}`}
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-ink-3">
                    {row ? row.source : "pick a job to see the count"} · {money(c.your_price)}/{c.unit}
                  </div>
                  {row?.spec_product && (
                    <div className="mt-1 truncate text-xs text-ink-3" title={row.spec_product}>
                      spec: {row.spec_product}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-3 font-mono text-[11px] text-ink-4">
            Prices come from Settings → accessory catalogue; an item's own price overrides it.
          </p>
        </Panel>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
        <Panel testId="products-list">
          {rows.length === 0 ? (
            <p className="text-[15px] text-ink-3" data-testid="products-empty">
              {q ? "Nothing matches that search."
                 : tab === "accessory"
                   ? "No accessory items yet — add cove base, nosings, transitions or a tile profile on the right."
                   : "Nothing here yet — quote a product on a takeoff, or add one on the right."}
            </p>
          ) : (
            <div className="divide-y divide-hairline/60">
              {rows.map((p) => {
                const acc = p.kind === "accessory";
                const suggested = acc ? countFor(p.accessory_kind)?.qty ?? 0 : 0;
                const qtyValue = qtyDraft[p.id] ?? (suggested ? String(suggested) : "");
                return (
                  <div key={p.id} className="py-3" data-testid={`product-row-${p.id}`}>
                    {editing === p.id ? (
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="min-w-[240px] flex-1">
                          <Label className="text-ink-3" htmlFor={`name-${p.id}`}>Item</Label>
                          <Input id={`name-${p.id}`} data-testid={`product-name-input-${p.id}`}
                                 defaultValue={p.name} className="mt-1 h-11 text-base"
                                 onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
                        </div>
                        <div className="w-[140px]">
                          <Label className="text-ink-3" htmlFor={`cost-${p.id}`}>
                            {acc ? `$ / ${p.unit}` : "$ / sq ft"}
                          </Label>
                          <Input id={`cost-${p.id}`} data-testid={`product-cost-input-${p.id}`}
                                 defaultValue={acc ? p.unit_price : p.cost_per_sqft}
                                 inputMode="decimal" className="mt-1 h-11 text-base"
                                 onChange={(e) => setDraft((d) => (acc
                                   ? { ...d, unit_price: Number(e.target.value) || 0 }
                                   : { ...d, cost_per_sqft: Number(e.target.value) || 0 }))} />
                        </div>
                        {acc && (
                          <div className="w-[130px]">
                            <Label className="text-ink-3" htmlFor={`hrs-${p.id}`}>Install hrs each</Label>
                            <Input id={`hrs-${p.id}`} data-testid={`product-hours-input-${p.id}`}
                                   defaultValue={p.labor_hr_each} inputMode="decimal"
                                   className="mt-1 h-11 text-base"
                                   onChange={(e) => setDraft((d) => ({ ...d, labor_hr_each: Number(e.target.value) || 0 }))} />
                          </div>
                        )}
                        <Button size="sm" data-testid={`product-save-${p.id}`}
                                onClick={() => update.mutate({ id: p.id, body: {
                                  ...p, ...draft,
                                  name: draft.name || p.name,
                                  cost_per_sqft: draft.cost_per_sqft ?? p.cost_per_sqft,
                                  unit_price: draft.unit_price ?? p.unit_price,
                                  labor_hr_each: draft.labor_hr_each ?? p.labor_hr_each,
                                } })}>
                          <Check className="h-4 w-4" /> Save
                        </Button>
                        <Button size="sm" variant="ghost" data-testid={`product-cancel-${p.id}`}
                                onClick={() => { setEditing(null); setDraft(BLANK); }}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[15px] font-medium text-ink" data-testid={`product-name-${p.id}`}>
                            {p.name}
                          </div>
                          <div className="mt-0.5 font-mono text-[11px] text-ink-3">
                            {acc ? `${p.accessory_kind || "custom"} · per ${p.unit} · ${p.labor_hr_each}h each`
                                 : p.floor_type || "any floor type"} · used {p.times_used}×
                            {p.alternative ? ` · alt: ${p.alternative}` : ""}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-mono text-base font-semibold text-brand" data-testid={`product-cost-${p.id}`}>
                            {money(acc ? p.unit_price : p.cost_per_sqft)}/{acc ? p.unit : "sf"}
                          </span>
                          {jobId && (
                            <div className="flex items-center gap-2">
                              <Input
                                data-testid={`product-qty-input-${p.id}`}
                                value={qtyValue} inputMode="decimal"
                                placeholder={acc ? "qty" : "sq ft"}
                                onChange={(e) => setQtyDraft({ ...qtyDraft, [p.id]: e.target.value })}
                                className="h-10 w-[90px] text-right font-mono"
                              />
                              <Button size="sm" data-testid={`product-add-line-${p.id}`}
                                      disabled={addLine.isPending || !(Number(qtyValue) > 0)}
                                      onClick={() => addLine.mutate({ id: p.id, qty: Number(qtyValue) || 0 })}>
                                <ArrowRightToLine className="h-3.5 w-3.5" /> Add line
                              </Button>
                            </div>
                          )}
                          <Button size="sm" variant="outline" data-testid={`product-edit-${p.id}`}
                                  onClick={() => { setEditing(p.id); setDraft({ ...p }); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" data-testid={`product-delete-${p.id}`}
                                  onClick={() => remove.mutate(p.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {tab === "accessory" && rows.length > 0 && !jobId && (
            <p className="mt-4 font-mono text-[11px] text-ink-4" data-testid="accessory-pick-job-hint">
              Pick a job above to add any of these straight onto its takeoff with the counted quantity.
            </p>
          )}
        </Panel>

        <div className="space-y-5">
          {tab === "floor" ? (
            <Panel testId="products-add">
              <h2 className="flex items-center gap-2 font-heading text-lg font-semibold text-ink">
                <Plus className="h-4 w-4 text-brand" /> Add a product
              </h2>
              <div className="mt-4 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="p-name" className="text-ink-2">Product name</Label>
                  <Input id="p-name" data-testid="product-new-name-input" placeholder="Shaw Fifth Avenue Oak 5mm SPC"
                         value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                         className="h-12 text-base" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-brand" className="text-ink-2">Brand</Label>
                  <Input id="p-brand" data-testid="product-new-brand-input" placeholder="Shaw"
                         value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
                         className="h-12 text-base" />
                </div>
                <div className="space-y-2">
                  <Label className="text-ink-2">Floor type</Label>
                  <Select value={draft.floor_type || undefined}
                          onValueChange={(v) => setDraft({ ...draft, floor_type: v })}>
                    <SelectTrigger className="h-12 text-base" data-testid="product-new-floortype-select">
                      <SelectValue placeholder="Any floor type" />
                    </SelectTrigger>
                    <SelectContent>
                      {FLOOR_TYPES.map((ft) => <SelectItem key={ft} value={ft}>{ft}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-alt" className="text-ink-2">Approved alternative</Label>
                  <Input id="p-alt" data-testid="product-new-alt-input" placeholder="Mohawk Batavia II 6mm SPC"
                         value={draft.alternative} onChange={(e) => setDraft({ ...draft, alternative: e.target.value })}
                         className="h-12 text-base" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-cost" className="text-ink-2">Your cost per sq ft</Label>
                  <Input id="p-cost" data-testid="product-new-cost-input" inputMode="decimal" placeholder="3.85"
                         value={draft.cost_per_sqft || ""}
                         onChange={(e) => setDraft({ ...draft, cost_per_sqft: Number(e.target.value) || 0 })}
                         className="h-12 font-mono text-base" />
                </div>
                <Button className="w-full font-semibold" data-testid="product-create-button"
                        disabled={create.isPending || !draft.name.trim()}
                        onClick={() => create.mutate({ ...draft, kind: "floor" })}>
                  {create.isPending ? "Adding…" : "Add to library"}
                </Button>
              </div>
            </Panel>
          ) : (
            <Panel testId="accessory-add">
              <h2 className="flex items-center gap-2 font-heading text-lg font-semibold text-ink">
                <Plus className="h-4 w-4 text-brand" /> Add an accessory
              </h2>
              <div className="mt-4 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="a-name" className="text-ink-2">Item name</Label>
                  <Input id="a-name" data-testid="accessory-new-name-input"
                         placeholder="Roppe 700 Series 4in cove base — Black"
                         value={accDraft.name} onChange={(e) => setAccDraft({ ...accDraft, name: e.target.value })}
                         className="h-12 text-base" />
                </div>
                <div className="space-y-2">
                  <Label className="text-ink-2">Accessory type</Label>
                  <Select value={accDraft.accessory_kind}
                          onValueChange={(v) => {
                            const row = (catalogue.data ?? []).find((c) => c.kind === v);
                            setAccDraft({
                              ...accDraft, accessory_kind: v,
                              unit: row?.unit === "lf" ? "lf" : "ea",
                              unit_price: row?.your_price ?? accDraft.unit_price,
                              labor_hr_each: row?.labor_hr_each ?? accDraft.labor_hr_each,
                            });
                          }}>
                    <SelectTrigger className="h-12 text-base" data-testid="accessory-new-kind-select">
                      <SelectValue placeholder="Transition strip">
                        {(catalogue.data ?? []).find((c) => c.kind === accDraft.accessory_kind)?.label
                          ?? "Custom accessory"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(catalogue.data ?? []).map((c) => (
                        <SelectItem key={c.kind} value={c.kind}>{c.label}</SelectItem>
                      ))}
                      <SelectItem value="custom">Custom accessory</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-ink-2">Priced per</Label>
                  <Select value={accDraft.unit} onValueChange={(v) => setAccDraft({ ...accDraft, unit: v })}>
                    <SelectTrigger className="h-12 text-base" data-testid="accessory-new-unit-select">
                      <SelectValue>
                        {UNITS.find((u) => u.id === accDraft.unit)?.label ?? "each / piece"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map((u) => <SelectItem key={u.id} value={u.id}>{u.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="a-price" className="text-ink-2">Price per {accDraft.unit}</Label>
                    <Input id="a-price" data-testid="accessory-new-price-input" inputMode="decimal" placeholder="3.40"
                           value={accDraft.unit_price || ""}
                           onChange={(e) => setAccDraft({ ...accDraft, unit_price: Number(e.target.value) || 0 })}
                           className="h-12 font-mono text-base" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="a-hrs" className="text-ink-2">Install hrs each</Label>
                    <Input id="a-hrs" data-testid="accessory-new-hours-input" inputMode="decimal" placeholder="0.02"
                           value={accDraft.labor_hr_each || ""}
                           onChange={(e) => setAccDraft({ ...accDraft, labor_hr_each: Number(e.target.value) || 0 })}
                           className="h-12 font-mono text-base" />
                  </div>
                </div>
                <Button className="w-full font-semibold" data-testid="accessory-create-button"
                        disabled={create.isPending || !accDraft.name.trim()}
                        onClick={() => create.mutate({ ...accDraft, kind: "accessory" })}>
                  {create.isPending ? "Adding…" : "Add to accessory catalogue"}
                </Button>
              </div>
            </Panel>
          )}

          <Panel testId="products-summary">
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-3">
              <Library className="h-3.5 w-3.5 text-brand" /> {tab === "accessory" ? "Accessories" : "Library"}
            </div>
            <div className="mt-3 font-heading text-3xl font-bold text-ink" data-testid="products-count">{rows.length}</div>
            <p className="mt-1 text-sm text-ink-3">
              {tab === "accessory"
                ? "trim items on file, each priced per piece or linear foot"
                : <>products on file · most quoted brand <span className="text-ink-2">{topBrand}</span></>}
            </p>
          </Panel>
        </div>
      </div>
    </Shell>
  );
}
