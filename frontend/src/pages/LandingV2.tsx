import { Link } from "react-router-dom";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowUpRight, Check, Minus } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import type { CostModel, Lead, PlanTier } from "@/lib/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// DESIGN VARIATION (route /v2). Same dark technical-readout DNA, deliberately different
// composition from the default landing page: an editorial left rail with oversized numbered
// sections, a single pricing MATRIX instead of card grid, and no hero screenshot mock —
// so the two can be compared side by side without rebuilding either.

const MATRIX_ROWS: { label: string; key: keyof PlanTier | "quote" | "invoice" | "costing" | "export" | "api" }[] = [
  { label: "Blueprint pages", key: "pages_included" },
  { label: "Jobs", key: "jobs_included" },
  { label: "Max PDF size", key: "max_file_mb" },
  { label: "Seats", key: "seat_count" },
  { label: "Quotes + email", key: "quote" },
  { label: "Invoices + card payment", key: "invoice" },
  { label: "Bid vs actual costing", key: "costing" },
  { label: "CSV / QuickBooks export", key: "export" },
  { label: "API access", key: "api" },
];

function cellFor(plan: PlanTier, key: string) {
  if (key === "pages_included") return plan.pages_included < 0 ? "Pooled" : String(plan.pages_included);
  if (key === "jobs_included") return plan.jobs_included < 0 ? "Unlimited" : String(plan.jobs_included);
  if (key === "max_file_mb") return `${plan.max_file_mb} MB`;
  if (key === "seat_count") return plan.seat_count < 0 ? "Unlimited" : String(plan.seat_count);
  return plan.capabilities.includes(key) ? "yes" : "no";
}

