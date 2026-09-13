import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Gauge } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Usage } from "@/lib/types";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Page allowance meter with an UPGRADE prompt. There is no overage billing: once the
// allowance is gone the backend refuses the upload, so the warning has to arrive early.
export default function UsageMeter({ compact = false }: { compact?: boolean }) {
  const usage = useQuery<Usage>({ queryKey: ["usage"], queryFn: () => apiGet<Usage>("/billing/usage"), retry: false });
  const u = usage.data;
  if (!u) return null;

  const unlimited = u.pages_included < 0;
  const pct = unlimited ? 6 : Math.min(100, Math.round((u.pages_used / Math.max(1, u.pages_included)) * 100));
  const alert = u.limit_reached || u.near_limit;

  if (compact && !alert) return null;

  return (
    <div
      data-testid="usage-meter"
      className={cn("border p-5",
        u.limit_reached ? "border-red-500/50 bg-red-500/10"
          : u.near_limit ? "border-amber-400/50 bg-amber-400/10"
          : "border-hairline bg-surface")}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-3">
            {alert ? <AlertTriangle className="h-3.5 w-3.5" /> : <Gauge className="h-3.5 w-3.5" />}
            {u.plan_name} · page allowance
          </div>
          <p className="mt-2 text-[15px] text-ink-2" data-testid="usage-meter-message">
            {u.limit_reached
              ? `You have used all ${u.pages_included} blueprint pages on ${u.plan_name}. Uploads are paused — upgrade to keep reading sets. We never auto-charge you for extra pages.`
              : unlimited
                ? "Pooled page volume on your plan — no per-upload cap."
                : `${u.pages_remaining} of ${u.pages_included} pages left this period${u.near_limit ? " — upgrade before your next big set." : "."}`}
          </p>
        </div>
        <Link to="/billing" data-testid="usage-meter-upgrade-link"
              className={cn(buttonVariants({ variant: u.limit_reached ? "default" : "outline", size: "sm" }), "font-semibold")}>
          {u.limit_reached ? "Upgrade now" : "See plans"}
        </Link>
      </div>
      {!unlimited && (
        <div className="mt-4 h-2 w-full bg-hairline">
          <div className={cn("h-full transition-[width] duration-200",
            u.limit_reached ? "bg-red-400" : u.near_limit ? "bg-amber-400" : "bg-brand")}
            style={{ width: `${pct}%` }} data-testid="usage-meter-bar" />
        </div>
      )}
    </div>
  );
}
