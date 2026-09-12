import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, FileUp, ScanLine, Table2, Send, ShieldCheck, Layers } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Plan } from "@/lib/types";
import { buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/Shell";
import { cn } from "@/lib/utils";

const FALLBACK_PLANS: Plan[] = [
  { id: "single", name: "Single Job", price: 39, cadence: "per takeoff", blurb: "For the contractor bidding the occasional job.", features: ["One blueprint set", "Full flooring logic", "One invoice", "No subscription"], highlight: false },
  { id: "five", name: "Five Pack", price: 99, cadence: "one-time", blurb: "Five jobs, one price. Best for a busy bid season.", features: ["Up to 5 blueprint takeoffs", "Quotes + invoicing", "Change orders", "Expense log"], highlight: true },
  { id: "pro", name: "Unlimited Pro", price: 999, cadence: "per month", blurb: "Ongoing commercial and multi-family work. 14-day free trial.", features: ["Unlimited uploads", "Unlimited buildings & units", "Invoicing + change orders", "Expense tracking & profit summary", "14-day free trial"], highlight: false },
];

function useCountUp(target: number, run: boolean) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return;
    let frame = 0;
    const total = 48;
    const id = setInterval(() => {
      frame += 1;
      setV(Math.round(target * Math.min(1, frame / total)));
      if (frame >= total) clearInterval(id);
    }, 18);
    return () => clearInterval(id);
  }, [target, run]);
  return v;
}

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => e.isIntersecting && setShown(true), { threshold: 0.15 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ animationDelay: `${delay}ms` }} className={shown ? "gl-rise" : "opacity-0"}>
      {children}
    </div>
  );
}

