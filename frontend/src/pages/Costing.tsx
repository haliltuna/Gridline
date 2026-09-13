import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, TrendingDown, AlertTriangle } from "lucide-react";
import { apiGet, ApiError } from "@/lib/api";
import type { CostingOverview } from "@/lib/types";
import { money } from "@/lib/types";
import Shell, { Panel, Stat, StatusBadge } from "@/components/Shell";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Bid vs actual for every job on one page, worst margin first — the "where am I bleeding"
// screen. Job-level detail still lives on each takeoff page.
export default function Costing() {
  const q = useQuery<CostingOverview>({
    queryKey: ["costing-overview"],
    queryFn: () => apiGet<CostingOverview>("/costing/overview"),
    retry: false,
  });
  const gated = q.error instanceof ApiError && q.error.status === 402;
  const d = q.data;

  return (
    <Shell
      title="Job costing"
      subtitle="Every job, bid against actual spend. Worst margin at the top."
      action={
        <a href="/api/export/expenses.csv" data-testid="costing-export-link"
           className={cn(buttonVariants({ variant: "outline" }), "font-semibold")}>
          <Download className="h-4 w-4" /> Expenses CSV
        </a>
      }
    >
      {gated && (
        <Panel className="border-[#E2F952]/40" data-testid="costing-upgrade">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-heading text-xl font-semibold text-slate-100">Job costing is a Contractor Pro feature</h2>
              <p className="mt-2 text-[15px] text-slate-400">
                {(q.error as ApiError).body && typeof (q.error as ApiError).body === "object"
                  ? String(((q.error as ApiError).body as { detail?: string }).detail ?? "")
                  : "Upgrade to unlock bid vs actual."}
              </p>
            </div>
            <Link to="/billing" className={cn(buttonVariants({ size: "lg" }), "font-semibold")}>See plans</Link>
          </div>
        </Panel>
      )}

      {!gated && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat testId="costing-total-quoted" label="Quoted / invoiced" value={d ? money(d.quoted_total) : "—"} />
            <Stat testId="costing-total-actual" label="Actual spend" value={d ? money(d.actual_total) : "—"} />
            <Stat testId="costing-total-collected" label="Collected" value={d ? money(d.collected_total) : "—"} />
            <Stat testId="costing-total-margin" label="Portfolio margin" value={d ? `${d.margin_pct}%` : "—"} />
          </div>

          <Panel className="mt-8">
            <h2 className="flex items-center gap-2 font-heading text-lg font-semibold text-slate-100">
              <TrendingDown className="h-5 w-5 text-[#E2F952]" /> Bid vs actual by job
            </h2>
            {(d?.rows.length ?? 0) === 0 && (
              <p className="mt-3 text-slate-400" data-testid="costing-empty">
                No jobs to cost yet — read a blueprint and log expenses against it.
              </p>
            )}
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[900px] text-left" data-testid="costing-table">
                <thead>
                  <tr className="border-b border-slate-800 font-mono text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="py-3">Job</th>
                    <th className="py-3">Status</th>
                    <th className="py-3 text-right">Quoted</th>
                    <th className="py-3 text-right">Invoiced</th>
                    <th className="py-3 text-right">Actual spend</th>
                    <th className="py-3 text-right">Variance</th>
                    <th className="py-3 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {(d?.rows ?? []).map((r) => {
                    const bad = r.margin_pct < 15 && (r.quoted_total > 0 || r.actual_expenses > 0);
                    return (
                      <tr key={r.job_id} className="border-b border-slate-800/60" data-testid={`costing-row-${r.job_id}`}>
                        <td className="py-3.5 pr-4">
                          <Link to={`/jobs/${r.job_id}`} className="text-base text-slate-100 hover:text-[#E2F952]">
                            {r.job_name}
                          </Link>
                          <div className="font-mono text-xs text-slate-500">
                            {r.client_name || "No client"} · {r.expense_count} expense(s)
                          </div>
                        </td>
                        <td className="py-3.5"><StatusBadge status={r.status} testId={`costing-status-${r.job_id}`} /></td>
                        <td className="py-3.5 text-right font-mono text-base text-slate-300">{money(r.quoted_total)}</td>
                        <td className="py-3.5 text-right font-mono text-base text-slate-300">{money(r.invoiced_total)}</td>
                        <td className="py-3.5 text-right font-mono text-base text-slate-300">{money(r.actual_expenses)}</td>
                        <td className={cn("py-3.5 text-right font-mono text-base font-semibold",
                          r.variance >= 0 ? "text-[#E2F952]" : "text-red-400")}
                          data-testid={`costing-variance-${r.job_id}`}>
                          {money(r.variance)}
                        </td>
                        <td className="py-3.5 text-right">
                          <span className={cn("inline-flex items-center gap-1.5 font-mono text-base font-semibold",
                            bad ? "text-amber-300" : "text-white")}
                            data-testid={`costing-margin-${r.job_id}`}>
                            {bad && <AlertTriangle className="h-4 w-4" />}{r.margin_pct}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-5 font-mono text-xs text-slate-600">
              Variance = invoiced (or quoted, if not yet invoiced) minus expenses tagged to the job.
            </p>
          </Panel>
        </>
      )}
    </Shell>
  );
}
