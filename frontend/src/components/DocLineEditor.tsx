import { useState } from "react";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { money, num } from "@/lib/types";
import type { TakeoffLine } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface DocLinePatch {
  product?: string;
  sqft?: number;
  qty?: number;
  unit_price?: number;
  material_cost_per_sqft?: number;
  labor_hours?: number;
  flat_cost?: number;
}

type DocLine = TakeoffLine & { cost?: number };

// Retyping a product name or price on a quote / invoice that is already out the door.
// The snapshot on the document is edited (not the takeoff), and the server re-totals it.
export default function DocLineEditor({
  lines, onSave, pending, readOnly, readOnlyNote, testId,
}: {
  lines: DocLine[];
  onSave: (lineId: string, patch: DocLinePatch) => void;
  pending?: boolean;
  readOnly?: boolean;
  readOnlyNote?: string;
  testId: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const start = (l: DocLine) => {
    setOpenId(l.id);
    setDraft({
      product: l.product ?? "",
      sqft: String(l.sqft ?? 0),
      qty: String(l.qty ?? 0),
      unit_price: String(l.unit_price ?? 0),
      material_cost_per_sqft: String(l.material_cost_per_sqft ?? 0),
      labor_hours: String(l.labor_hours ?? 0),
      flat_cost: String(l.flat_cost ?? 0),
    });
  };

  const commit = (l: DocLine) => {
    const n = (k: string) => (draft[k] === "" || draft[k] == null ? undefined : Number(draft[k]));
    const patch: DocLinePatch = { product: draft.product ?? "" };
    if (l.scope === "accessory") { patch.qty = n("qty"); patch.unit_price = n("unit_price"); patch.labor_hours = n("labor_hours"); }
    else if (l.scope === "misc") { patch.flat_cost = n("flat_cost"); }
    else { patch.sqft = n("sqft"); patch.material_cost_per_sqft = n("material_cost_per_sqft"); patch.labor_hours = n("labor_hours"); }
    onSave(l.id, patch);
    setOpenId(null);
  };

  if (lines.length === 0) {
    return <p className="text-[15px] text-ink-3" data-testid={`${testId}-empty`}>No lines on this document.</p>;
  }

  return (
    <div className="border border-hairline bg-surface-2" data-testid={testId}>
      {readOnly && readOnlyNote && (
        <p className="border-b border-hairline px-4 py-3 text-sm text-amber-200" data-testid={`${testId}-readonly`}>
          {readOnlyNote}
        </p>
      )}
      <div className="max-h-[420px] divide-y divide-hairline/60 overflow-y-auto">
        {lines.map((l) => {
          const editing = openId === l.id;
          const field = (key: string, label: string, mode: "text" | "num" = "num") => (
            <div key={key} className="w-[130px]">
              <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3" htmlFor={`${testId}-${key}-${l.id}`}>
                {label}
              </label>
              <Input
                id={`${testId}-${key}-${l.id}`}
                data-testid={`${testId}-${key}-input-${l.id}`}
                inputMode={mode === "num" ? "decimal" : "text"}
                value={draft[key] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                className="mt-1 h-10 text-base"
              />
            </div>
          );
          return (
            <div key={l.id} className="px-4 py-3" data-testid={`${testId}-row-${l.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-[220px] flex-1">
                  <div className="text-[15px] font-medium text-ink" data-testid={`${testId}-room-${l.id}`}>
                    {l.building} · {l.unit} · {l.room}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-brand" data-testid={`${testId}-product-${l.id}`}>
                    {l.product || l.floor_type || "—"}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-ink-3">
                    {l.scope === "accessory"
                      ? `${num(l.qty, 0)} ea @ ${money(l.unit_price)}`
                      : l.scope === "misc"
                        ? "flat price"
                        : `${num(l.sqft, 0)} sf @ ${money(l.material_cost_per_sqft)}/sf · ${num(l.labor_hours, 1)} hr`}
                  </div>
                </div>
                <div className="font-mono text-lg font-semibold text-brand" data-testid={`${testId}-cost-${l.id}`}>
                  {money(l.cost ?? 0)}
                </div>
                {!readOnly && (
                  editing ? (
                    <div className="flex gap-2">
                      <Button size="sm" data-testid={`${testId}-commit-${l.id}`} disabled={pending} onClick={() => commit(l)}>
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
                      </Button>
                      <Button size="sm" variant="ghost" data-testid={`${testId}-cancel-${l.id}`} onClick={() => setOpenId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" data-testid={`${testId}-edit-${l.id}`} onClick={() => start(l)}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                  )
                )}
              </div>
              {editing && (
                <div className="mt-3 flex flex-wrap items-end gap-4 border-t border-hairline/60 pt-3">
                  <div className="min-w-[240px] flex-1">
                    <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3" htmlFor={`${testId}-product-${l.id}`}>
                      Product / material name
                    </label>
                    <Input
                      id={`${testId}-product-${l.id}`}
                      data-testid={`${testId}-product-input-${l.id}`}
                      value={draft.product ?? ""}
                      placeholder="Shaw Fifth Avenue Oak 5mm SPC"
                      onChange={(e) => setDraft((d) => ({ ...d, product: e.target.value }))}
                      className="mt-1 h-10 text-base"
                    />
                  </div>
                  {l.scope === "accessory"
                    ? [field("qty", "Qty"), field("unit_price", "$ each"), field("labor_hours", "Labor hr")]
                    : l.scope === "misc"
                      ? [field("flat_cost", "Flat price")]
                      : [field("sqft", "Sq ft"), field("material_cost_per_sqft", "$ / sq ft"), field("labor_hours", "Labor hr")]}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
