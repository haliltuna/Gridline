import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, Plus, FileWarning } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { DashboardStats, Job } from "@/lib/types";
import { money, num } from "@/lib/types";
import Shell, { Panel, Stat, StatusBadge } from "@/components/Shell";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const navigate = useNavigate();
  const jobs = useQuery<Job[]>({ queryKey: ["jobs"], queryFn: () => apiGet<Job[]>("/jobs"), retry: false });
  const stats = useQuery<DashboardStats>({ queryKey: ["stats"], queryFn: () => apiGet<DashboardStats>("/dashboard/stats"), retry: false });
  const s = stats.data;

  return (
    <Shell
      title="Jobs"
      subtitle="Every blueprint set you've read, grouped by client."
      action={
        <Link to="/upload" data-testid="dashboard-new-job-button" className={cn(buttonVariants({ size: "lg" }), "font-semibold")}>
          <Plus className="h-4 w-4" /> New takeoff
        </Link>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat testId="stat-jobs" label="Active jobs" value={s ? num(s.jobs) : "—"} />
        <Stat testId="stat-sqft" label="Sq ft measured" value={s ? num(s.sqft_measured) : "—"} />
        <Stat testId="stat-unpaid" label="Unpaid invoices" value={s ? money(s.unpaid_total) : "—"} />
        <Stat testId="stat-paid" label="Paid this month" value={s ? money(s.paid_this_month) : "—"} />
      </div>

      <div className="mt-10">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="font-heading text-xl font-semibold text-slate-100">Job list</h2>
          <span className="font-mono text-xs text-slate-500">{jobs.data?.length ?? 0} total</span>
        </div>

        {jobs.isLoading && <Panel><p className="text-slate-400">Loading jobs…</p></Panel>}

        {!jobs.isLoading && (jobs.isError || (jobs.data ?? []).length === 0) && (
          <Panel className="text-center">
            <FileWarning className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-3 text-slate-300" data-testid="dashboard-empty-state">
              {jobs.isError ? "Jobs are unavailable right now." : "No jobs yet — upload your first blueprint set."}
            </p>
            <Link to="/upload" className={cn(buttonVariants({ variant: "outline" }), "mt-5")}>Upload a blueprint</Link>
          </Panel>
        )}

        <div className="grid gap-4" data-testid="job-list">
          {(jobs.data ?? []).map((j) => (
            <button
              key={j.id}
              type="button"
              data-testid={`job-card-${j.id}`}
              onClick={() => navigate(`/jobs/${j.id}`)}
              className="group border border-slate-800/80 bg-[#0F1722] p-6 text-left transition-colors hover:border-[#E2F952]/40 hover:bg-[#131D2A]"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 shrink-0 text-[#E2F952]" />
                    <h3 className="font-heading text-xl font-semibold text-slate-100">{j.name}</h3>
                    <StatusBadge status={j.status} testId={`job-status-${j.id}`} />
                  </div>
                  <p className="mt-2 text-[15px] text-slate-400">{j.client_name || "No client set"} · {j.address || "No address"}</p>
                  {j.brief && <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-500">{j.brief}</p>}
                  {j.flags.length > 0 && (
                    <p className="mt-3 inline-flex items-center gap-2 border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-300">
                      <FileWarning className="h-4 w-4" /> {j.flags.length} item flagged for review
                    </p>
                  )}
                </div>
                <div className="grid shrink-0 grid-cols-3 gap-6 font-mono">
                  {[["Buildings", j.buildings], ["Units", j.units], ["Pages", j.pages]].map(([l, v]) => (
                    <div key={String(l)}>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{l}</div>
                      <div className="mt-1 text-2xl font-semibold text-white">{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Shell>
  );
}
