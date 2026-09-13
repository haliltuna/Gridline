import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { TrendingDown } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { CostingOverview } from "@/lib/types";
import { money } from "@/lib/types";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Margin alerts: the moment a job's actual spend eats into the bid, it shows up here on
// the dashboard instead of being discovered at the end of the job.
const THRESHOLD = 20; // % margin below which a job is flagged

export default function MarginAlerts() {
  const q = useQuery<CostingOverview>({
    queryKey: ["costing-overview"],
    queryFn: () => apiGet<CostingOverview>("/costing/overview"),
    retry: false,
  });
  const rows = (q.data?.rows ?? []).filter(
    (r) => (r.actual_expenses > 0 || r.quoted_total > 0) && r.margin_pct < THRESHOLD,
  );
  if (rows.length === 0) return null;

  return (
    <div className="border border-amber-400/50 bg-amber-400/10 p-5" data-testid="margin-alerts">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-amber-500">
            <TrendingDown className="h-3.5 w-3.5" /> Margin alert · {rows.length} job(s)
          </div>
          <ul className="mt-3 space-y-2">
            {rows.slice(0, 4).map((r) => (
              <li key={r.job_id} className="text-[15px] text-ink-2" data-testid={`margin-alert-${r.job_id}`}>
                <Link to={`/jobs/${r.job_id}`} className="font-semibold text-ink hover:text-brand">{r.job_name}</Link>
                {" — "}spend {money(r.actual_expenses)} against {money(r.invoiced_total || r.quoted_total)} billed
                {" · "}<span className={cn("font-mono font-semibold", r.margin_pct < 0 ? "text-red-500" : "text-amber-500")}>
                  {r.margin_pct}% margin
                </span>
              </li>
            ))}
          </ul>
        </div>
        <Link to="/costing" data-testid="margin-alerts-link"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "font-semibold")}>
          Open job costing
        </Link>
      </div>
    </div>
  );
}
