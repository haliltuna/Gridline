import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Plus, Trash2, Pencil, Check, X, Library } from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type { Product, ProductIn } from "@/lib/types";
import { FLOOR_TYPES, money } from "@/lib/types";
import Shell, { Panel } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const BLANK: ProductIn = { name: "", brand: "", floor_type: "", alternative: "", cost_per_sqft: 0, note: "" };

// The brands this account quotes most, with the estimator's own cost per sq ft. The list
// learns itself: typing a product on a takeoff line upserts it here and bumps its use count.
export default function Products() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<ProductIn>(BLANK);
  const [editing, setEditing] = useState<string | null>(null);

  const products = useQuery<Product[]>({
    queryKey: ["products", q],
    queryFn: () => apiGet<Product[]>(`/products${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ["products"] });

  const create = useMutation({
    mutationFn: (body: ProductIn) => apiPost<Product>("/products", body),
    onSuccess: (p) => { refresh(); setDraft(BLANK); toast.success(`${p.name} added to your library`); },
    onError: (e: Error) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ProductIn }) => apiPatch<Product>(`/products/${id}`, body),
    onSuccess: () => { refresh(); setEditing(null); toast.success("Product updated"); },
    onError: () => toast.error("Could not update that product"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete<{ deleted: string }>(`/products/${id}`),
    onSuccess: () => { refresh(); toast.success("Removed from your library"); },
    onError: () => toast.error("Could not remove that product"),
  });

  const rows = products.data ?? [];
  const topBrand = useMemo(() => rows[0]?.brand || "—", [rows]);

  return (
    <Shell
      title="Product library"
      subtitle="Every product you quote, with your own cost per sq ft and the approved alternative. Apply one to any takeoff line and the price follows."
    >
      <div className="flex flex-wrap items-end justify-end gap-4">
        <div className="flex items-center gap-2 border border-hairline bg-surface-2 px-3">
          <Search className="h-4 w-4 text-ink-3" />
          <Input
            data-testid="products-search-input" placeholder="Search brand, product or floor type"
            value={q} onChange={(e) => setQ(e.target.value)}
            className="h-12 w-[290px] border-0 bg-transparent text-base focus-visible:ring-0"
          />
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
        <Panel testId="products-list">
          {rows.length === 0 ? (
            <p className="text-[15px] text-ink-3" data-testid="products-empty">
              {q ? "No product matches that search." : "Nothing here yet — quote a product on a takeoff, or add one on the right."}
            </p>
          ) : (
            <div className="divide-y divide-hairline/60">
              {rows.map((p) => (
                <div key={p.id} className="py-3" data-testid={`product-row-${p.id}`}>
                  {editing === p.id ? (
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="min-w-[240px] flex-1">
                        <Label className="text-ink-3" htmlFor={`name-${p.id}`}>Product</Label>
                        <Input id={`name-${p.id}`} data-testid={`product-name-input-${p.id}`}
                               defaultValue={p.name} className="mt-1 h-11 text-base"
                               onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
                      </div>
                      <div className="w-[130px]">
                        <Label className="text-ink-3" htmlFor={`cost-${p.id}`}>$ / sq ft</Label>
                        <Input id={`cost-${p.id}`} data-testid={`product-cost-input-${p.id}`}
                               defaultValue={p.cost_per_sqft} inputMode="decimal" className="mt-1 h-11 text-base"
                               onChange={(e) => setDraft((d) => ({ ...d, cost_per_sqft: Number(e.target.value) || 0 }))} />
                      </div>
                      <Button size="sm" data-testid={`product-save-${p.id}`}
                              onClick={() => update.mutate({ id: p.id, body: {
                                ...p, ...draft,
                                name: draft.name || p.name,
                                cost_per_sqft: draft.cost_per_sqft || p.cost_per_sqft,
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
                          {p.floor_type || "any floor type"} · used {p.times_used}×
                          {p.alternative ? ` · alt: ${p.alternative}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-base font-semibold text-brand" data-testid={`product-cost-${p.id}`}>
                          {money(p.cost_per_sqft)}/sf
                        </span>
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
              ))}
            </div>
          )}
        </Panel>

        <div className="space-y-5">
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
                      onClick={() => create.mutate(draft)}>
                {create.isPending ? "Adding…" : "Add to library"}
              </Button>
            </div>
          </Panel>

          <Panel testId="products-summary">
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-3">
              <Library className="h-3.5 w-3.5 text-brand" /> Library
            </div>
            <div className="mt-3 font-heading text-3xl font-bold text-ink" data-testid="products-count">{rows.length}</div>
            <p className="mt-1 text-sm text-ink-3">
              products on file · most quoted brand <span className="text-ink-2">{topBrand}</span>
            </p>
          </Panel>
        </div>
      </div>
    </Shell>
  );
}
