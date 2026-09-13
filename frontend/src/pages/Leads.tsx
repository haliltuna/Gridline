import { useQuery } from "@tanstack/react-query";
import { Inbox, Mail, Building2 } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Lead } from "@/lib/types";
import Shell, { Panel, Stat } from "@/components/Shell";

// Demo requests submitted from the landing page. Owner-only (team:write permission).
export default function Leads() {
  const leads = useQuery<Lead[]>({ queryKey: ["leads"], queryFn: () => apiGet<Lead[]>("/leads"), retry: false });
  const rows = leads.data ?? [];
  const thisWeek = rows.filter((l) => Date.now() - new Date(l.created_at).getTime() < 7 * 864e5).length;

  return (
    <Shell title="Demo requests" subtitle="Everyone who asked for a demo or Enterprise pricing from the site.">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat testId="leads-total" label="Total requests" value={String(rows.length)} />
        <Stat testId="leads-week" label="Last 7 days" value={String(thisWeek)} />
        <Stat testId="leads-enterprise" label="Enterprise interest"
              value={String(rows.filter((l) => l.interest === "enterprise").length)} />
      </div>

      <Panel className="mt-8">
        <h2 className="flex items-center gap-2 font-heading text-lg font-semibold text-ink">
          <Inbox className="h-5 w-5 text-brand" /> Inbox
        </h2>
        {rows.length === 0 && (
          <p className="mt-3 text-ink-3" data-testid="leads-empty">
            No demo requests yet. They land here the moment someone submits the form on the landing page.
          </p>
        )}
        <div className="mt-5 space-y-3" data-testid="leads-list">
          {rows.map((l) => (
            <div key={l.id} data-testid={`lead-row-${l.id}`}
                 className="border border-hairline bg-surface-2 p-5 transition-colors hover:border-brand/40">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-heading text-lg font-semibold text-ink" data-testid={`lead-name-${l.id}`}>
                      {l.name}
                    </span>
                    <span className="rounded-full border border-hairline bg-surface px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-widest text-ink-3">
                      {l.interest}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-4 font-mono text-xs text-ink-3">
                    <a href={`mailto:${l.email}`} className="inline-flex items-center gap-1.5 hover:text-brand">
                      <Mail className="h-3.5 w-3.5" /> {l.email}
                    </a>
                    {l.company && (
                      <span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> {l.company}</span>
                    )}
                    {l.crew_size && <span>{l.crew_size} estimator(s)</span>}
                    {l.phone && <span>{l.phone}</span>}
                  </div>
                  {l.message && <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-ink-2">{l.message}</p>}
                </div>
                <span className="shrink-0 font-mono text-xs text-ink-3">{l.created_at.slice(0, 10)}</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </Shell>
  );
}