export default function LandingV2() {
  const plans = useQuery<PlanTier[]>({ queryKey: ["plans"], queryFn: () => apiGet<PlanTier[]>("/billing/plans"), retry: false });
  const costs = useQuery<CostModel>({ queryKey: ["cost-model"], queryFn: () => apiGet<CostModel>("/billing/cost-model"), retry: false });
  const [annual, setAnnual] = useState(true);
  const [email, setEmail] = useState("");
  const rows = (plans.data ?? []).filter((p) => p.kind !== "trial");

  const join = useMutation({
    mutationFn: () => apiPost<Lead>("/leads", { name: email.split("@")[0] || "Website", email, interest: "demo", message: "Requested a demo from the v2 landing page." }),
    onSuccess: () => { setEmail(""); toast.success("On the list — we'll reach out with a demo slot."); },
    onError: () => toast.error("Could not send that just now."),
  });

  return (
    <div className="min-h-screen bg-[#07090C] text-slate-100">
      {/* top ticker instead of a nav bar full of links */}
      <div className="overflow-hidden border-b border-slate-800/70 bg-[#0B0F14]">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-6 px-6 py-3 font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
          <span className="text-[#E2F952]">Gridline / takeoff engine</span>
          <span className="hidden md:inline">Opus vision · 200 DPI · 12 floor types · waste + adhesive logic</span>
          <Link to="/login" data-testid="v2-login-link" className="hover:text-[#E2F952]">Sign in →</Link>
        </div>
      </div>

      {/* hero: editorial, type-led, asymmetric */}
      <section className="mx-auto grid max-w-[1240px] gap-10 px-6 py-24 lg:grid-cols-[0.42fr_0.58fr]">
        <div className="border-l-2 border-[#E2F952] pl-6">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">Variation 02</p>
          <p className="mt-8 font-mono text-sm leading-relaxed text-slate-400">
            Commercial and multi-family flooring. One job, forty buildings, nine hundred rooms —
            read, measured and priced without a scale ruler.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <Link to="/login?mode=signup" data-testid="v2-cta-button"
                  className={cn(buttonVariants({ size: "lg" }), "w-fit font-semibold")}>
              Start the 14-day trial <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link to="/" data-testid="v2-back-link" className="w-fit font-mono text-xs uppercase tracking-widest text-slate-500 hover:text-[#E2F952]">
              ← see design v1
            </Link>
          </div>
        </div>
        <div>
          <h1 className="font-heading text-[13vw] font-bold leading-[0.86] tracking-tighter text-slate-50 lg:text-[7.4rem]">
            MEASURE<br />
            <span className="text-[#E2F952]">NOTHING.</span><br />
            BID<br />EVERYTHING.
          </h1>
          <div className="mt-10 grid grid-cols-3 border-t border-slate-800 pt-6 font-mono">
            {[["280+", "pages / set"], ["6 min", "set → quote"], ["12", "floor types"]].map(([v, l]) => (
              <div key={l}>
                <div className="text-3xl font-semibold text-[#E2F952]">{v}</div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* numbered rail */}
      <section className="border-y border-slate-800/70 bg-[#0B0F14]">
        <div className="mx-auto max-w-[1240px] px-6 py-20">
          {[
            ["01", "Drop the set", "Drag in the PDF. 100+ pages and separate spec sheets are normal, not an edge case."],
            ["02", "Opus reads it", "Printed scale first, written dimensions second, visual estimate never. Unreadable sheets get flagged."],
            ["03", "You price it", "Waste factor, adhesive and labour hours arrive filled in per floor type. Tap any cell to override."],
            ["04", "Client pays it", "Quote PDF by email, invoice with a Stripe card checkout, expenses tracked against the bid."],
          ].map(([n, t, d]) => (
            <div key={n} className="group grid gap-4 border-b border-slate-800/70 py-8 last:border-0 md:grid-cols-[90px_0.9fr_1.1fr]">
              <div className="font-mono text-4xl font-semibold text-slate-700 transition-colors duration-200 group-hover:text-[#E2F952]">{n}</div>
              <h3 className="font-heading text-2xl font-semibold text-slate-100">{t}</h3>
              <p className="text-[16px] leading-relaxed text-slate-400">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* pricing as a matrix */}
      <section className="mx-auto max-w-[1240px] px-6 py-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-[#E2F952]">Pricing matrix</p>
            <h2 className="mt-3 font-heading text-5xl font-bold tracking-tight text-slate-100">
              Two pages per dollar
            </h2>
            <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-slate-400">
              A page read by Claude Opus costs us {costs.data ? `$${costs.data.page_cost.toFixed(3)}` : "$0.115"}.
              Allowances are sized around that, so the price holds whether you bid one job or two hundred.
            </p>
          </div>
          <div className="inline-flex border border-slate-800 bg-[#0B0F14] p-1" data-testid="v2-pricing-toggle">
            {([["annual", "Annual −20%"], ["monthly", "Monthly"]] as const).map(([k, label]) => (
              <button key={k} type="button" data-testid={`v2-toggle-${k}`} onClick={() => setAnnual(k === "annual")}
                      className={cn("px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors duration-150",
                        (k === "annual") === annual ? "bg-[#E2F952] text-[#07090C]" : "text-slate-400 hover:text-slate-200")}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10 overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left" data-testid="v2-pricing-matrix">
            <thead>
              <tr>
                <th className="w-56 border-b border-slate-800 py-5 font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">Plan</th>
                {rows.map((p) => (
                  <th key={p.id} className={cn("border-b py-5 pl-5 align-top",
                    p.highlight ? "border-[#E2F952]" : "border-slate-800")}>
                    <div className="font-heading text-lg font-semibold text-slate-100">{p.name}</div>
                    <div className="mt-1 font-mono text-3xl font-semibold text-[#E2F952]" data-testid={`v2-price-${p.id}`}>
                      {p.kind === "contact" ? "Custom" : `$${p.kind === "subscription" ? (annual ? p.price : p.monthly_price) : p.price}`}
                    </div>
                    <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-slate-500">{p.cadence}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIX_ROWS.map((r) => (
                <tr key={r.label}>
                  <td className="border-b border-slate-800/60 py-4 text-[15px] text-slate-300">{r.label}</td>
                  {rows.map((p) => {
                    const val = cellFor(p, String(r.key));
                    return (
                      <td key={p.id} className="border-b border-slate-800/60 py-4 pl-5 font-mono text-[15px] text-slate-200"
                          data-testid={`v2-cell-${p.id}-${String(r.key)}`}>
                        {val === "yes" ? <Check className="h-4 w-4 text-[#E2F952]" />
                          : val === "no" ? <Minus className="h-4 w-4 text-slate-600" /> : val}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td className="py-6" />
                {rows.map((p) => (
                  <td key={p.id} className="py-6 pl-5">
                    {p.kind === "contact" ? (
                      <a href="#v2-demo" data-testid={`v2-cta-${p.id}`}
                         className={cn(buttonVariants({ variant: "outline", size: "sm" }), "font-semibold")}>Contact</a>
                    ) : (
                      <Link to="/login?mode=signup" data-testid={`v2-cta-${p.id}`}
                            className={cn(buttonVariants({ variant: p.highlight ? "default" : "outline", size: "sm" }), "font-semibold")}>
                        {p.kind === "one_time" ? "Buy one" : "Start trial"}
                      </Link>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* single-field demo capture */}
      <section id="v2-demo" className="border-t border-slate-800/70 bg-[#0B0F14]">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-6 py-20 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-heading text-4xl font-bold tracking-tight text-slate-100">Send us your worst set</h2>
            <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-slate-400">
              We will read it live on a 30-minute call and hand you the priced takeoff — including
              Enterprise pricing if you need pooled volume and SSO.
            </p>
          </div>
          <form className="flex w-full max-w-md gap-2" data-testid="v2-demo-form"
                onSubmit={(e) => { e.preventDefault(); join.mutate(); }}>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                   placeholder="you@flooringco.com" data-testid="v2-demo-email" className="h-12 text-base" />
            <Button type="submit" size="lg" className="shrink-0 font-semibold" data-testid="v2-demo-submit" disabled={join.isPending}>
              {join.isPending ? "Sending…" : "Book demo"}
            </Button>
          </form>
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-6 py-10 font-mono text-[11px] uppercase tracking-[0.2em] text-slate-600">
        <span>© {new Date().getFullYear()} Gridline</span>
        <span>Encrypted in transit · never used for model training</span>
        <Link to="/" className="hover:text-[#E2F952]">design v1 →</Link>
      </footer>
    </div>
  );
}
