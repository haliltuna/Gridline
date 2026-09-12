import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, CreditCard } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import type { CheckoutOut, Plan, User } from "@/lib/types";
import Shell, { Panel } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Billing() {
  const qc = useQueryClient();
  const plans = useQuery<Plan[]>({ queryKey: ["plans"], queryFn: () => apiGet<Plan[]>("/billing/plans"), retry: false });
  const me = useQuery<User>({ queryKey: ["me"], queryFn: () => apiGet<User>("/auth/me"), retry: false });

  const checkout = useMutation({
    mutationFn: (planId: string) => apiPost<CheckoutOut>("/billing/checkout", { plan_id: planId }),
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ["me"] }); toast.success(r.message); },
    onError: () => toast.error("Checkout failed"),
  });

  const current = me.data?.plan ?? "";

  return (
    <Shell title="Billing" subtitle="Pay per job, grab a five-pack, or go unlimited.">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#E2F952]">Current plan</div>
            <div className="mt-2 font-heading text-2xl font-semibold text-slate-100" data-testid="billing-current-plan">
              {current === "pro" ? "Unlimited Pro" : current === "five" ? "Five Pack" : current === "single" ? "Single Job" : "Free trial"}
            </div>
          </div>
          <CreditCard className="h-8 w-8 text-slate-600" />
        </div>
      </Panel>

      <div className="mt-8 grid gap-6 lg:grid-cols-3" data-testid="billing-plans">
        {(plans.data ?? []).map((p) => (
          <div
            key={p.id}
            data-testid={`billing-plan-${p.id}`}
            className={cn(
              "flex flex-col border bg-[#0F1722] p-7",
              p.highlight ? "border-[#E2F952]/60 shadow-[0_0_40px_-14px_rgba(226,249,82,0.35)]" : "border-slate-800/80",
            )}
          >
            {p.highlight && <span className="mb-4 self-start rounded-full border border-[#E2F952]/30 bg-[#1C2712] px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-[#E2F952]">Most popular</span>}
            <h3 className="font-heading text-xl font-semibold text-slate-100">{p.name}</h3>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="font-mono text-5xl font-semibold text-white" data-testid={`billing-price-${p.id}`}>${p.price}</span>
              <span className="text-sm text-slate-500">{p.cadence}</span>
            </div>
            <p className="mt-3 text-[15px] text-slate-400">{p.blurb}</p>
            <ul className="mt-6 flex-1 space-y-3">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2.5 text-[15px] text-slate-300">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#E2F952]" />{f}
                </li>
              ))}
            </ul>
            <Button
              size="lg"
              variant={p.highlight ? "default" : "outline"}
              className="mt-8 w-full font-semibold"
              data-testid={`billing-select-${p.id}`}
              disabled={checkout.isPending || current === p.id}
              onClick={() => checkout.mutate(p.id)}
            >
              {current === p.id ? "Current plan" : p.id === "pro" ? "Start free trial" : "Choose plan"}
            </Button>
          </div>
        ))}
      </div>

      <p className="mt-8 font-mono text-xs text-slate-600">Stripe checkout is MOCKED in this build — selecting a plan switches it instantly with no card charged.</p>
    </Shell>
  );
}
