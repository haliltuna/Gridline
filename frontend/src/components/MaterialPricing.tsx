import { useState } from "react";
import { ClipboardList, Check, Repeat, Loader2 } from "lucide-react";
import type { SpecEntry, SpecPriceItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Spec-first pricing: the finish schedule is read before the drawings, so the estimator can
// set the material price for each specified flooring product (and swap in the approved
// alternative) BEFORE any measuring happens. Prices land on every matching takeoff line.
export default function MaterialPricing({
  specs, onSave, onSkip, pending, saved,
}: {
  specs: SpecEntry[];
  onSave: (items: SpecPriceItem[]) => void;
  onSkip?: () => void;
  pending?: boolean;
  saved?: boolean;
}) {
  const [prices, setPrices] = useState<Record<number, string>>(() =>
    Object.fromEntries(specs.map((s, i) => [i, s.price_per_sqft != null ? String(s.price_per_sqft) : ""])),
  );
  const [alts, setAlts] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(specs.map((s, i) => [i, Boolean(s.use_alternative)])),
  );

  const submit = () => {
    const items: SpecPriceItem[] = specs.map((_, i) => ({
      index: i,
      price_per_sqft: prices[i] === "" || prices[i] == null ? null : Number(prices[i]),
      use_alternative: Boolean(alts[i]),
    }));
    onSave(items);
  };

  if (specs.length === 0) return null;

  return (
    <div className="border border-brand/40 bg-surface" data-testid="material-pricing">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-4">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-brand">
            <ClipboardList className="h-3.5 w-3.5" /> Price the specified materials
          </div>
          <p className="mt-2 text-[15px] text-ink-2">
            {specs.length} flooring product{specs.length === 1 ? "" : "s"} came off the schedule. Set your
            supply cost per sq ft now and it goes straight onto every matching room, quote and invoice.
          </p>
        </div>
        {saved && (
          <span className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-emerald-400"
                data-testid="material-pricing-saved">
            <Check className="h-3.5 w-3.5" /> saved
          </span>
        )}
      </div>

      <div className="max-h-[340px] divide-y divide-hairline/60 overflow-y-auto">
        {specs.map((s, i) => (
          <div key={`${s.room_pattern}-${i}`} className="flex flex-wrap items-center gap-4 px-5 py-4"
               data-testid={`spec-price-row-${i}`}>
            <div className="min-w-[210px] flex-1">
              <div className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
                {s.room_pattern || "All rooms"} · {s.surface}
              </div>
              <div className="mt-1 text-[15px] font-medium text-ink" data-testid={`spec-product-${i}`}>
                {alts[i] && s.alternative ? s.alternative : s.product || s.floor_type || "—"}
              </div>
              {s.alternative ? (
                <button
                  type="button"
                  data-testid={`spec-alt-toggle-${i}`}
                  onClick={() => setAlts((a) => ({ ...a, [i]: !a[i] }))}
                  className={cn(
                    "mt-2 inline-flex items-center gap-1.5 border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors",
                    alts[i] ? "border-brand/50 bg-brand-soft text-brand" : "border-hairline text-ink-3 hover:text-ink",
                  )}
                >
                  <Repeat className="h-3 w-3" />
                  {alts[i] ? "using alternative" : "use alternative"}
                </button>
              ) : (
                <div className="mt-2 font-mono text-[11px] uppercase tracking-wider text-ink-4">no alternative specified</div>
              )}
            </div>
            <div className="w-[160px]">
              <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3" htmlFor={`spec-price-${i}`}>
                Material $ / sq ft
              </label>
              <Input
                id={`spec-price-${i}`}
                data-testid={`spec-price-input-${i}`}
                inputMode="decimal"
                value={prices[i] ?? ""}
                placeholder="2.85"
                onChange={(e) => setPrices((p) => ({ ...p, [i]: e.target.value }))}
                className="mt-1 h-11 text-base"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 border-t border-hairline px-5 py-4">
        <Button data-testid="material-pricing-save-button" className="font-semibold" disabled={pending} onClick={submit}>
          {pending ? (<><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>) : "Save material pricing"}
        </Button>
        {onSkip && (
          <Button variant="ghost" data-testid="material-pricing-skip-button" onClick={onSkip}>
            Skip — price it later on the takeoff
          </Button>
        )}
      </div>
    </div>
  );
}
