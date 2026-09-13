import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Clock, Zap } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Usage } from "@/lib/types";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Trial countdown: how many days of the 14-day Unlimited Pro trial are left, with one tap
// to the plan that keeps the account running. The window is computed server-side from the
// account's own start date — never from the browser clock.
export default function TrialCountdown() {
  const usage = useQuery<Usage>({ queryKey: ["usage"], queryFn: () => apiGet<Usage>("/billing/usage"), retry: false });
  const u = usage.data;
  if (!u || u.plan_kind !== "trial") return null;

  const days = u.trial_days_left;
  const urgent = days <= 3;

  return (
    <div
      data-testid="trial-countdown"
      className={cn("flex flex-wrap items-center justify-between gap-4 border px-5 py-4",
        urgent ? "border-red-500/50 bg-red-500/10" : "border-brand/40 bg-brand-soft")}
    >
      <div className="flex items-start gap-3">
        <Clock className={cn("mt-0.5 h-5 w-5 shrink-0", urgent ? "text-red-400" : "text-brand")} />
        <div>
          <div className="font-heading text-lg font-semibold text-ink" data-testid="trial-days-left">
            {days > 0
              ? `${days} day${days === 1 ? "" : "s"} left on your Unlimited Pro trial`
              : "Your Unlimited Pro trial has ended"}
          </div>
          <p className="mt-1 text-sm text-ink-2">
            {days > 0
              ? `Trial ends ${u.trial_ends_on}. Quotes, invoices and takeoffs stay exactly as they are when you upgrade.`
              : "Pick a plan to keep quoting, invoicing and reading new blueprints."}
          </p>
        </div>
      </div>
      <Link
        to="/billing"
        data-testid="trial-upgrade-button"
        className={cn(buttonVariants({ size: "lg" }), "font-semibold")}
      >
        <Zap className="h-4 w-4" /> Upgrade to Unlimited Pro
      </Link>
    </div>
  );
}
