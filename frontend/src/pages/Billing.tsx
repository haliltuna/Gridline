import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, CreditCard, Gauge, ExternalLink } from "lucide-react";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import type { CheckoutOut, CheckoutSession, CostModel, PlanTier, Usage, User } from "@/lib/types";
import { money } from "@/lib/types";
import Shell, { Panel } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const pct = (used: number, included: number) =>
  included <= 0 ? 0 : Math.min(100, Math.round((used / included) * 100));

export default function Billing() {
  const qc = useQueryClient();
  const [annual, setAnnual] = useState(true);
  const plans = useQuery<PlanTier[]>({ queryKey: ["plans"], queryFn: () => apiGet<PlanTier[]>("/billing/plans"), retry: false });
  const me = useQuery<User>({ queryKey: ["me"], queryFn: () => apiGet<User>("/auth/me"), retry: false });
  const usage = useQuery<Usage>({ queryKey: ["usage"], queryFn: () => apiGet<Usage>("/billing/usage"), retry: false });
  const costs = useQuery<CostModel>({ queryKey: ["cost-model"], queryFn: () => apiGet<CostModel>("/billing/cost-model"), retry: false });

  const checkout = useMutation({
    mutationFn: (planId: string) =>
      apiPost<CheckoutSession>("/payments/checkout", {
        plan_id: planId, period: annual ? "annual" : "monthly", origin_url: window.location.origin,
      }),
    onSuccess: (s) => { window.location.href = s.checkout_url; },
    onError: (e) => {
      const detail = e instanceof ApiError ? (e.body as { detail?: string })?.detail : null;
      toast.error(detail ?? "Could not start checkout");
    },
  });
  const startTrial = useMutation({
    mutationFn: () => apiPost<CheckoutOut>("/billing/checkout", { plan_id: "trial" }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["me"] });
      void qc.invalidateQueries({ queryKey: ["usage"] });
      toast.success(r.message);
    },
  });

  const current = me.data?.plan ?? "trial";
  const u = usage.data;
  const c = costs.data;
  const perPage = useMemo(() => (c ? c.page_cost : 0.115), [c]);

  return (
    <Shell title="Billing & usage" subtitle="Pages are the meter — one blueprint page is one AI read.">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Panel data-testid="billing-usage-panel">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#E2F952]">Current plan</div>
              <div className="mt-2 font-heading text-3xl font-semibold text-slate-100" data-testid="billing-current-plan">
                {u?.plan_name ?? "—"}
              </div>
              <div className="mt-1 font-mono text-xs text-slate-500">
                {u ? `${u.period} billing · ${u.seats_used}/${u.seat_count < 0 ? "∞" : u.seat_count} seats used` : ""}
              </div>
            </div>
            <Gauge className="h-8 w-8 text-slate-600" />
          </div>

          {u && (
            <div className="mt-7 space-y-6">
              {([
                ["Blueprint pages this period", u.pages_used, u.pages_included, "usage-pages"],
                ["Jobs this period", u.jobs_used, u.jobs_included, "usage-jobs"],
              ] as const).map(([label, used, included, id]) => (
                <div key={id}>
                  <div className="flex items-end justify-between">
                    <span className="text-[15px] text-slate-300">{label}</span>
                    <span className="font-mono text-lg font-semibold text-white" data-testid={id}>
                      {used} / {included < 0 ? "unlimited" : included}
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full bg-slate-800">
                    <div
                      className={cn("h-full transition-[width] duration-200", pct(used, included) > 85 ? "bg-amber-400" : "bg-[#E2F952]")}
                      style={{ width: `${included < 0 ? 8 : pct(used, included)}%` }}
                    />
                  </div>
                </div>
              ))}
              <div className="grid gap-4 border-t border-slate-800 pt-5 sm:grid-cols-3 font-mono">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Max file size</div>
                  <div className="mt-1 text-xl font-semibold text-white" data-testid="usage-max-mb">{u.max_file_mb} MB</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Overage pages</div>
                  <div className="mt-1 text-xl font-semibold text-white" data-testid="usage-overage">{u.overage_pages}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Overage due</div>
                  <div className="mt-1 text-xl font-semibold text-[#E2F952]" data-testid="usage-overage-cost">{money(u.overage_cost)}</div>
                </div>
              </div>
            </div>
          )}
        </Panel>

        <Panel data-testid="billing-cost-model">
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#E2F952]">What a page costs us</div>
          <h2 className="mt-2 font-heading text-xl font-semibold text-slate-100">
            {money(perPage)} per blueprint page
          </h2>
          <div className="mt-5 space-y-3">
            {(c?.breakdown ?? []).map((b) => (
              <div key={b.item} className="flex items-start justify-between gap-4 border-b border-slate-800/60 pb-3">
                <div>
                  <div className="text-[15px] text-slate-200">{b.item}</div>
                  <div className="font-mono text-xs text-slate-500">{b.detail}</div>
                </div>
                <span className="shrink-0 font-mono text-base font-semibold text-white">${b.cost.toFixed(3)}</span>
              </div>
            ))}
          </div>
          <p className="mt-5 text-[15px] leading-relaxed text-slate-400">
            Every tier is sized so a fully-used allowance still leaves a{" "}
            {Math.round((c?.target_margin ?? 0.75) * 100)}% gross margin — about two pages per dollar.
            Past the allowance it is {money(c?.overage_per_page ?? 0.5)} per page, never a hard stop.
          </p>
        </Panel>
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-heading text-2xl font-semibold text-slate-100">Plans</h2>
        <div className="inline-flex items-center gap-1 border border-slate-800 bg-[#0F1722] p-1" data-testid="billing-toggle">
          {([["annual", "Annual · save 20%"], ["monthly", "Monthly"]] as const).map(([k, label]) => (
            <button
              key={k} type="button" data-testid={`billing-toggle-${k}`}
              onClick={() => setAnnual(k === "annual")}
              className={cn("px-4 py-2 font-mono text-xs uppercase tracking-widest transition-colors duration-150",
                (k === "annual") === annual ? "bg-[#E2F952] text-[#090D11]" : "text-slate-400 hover:text-slate-200")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3" data-testid="billing-plans">
        {(plans.data ?? []).map((p) => {
          const sub = p.kind === "subscription";
          const shown = sub ? (annual ? p.price : p.monthly_price) : p.price;
          return (
            <div
              key={p.id}
              data-testid={`billing-plan-${p.id}`}
              className={cn("flex flex-col border bg-[#0F1722] p-7",
                p.highlight ? "border-[#E2F952]/60 shadow-[0_0_40px_-14px_rgba(226,249,82,0.35)]" : "border-slate-800/80")}
            >
              {p.badge && (
                <span className={cn("mb-4 self-start rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-widest",
                  p.highlight ? "border-[#E2F952]/30 bg-[#1C2712] text-[#E2F952]" : "border-slate-700 bg-[#131D2A] text-slate-400")}>
                  {p.badge}
                </span>
              )}
              <h3 className="font-heading text-xl font-semibold text-slate-100">{p.name}</h3>
              <div className="mt-4 flex items-baseline gap-2">
                {p.kind === "contact" ? (
                  <span className="font-heading text-3xl font-semibold text-white" data-testid={`billing-price-${p.id}`}>Custom</span>
                ) : (
                  <>
                    <span className="font-mono text-5xl font-semibold text-white" data-testid={`billing-price-${p.id}`}>${shown}</span>
                    <span className="text-sm text-slate-500">{p.cadence}</span>
                  </>
                )}
              </div>
              <p className="mt-3 text-[15px] text-slate-400">{p.blurb}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 border-y border-slate-800 py-4 font-mono text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Pages</div>
                  <div className="mt-0.5 text-base font-semibold text-white" data-testid={`billing-pages-${p.id}`}>
                    {p.pages_included < 0 ? "Pooled" : `${p.pages_included}/mo`}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Max PDF</div>
                  <div className="mt-0.5 text-base font-semibold text-white">{p.max_file_mb} MB</div>
                </div>
              </div>
              <ul className="mt-5 flex-1 space-y-3">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2.5 text-[15px] text-slate-300">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#E2F952]" />{f}
                  </li>
                ))}
              </ul>
              {p.kind === "contact" ? (
                <a href="/#demo" data-testid={`billing-select-${p.id}`}
                   className="mt-8 inline-flex h-11 w-full items-center justify-center gap-2 border border-slate-700 font-semibold text-slate-200 transition-colors hover:border-[#E2F952]/50 hover:text-[#E2F952]">
                  Contact sales <ExternalLink className="h-4 w-4" />
                </a>
              ) : p.kind === "trial" ? (
                <Button size="lg" variant="outline" className="mt-8 w-full font-semibold"
                        data-testid={`billing-select-${p.id}`} disabled={current === p.id || startTrial.isPending}
                        onClick={() => startTrial.mutate()}>
                  {current === p.id ? "Current plan" : "Start free trial"}
                </Button>
              ) : (
                <Button
                  size="lg" variant={p.highlight ? "default" : "outline"} className="mt-8 w-full font-semibold"
                  data-testid={`billing-select-${p.id}`} disabled={checkout.isPending}
                  onClick={() => checkout.mutate(p.id)}
                >
                  <CreditCard className="h-4 w-4" />
                  {current === p.id ? "Renew / change billing" : `Pay with card`}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <Panel className="mt-10" data-testid="billing-competitors">
        <h2 className="font-heading text-xl font-semibold text-slate-100">What the trade pays elsewhere</h2>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-slate-800 font-mono text-[11px] uppercase tracking-wider text-slate-500">
                <th className="py-3">Tool</th><th className="py-3">Typical cost</th><th className="py-3">What you still do by hand</th>
              </tr>
            </thead>
            <tbody>
              {(c?.competitors ?? []).map((row) => (
                <tr key={row.name} className="border-b border-slate-800/60">
                  <td className="py-3 text-base text-slate-100">{row.name}</td>
                  <td className="py-3 font-mono text-base text-[#E2F952]">{row.price}</td>
                  <td className="py-3 text-[15px] text-slate-400">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <p className="mt-8 font-mono text-xs text-slate-600">
        Card payments run on real Stripe Checkout in TEST mode — use 4242 4242 4242 4242, any future expiry, any CVC.
      </p>
    </Shell>
  );
}