function Stats() {
  const ref = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => e.isIntersecting && setRun(true), { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const pages = useCountUp(280, run);
  const mins = useCountUp(6, run);
  const types = useCountUp(12, run);
  const acc = useCountUp(98, run);
  const items = [
    { v: `${pages}+`, l: "Pages per set read" },
    { v: `${mins} min`, l: "Blueprint to quote" },
    { v: `${types}`, l: "Floor types covered" },
    { v: `${acc}%`, l: "Dimension match rate" },
  ];
  return (
    <div ref={ref} className="grid grid-cols-2 gap-px border border-slate-800/80 bg-slate-800/60 md:grid-cols-4" data-testid="landing-stats">
      {items.map((s) => (
        <div key={s.l} className="bg-[#0F1722] px-6 py-8">
          <div className="font-mono text-4xl font-semibold tracking-tight text-[#E2F952]">{s.v}</div>
          <div className="mt-2 text-sm text-slate-400">{s.l}</div>
        </div>
      ))}
    </div>
  );
}

const FEATURES = [
  { icon: ScanLine, t: "Reads the printed dimensions", d: "Opus-class vision records the drawing scale and every written dimension. Text beats eyeballing — always." },
  { icon: Layers, t: "Buildings, units, rooms", d: "One job can span every building and unit in the set. Bedrooms, bathrooms and backsplashes counted separately." },
  { icon: Table2, t: "Tap-to-edit takeoff", d: "Big rows, big numbers. Change a floor type and the waste %, adhesive and labor hours follow." },
  { icon: ShieldCheck, t: "Flags instead of guesses", d: "Blurry or cut-off callouts get flagged for your review rather than filled in with a made-up number." },
  { icon: Send, t: "Quote, email, invoice", d: "Discount and your regional tax line roll straight into a quote, then an invoice with a Pay Now button." },
  { icon: FileUp, t: "Change orders keep history", d: "A revision never erases the original. Every prior quote stays on the job record." },
];

const STEPS = [
  { n: "01", t: "Drop the PDF", d: "Drag the blueprint set in, or hit the button. 100+ page sets welcome." },
  { n: "02", t: "AI reads the sheets", d: "Scale, dimensions, floor types, waste factors, adhesives and labor — all calculated." },
  { n: "03", t: "You approve & edit", d: "Review the brief, adjust waste or sq ft on any line, approve the rest." },
  { n: "04", t: "Quote → invoice → paid", d: "Apply a discount, send it, and every paid invoice lands in your profit summary." },
];

export default function Landing() {
  const { data } = useQuery<Plan[]>({ queryKey: ["plans"], queryFn: () => apiGet<Plan[]>("/billing/plans"), retry: false });
  const plans = data ?? FALLBACK_PLANS;

  return (
    <div className="min-h-screen bg-[#090D12] text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#090D12]/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-4">
          <Logo />
          <div className="flex items-center gap-2">
            <Link to="/login" data-testid="nav-login-link" className={buttonVariants({ variant: "ghost", size: "sm" })}>Sign in</Link>
            <Link to="/login?mode=signup" data-testid="nav-start-link" className={cn(buttonVariants({ size: "sm" }), "font-semibold")}>Start free trial</Link>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden border-b border-slate-800/80">
        <div className="gl-grid absolute inset-0 opacity-40" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#E2F952]/50 to-transparent" />
        <div className="relative mx-auto grid max-w-[1200px] items-center gap-14 px-5 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
          <div className="gl-rise">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E2F952]/30 bg-[#1C2712] px-3 py-1 font-mono text-xs text-[#E2F952]">
              AI TAKEOFF ENGINE · v2
            </span>
            <h1 className="mt-6 font-heading text-5xl font-bold leading-[1.05] tracking-tight text-slate-50 lg:text-6xl">
              Blueprint in.<br />
              <span className="text-[#E2F952]">Priced takeoff</span> out.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
              Gridline is the estimating desk for commercial and multi-family flooring subcontractors.
              Upload the set, get every room measured, priced with the right waste factor and adhesive,
              and turn it into a quote your client can pay.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link to="/login?mode=signup" data-testid="hero-cta-button" className={cn(buttonVariants({ size: "lg" }), "gl-glow font-semibold")}>
                Start 14-day free trial <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#pricing" data-testid="hero-pricing-link" className={buttonVariants({ variant: "outline", size: "lg" })}>See pricing</a>
            </div>
            <p className="mt-4 font-mono text-xs text-slate-500">No card for the trial · Cancel any time</p>
          </div>

          <div className="relative gl-rise" style={{ animationDelay: "140ms" }}>
            <div className="relative overflow-hidden border border-slate-800 bg-[#0F1722] shadow-2xl shadow-black/60">
              <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                <span className="font-mono text-xs uppercase tracking-[0.2em] text-[#E2F952]">LIVE READOUT</span>
                <span className="font-mono text-xs text-slate-500">oakridge-phase2.pdf</span>
              </div>
              <div className="relative">
                <div className="gl-scan pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-transparent via-[#E2F952]/10 to-transparent" />
                <table className="w-full text-left text-sm">
                  <thead className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
                    <tr className="border-b border-slate-800">
                      <th className="px-4 py-2">Unit / Room</th><th className="px-4 py-2">Floor</th>
                      <th className="px-4 py-2 text-right">SF</th><th className="px-4 py-2 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-slate-300">
                    {[
                      ["101 · Living", "LVP", "318", "$1,485"],
                      ["101 · Bed 1", "Carpet Tile", "142", "$549"],
                      ["101 · Bath", "Porcelain", "48", "$309"],
                      ["101 · Backsplash", "Ceramic", "22", "$148"],
                      ["B · Corridor", "Broadloom", "640", "$2,373"],
                    ].map((r) => (
                      <tr key={r[0]} className="border-b border-slate-800/60">
                        <td className="px-4 py-2.5 text-slate-200">{r[0]}</td>
                        <td className="px-4 py-2.5 text-slate-400">{r[1]}</td>
                        <td className="px-4 py-2.5 text-right">{r[2]}</td>
                        <td className="px-4 py-2.5 text-right text-[#E2F952]">{r[3]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-slate-800 bg-[#131D2A] px-4 py-3">
                <span className="font-mono text-xs uppercase tracking-[0.2em] text-slate-500">Grand total</span>
                <span className="font-mono text-xl font-semibold text-white">$48,206.40</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-5 py-16"><Reveal><Stats /></Reveal></section>

      {/* features */}
      <section className="border-y border-slate-800/80 bg-[#0B121A]">
        <div className="mx-auto max-w-[1200px] px-5 py-20">
          <Reveal>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#E2F952]">What it does</p>
            <h2 className="mt-3 max-w-2xl font-heading text-4xl font-bold tracking-tight text-slate-100">
              Everything between the blueprint and the bank deposit
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-px bg-slate-800/60 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.t} delay={i * 60}>
                <div className="h-full bg-[#0F1722] p-7 transition-colors hover:bg-[#131D2A]">
                  <f.icon className="h-6 w-6 text-[#E2F952]" />
                  <h3 className="mt-4 font-heading text-lg font-semibold text-slate-100">{f.t}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-slate-400">{f.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* how it works */}
      <section className="mx-auto max-w-[1200px] px-5 py-20">
        <Reveal>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#E2F952]">How it works</p>
          <h2 className="mt-3 font-heading text-4xl font-bold tracking-tight text-slate-100">Four steps. No spreadsheets.</h2>
        </Reveal>
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 80}>
              <div className="h-full border border-slate-800/80 bg-[#0F1722] p-6 transition-colors hover:border-[#E2F952]/40">
                <div className="font-mono text-3xl font-semibold text-[#E2F952]/80">{s.n}</div>
                <h3 className="mt-4 font-heading text-lg font-semibold text-slate-100">{s.t}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-slate-400">{s.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* pricing */}
      <section id="pricing" className="border-y border-slate-800/80 bg-[#0B121A]">
        <div className="mx-auto max-w-[1200px] px-5 py-20">
          <Reveal>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#E2F952]">Pricing</p>
            <h2 className="mt-3 font-heading text-4xl font-bold tracking-tight text-slate-100">Pay per job, or go unlimited</h2>
          </Reveal>
          <div className="mt-12 grid gap-6 lg:grid-cols-3" data-testid="landing-pricing">
            {plans.map((p, i) => (
              <Reveal key={p.id} delay={i * 80}>
                <div className={cn(
                  "flex h-full flex-col border bg-[#0F1722] p-7",
                  p.highlight ? "border-[#E2F952]/60 shadow-[0_0_40px_-12px_rgba(226,249,82,0.35)]" : "border-slate-800/80",
                )}>
                  {p.highlight && <span className="mb-4 self-start rounded-full border border-[#E2F952]/30 bg-[#1C2712] px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-[#E2F952]">Most popular</span>}
                  <h3 className="font-heading text-xl font-semibold text-slate-100">{p.name}</h3>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="font-mono text-5xl font-semibold text-white" data-testid={`plan-${p.id}-price`}>${p.price}</span>
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
                  <Link
                    to="/login?mode=signup"
                    data-testid={`plan-${p.id}-cta`}
                    className={cn(buttonVariants({ variant: p.highlight ? "default" : "outline", size: "lg" }), "mt-8 w-full font-semibold")}
                  >
                    {p.id === "pro" ? "Start free trial" : "Get started"}
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800/80 bg-[#090D12]">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-5 py-12 md:flex-row md:items-center md:justify-between">
          <div>
            <Logo />
            <p className="mt-3 max-w-sm text-sm text-slate-500">
              AI blueprint takeoffs, quoting and invoicing for commercial and multi-family flooring subcontractors.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-2 font-mono text-xs uppercase tracking-widest text-slate-500">
            <a href="#pricing" className="hover:text-[#E2F952]">Pricing</a>
            <Link to="/login" className="hover:text-[#E2F952]">Sign in</Link>
            <Link to="/login?mode=signup" className="hover:text-[#E2F952]">Free trial</Link>
          </div>
        </div>
        <div className="border-t border-slate-800/60 px-5 py-5 text-center font-mono text-xs text-slate-600">
          © {new Date().getFullYear()} Gridline · Built for the trade
        </div>
      </footer>
    </div>
  );
}
