import { Link, NavLink, useNavigate } from "react-router-dom";
import { useEffect, type ReactNode } from "react";
import { LayoutGrid, Upload, FileText, Receipt, Settings as Cog, CreditCard, LogOut, Activity, Users, TrendingDown, Inbox } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { endSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Jobs", icon: LayoutGrid, id: "jobs" },
  { to: "/upload", label: "Upload", icon: Upload, id: "upload" },
  { to: "/invoices", label: "Invoices", icon: FileText, id: "invoices" },
  { to: "/expenses", label: "Profit", icon: Receipt, id: "expenses" },
  { to: "/costing", label: "Costing", icon: TrendingDown, id: "costing" },
  { to: "/leads", label: "Demos", icon: Inbox, id: "leads" },
  { to: "/team", label: "Team", icon: Users, id: "team" },
  { to: "/settings", label: "Settings", icon: Cog, id: "settings" },
  { to: "/billing", label: "Billing", icon: CreditCard, id: "billing" },
];

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-heading font-bold tracking-tight", className)}>
      <span className="grid h-7 w-7 place-items-center border border-brand/40 bg-brand-soft text-brand">
        <Activity className="h-4 w-4" />
      </span>
      <span className="text-ink">GRID<span className="text-brand">LINE</span></span>
    </span>
  );
}

export default function Shell({ children, title, subtitle, action }: {
  children: ReactNode; title: string; subtitle?: string; action?: ReactNode;
}) {
  const { user, loading, signedOut, unreachable } = useAuth();
  const navigate = useNavigate();

  // Redirect ONLY on a confirmed 401. While loading, or when /auth/me is unreachable,
  // stay put and render the shell — bouncing on an unknown state is what made sign-in
  // look stuck.
  useEffect(() => {
    if (signedOut) navigate("/login", { replace: true });
  }, [signedOut, navigate]);

  if (loading && !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-background" data-testid="shell-loading">
        <div className="flex items-center gap-3 font-mono text-sm uppercase tracking-[0.2em] text-brand">
          <span className="h-2 w-2 animate-pulse bg-brand" /> Loading Gridline…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-hairline/80 bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-5 py-3">
          <Link to="/dashboard" data-testid="shell-logo-link"><Logo /></Link>
          <nav className="flex flex-1 flex-wrap items-center gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.id}
                to={n.to}
                data-testid={`nav-${n.id}-link`}
                className={({ isActive }) =>
                  cn(
                    "inline-flex items-center gap-2 border border-transparent px-3 py-2 text-sm font-medium text-ink-3 transition-colors hover:border-hairline hover:text-ink",
                    isActive && "border-brand/40 bg-brand-soft text-brand",
                  )
                }
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <ThemeSwitcher compact />
            <span className="hidden font-mono text-xs text-ink-3 sm:inline" data-testid="shell-user-email">
              {user?.email ?? ""}
            </span>
            <Button variant="ghost" size="sm" data-testid="logout-button" onClick={() => void endSession()}>
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      {unreachable && (
        <div className="border-b border-amber-500/40 bg-amber-500/10 px-5 py-2.5 text-center text-sm text-amber-200" data-testid="shell-offline-banner">
          Can't reach the Gridline server right now — your data will reappear when the connection is back.
        </div>
      )}

      <main className="mx-auto max-w-[1400px] px-5 py-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold tracking-tight text-ink" data-testid="page-title">
              {title}
            </h1>
            {subtitle && <p className="mt-1 text-base text-ink-3">{subtitle}</p>}
          </div>
          {action}
        </div>
        {children}
      </main>
    </div>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("border border-hairline/80 bg-surface p-5 transition-colors hover:border-hairline", className)}>
      {children}
    </div>
  );
}

export function Stat({ label, value, hint, testId }: { label: string; value: string; hint?: string; testId: string }) {
  return (
    <Panel className="gl-rise">
      <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand">{label}</div>
      <div className="mt-2 font-mono text-3xl font-semibold tracking-tight text-ink" data-testid={testId}>{value}</div>
      {hint && <div className="mt-1 text-sm text-ink-3">{hint}</div>}
    </Panel>
  );
}

const STATUS_STYLES: Record<string, string> = {
  draft: "border-ink-4 text-ink-2",
  reading: "border-sky-500/50 text-sky-300",
  takeoff: "border-brand/50 text-brand",
  quoted: "border-amber-500/50 text-amber-300",
  accepted: "border-emerald-500/50 text-emerald-300",
  invoiced: "border-sky-500/50 text-sky-300",
  paid: "border-emerald-500/60 text-emerald-300",
  unpaid: "border-amber-500/50 text-amber-300",
  sent: "border-sky-500/50 text-sky-300",
  superseded: "border-hairline text-ink-3",
};

export function StatusBadge({ status, testId }: { status: string; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={cn(
        "inline-flex items-center border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.15em]",
        STATUS_STYLES[status] ?? "border-hairline text-ink-3",
      )}
    >
      {status}
    </span>
  );
}
