import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight, Check, FileUp, ScanLine, Table2, Send, ShieldCheck, Layers,
  Lock, ServerCog, EyeOff, Quote as QuoteIcon,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import type { CostModel, Lead, PlanTier } from "@/lib/types";
import { money } from "@/lib/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Logo } from "@/components/Shell";
import ScanSequence from "@/components/ScanSequence";
import { cn } from "@/lib/utils";

const FALLBACK_PLANS: PlanTier[] = [];

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

function useInView<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, seen };
}

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const { ref, seen } = useInView<HTMLDivElement>(0.15);
  return (
    <div ref={ref} style={{ animationDelay: `${delay}ms` }} className={seen ? "gl-rise" : "opacity-0"}>
      {children}
    </div>
  );
}

function Stats() {
  const { ref, seen } = useInView<HTMLDivElement>(0.3);
  const pages = useCountUp(280, seen);
  const mins = useCountUp(6, seen);
  const types = useCountUp(12, seen);
  const acc = useCountUp(98, seen);
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
  { icon: Layers, t: "Buildings, units, rooms", d: "One job spans every building and unit in the set. Unit templates repeat a layout across 40 doors in one click." },
  { icon: Table2, t: "Tap-to-edit takeoff", d: "Big rows, big numbers. Change a floor type and the waste %, adhesive and labor hours follow." },
  { icon: ShieldCheck, t: "Flags instead of guesses", d: "Blurry or cut-off callouts get flagged for your review rather than filled in with a made-up number." },
  { icon: Send, t: "Quote, email, invoice", d: "Supply & install, install only, supply only or misc — plus discount, tax and a Pay Now button." },
  { icon: FileUp, t: "Change orders keep history", d: "Revisions sit side by side with the original. Nothing is ever overwritten." },
];

const STEPS = [
  { n: "01", t: "Drop the PDF", d: "Drag the blueprint set in, or hit the button. 100+ page sets welcome, spec sheets too." },
  { n: "02", t: "AI reads the sheets", d: "Scale, dimensions, floor types, waste factors, adhesives and labor — all calculated." },
  { n: "03", t: "You approve & edit", d: "Review the brief, adjust waste or sq ft on any line, approve the rest." },
  { n: "04", t: "Quote → invoice → paid", d: "Send the PDF, collect by card, and watch bid vs actual on every job." },
];

const TESTIMONIALS = [
  { q: "A 62-unit garden-style set used to cost me two evenings with a scale ruler. Gridline had the room list priced before my coffee went cold.", n: "Dave Korhonen", r: "Owner, Kor Floor Systems · Columbus OH" },
  { q: "The change-order revisions are the part my GC actually notices. Every version of the quote is still there when they ask what changed.", n: "Marisol Reyes", r: "Senior Estimator, Vantage Surfaces · Phoenix AZ" },
  { q: "It flags the sheets that are unreadable instead of inventing a number. That's the reason I trust the total.", n: "Trevor Blake", r: "Multi-family Division, Blake & Sons · Calgary AB" },
];

const FAQ = [
  { q: "How big a set can it handle?", a: "Sets past 100 pages are normal. Every page is rendered at high resolution and read individually, then the room totals are cross-checked against the building total printed on the sheet if one exists." },
  { q: "What if the blueprint is unreadable?", a: "Gridline flags the room for manual review and leaves the number to you. It never fabricates a dimension to fill a gap." },
  { q: "Which floor types are covered?", a: "Twelve: LVP, LVT, VCT, carpet tile, broadloom, sheet vinyl, ceramic, porcelain, natural stone, hardwood, rubber/sport and epoxy — each with its own waste factor and adhesive logic." },
  { q: "Can I price install-only work?", a: "Yes. Every line can be supply & install, install only, supply only or a flat miscellaneous charge such as floor prep or haul-away." },
  { q: "Do you handle Canadian tax?", a: "Settings auto-detect GST, HST, PST, QST, VAT or state sales tax from your country and province/state, and every field stays editable per invoice." },
  { q: "Is my client data used to train models?", a: "No. Blueprints are processed for your takeoff only and are never used for model training." },
];

const TRUST = [
  { icon: Lock, t: "Encrypted in transit", d: "Every upload and API call runs over TLS." },
  { icon: EyeOff, t: "Never used for training", d: "Your drawings stay yours. No model training, no resale." },
  { icon: ServerCog, t: "Per-account isolation", d: "Jobs, quotes and files are scoped to your team with role-based access." },
];

function RoiCalculator() {
  const [bids, setBids] = useState(8);
  const [hours, setHours] = useState(5);
  const [rate, setRate] = useState(65);
  const hoursSaved = Math.round(bids * hours * 0.8);
  const monthlySaving = hoursSaved * rate;
  const net = monthlySaving - 199;

  return (
    <div className="grid gap-px border border-slate-800/80 bg-slate-800/60 lg:grid-cols-[1fr_0.9fr]" data-testid="roi-calculator">
      <div className="bg-[#0F1722] p-7">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#E2F952]">ROI calculator</p>
        <h3 className="mt-3 font-heading text-2xl font-bold text-slate-100">What is manual takeoff costing you?</h3>
        <div className="mt-6 space-y-5">
          {([
            ["Bids per month", bids, setBids, 1, 60, "roi-bids"],
            ["Hours per takeoff today", hours, setHours, 1, 24, "roi-hours"],
            ["Your hourly value ($)", rate, setRate, 20, 200, "roi-rate"],
          ] as const).map(([label, value, set, min, max, id]) => (
            <div key={id}>
              <div className="flex items-center justify-between">
                <Label className="text-slate-300">{label}</Label>
                <span className="font-mono text-lg font-semibold text-white" data-testid={`${id}-value`}>{value}</span>
              </div>
              <input
                type="range" min={min} max={max} value={value} data-testid={id}
                onChange={(e) => set(Number(e.target.value))}
                className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-800 accent-[#E2F952]"
              />
            </div>
          ))}
        </div>
      </div>
      <div className="bg-[#131D2A] p-7">
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">Hours back each month</div>
        <div className="mt-1 font-mono text-5xl font-semibold text-[#E2F952]" data-testid="roi-hours-saved">{hoursSaved}</div>
        <div className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">That time is worth</div>
        <div className="mt-1 font-mono text-3xl font-semibold text-white" data-testid="roi-value-saved">{money(monthlySaving)}</div>
        <div className="mt-6 border-t border-slate-800 pt-5">
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">Net of Crew at $199/mo</div>
          <div className={cn("mt-1 font-mono text-3xl font-semibold", net >= 0 ? "text-[#E2F952]" : "text-red-400")} data-testid="roi-net">
            {money(net)}
          </div>
        </div>
        <p className="mt-5 text-sm leading-relaxed text-slate-400">
          Assumes Gridline removes about 80% of the hand-measuring time on a typical set.
        </p>
      </div>
    </div>
  );
}

function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", company: "", phone: "", crew_size: "", message: "", interest: "demo" });
  const [done, setDone] = useState(false);
  const send = useMutation({
    mutationFn: () => apiPost<Lead>("/leads", form),
    onSuccess: () => { setDone(true); toast.success("Got it — we'll be in touch within one business day."); },
    onError: () => toast.error("Could not send that just now. Try again."),
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  if (done) {
    return (
      <div className="border border-[#E2F952]/40 bg-[#0F1722] p-8 text-center" data-testid="contact-success">
        <Check className="mx-auto h-8 w-8 text-[#E2F952]" />
        <h3 className="mt-4 font-heading text-xl font-semibold text-slate-100">Request received</h3>
        <p className="mt-2 text-slate-400">We'll email {form.email} with a demo time and Enterprise pricing.</p>
      </div>
    );
  }

  return (
    <form
      className="grid gap-4 border border-slate-800/80 bg-[#0F1722] p-7 sm:grid-cols-2"
      data-testid="contact-form"
      onSubmit={(e) => { e.preventDefault(); send.mutate(); }}
    >
      <div className="space-y-2">
        <Label htmlFor="lead-name" className="text-slate-300">Name</Label>
        <Input id="lead-name" required value={form.name} onChange={set("name")} data-testid="contact-name-input" className="h-12 text-base" placeholder="Dana Whitfield" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="lead-email" className="text-slate-300">Work email</Label>
        <Input id="lead-email" type="email" required value={form.email} onChange={set("email")} data-testid="contact-email-input" className="h-12 text-base" placeholder="dana@flooringco.com" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="lead-company" className="text-slate-300">Company</Label>
        <Input id="lead-company" value={form.company} onChange={set("company")} data-testid="contact-company-input" className="h-12 text-base" placeholder="Whitfield Flooring" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="lead-crew" className="text-slate-300">Estimators on staff</Label>
        <Input id="lead-crew" value={form.crew_size} onChange={set("crew_size")} data-testid="contact-crew-input" className="h-12 text-base" placeholder="3" />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="lead-message" className="text-slate-300">What are you bidding?</Label>
        <Textarea id="lead-message" rows={4} value={form.message} onChange={set("message")} data-testid="contact-message-input" className="text-base" placeholder="Mostly 200-unit multi-family, some corporate tenant improvement." />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" size="lg" className="w-full font-semibold" data-testid="contact-submit-button" disabled={send.isPending}>
          {send.isPending ? "Sending…" : "Request a demo"} <ArrowRight className="h-4 w-4" />
        </Button>
        <p className="mt-3 font-mono text-xs text-slate-500">Used for this request only. No newsletter, no resale.</p>
      </div>
    </form>
  );
}

export default function Landing() {
  const { data } = useQuery<PlanTier[]>({ queryKey: ["plans"], queryFn: () => apiGet<PlanTier[]>("/billing/plans"), retry: false });
  const costs = useQuery<CostModel>({ queryKey: ["cost-model"], queryFn: () => apiGet<CostModel>("/billing/cost-model"), retry: false });
  const plans = data ?? FALLBACK_PLANS;
  const cost = costs.data;
  const [annual, setAnnual] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const demo = useInView<HTMLDivElement>(0.3);

  return (
    <div className="min-h-screen bg-[#090D12] text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#090D12]/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-4">
          <Logo />
          <div className="flex items-center gap-2">
            <a href="#pricing" data-testid="nav-pricing-link" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}>Pricing</a>
            <a href="#demo" data-testid="nav-demo-link" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}>Book a demo</a>
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
              <a href="#demo" data-testid="hero-demo-link" className={buttonVariants({ variant: "outline", size: "lg" })}>Book a demo</a>
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

      {/* total-recall scan demo */}
      <section className="border-y border-slate-800/80 bg-[#0B121A]">
        <div className="mx-auto max-w-[1200px] px-5 py-20" ref={demo.ref}>
          <Reveal>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#E2F952]">Watch it measure</p>
            <h2 className="mt-3 max-w-2xl font-heading text-4xl font-bold tracking-tight text-slate-100">
              The reader, running live
            </h2>
            <p className="mt-4 max-w-2xl text-lg text-slate-400">
              This is the same readout you see on upload: the scale locks, each room outlines, the printed
              dimension string snaps in, and the square-foot counter climbs as the set is read.
            </p>
          </Reveal>
          <div className="mt-10" data-testid="landing-scan-demo">
            <ScanSequence running={demo.seen} loop filename="oakridge-commons-phase2.pdf" />
          </div>
        </div>
      </section>

      {/* features */}
      <section className="mx-auto max-w-[1200px] px-5 py-20">
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
      </section>

      {/* how it works */}
      <section className="border-y border-slate-800/80 bg-[#0B121A]">
        <div className="mx-auto max-w-[1200px] px-5 py-20">
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
        </div>
      </section>

      {/* ROI */}
      <section className="mx-auto max-w-[1200px] px-5 py-20"><Reveal><RoiCalculator /></Reveal></section>

      {/* testimonials */}
      <section className="border-y border-slate-800/80 bg-[#0B121A]">
        <div className="mx-auto max-w-[1200px] px-5 py-20">
          <Reveal>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#E2F952]">From the trade</p>
            <h2 className="mt-3 font-heading text-4xl font-bold tracking-tight text-slate-100">Estimators who stopped measuring by hand</h2>
          </Reveal>
          <div className="mt-12 grid gap-6 lg:grid-cols-3" data-testid="landing-testimonials">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={t.n} delay={i * 80}>
                <figure className="flex h-full flex-col border border-slate-800/80 bg-[#0F1722] p-7">
                  <QuoteIcon className="h-6 w-6 text-[#E2F952]" />
                  <blockquote className="mt-4 flex-1 text-[17px] leading-relaxed text-slate-200">"{t.q}"</blockquote>
                  <figcaption className="mt-6 border-t border-slate-800 pt-4">
                    <div className="font-heading font-semibold text-slate-100">{t.n}</div>
                    <div className="font-mono text-xs text-slate-500">{t.r}</div>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* pricing */}
      <section id="pricing" className="mx-auto max-w-[1200px] px-5 py-20">
        <Reveal>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#E2F952]">Pricing</p>
          <h2 className="mt-3 font-heading text-4xl font-bold tracking-tight text-slate-100">Pay per job, or go unlimited</h2>
          <div className="mt-8 inline-flex items-center gap-1 border border-slate-800 bg-[#0F1722] p-1" data-testid="pricing-toggle">
            {([["annual", "Annual · save 20%"], ["monthly", "Monthly"]] as const).map(([k, label]) => {
              const on = (k === "annual") === annual;
              return (
                <button
                  key={k} type="button" data-testid={`pricing-toggle-${k}`}
                  onClick={() => setAnnual(k === "annual")}
                  className={cn(
                    "px-5 py-2.5 font-mono text-xs uppercase tracking-widest transition-colors duration-150",
                    on ? "bg-[#E2F952] text-[#090D11]" : "text-slate-400 hover:text-slate-200",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </Reveal>

        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3" data-testid="landing-pricing">
          {plans.map((p, i) => {
            const sub = p.kind === "subscription";
            const shown = sub ? (annual ? p.price : p.monthly_price) : p.price;
            return (
              <Reveal key={p.id} delay={i * 70}>
                <div className={cn(
                  "flex h-full flex-col border bg-[#0F1722] p-7",
                  p.highlight ? "border-[#E2F952]/60 shadow-[0_0_40px_-12px_rgba(226,249,82,0.35)]" : "border-slate-800/80",
                )}>
                  {p.badge && (
                    <span className={cn(
                      "mb-4 self-start rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-widest",
                      p.highlight ? "border-[#E2F952]/30 bg-[#1C2712] text-[#E2F952]" : "border-slate-700 bg-[#131D2A] text-slate-400",
                    )}>{p.badge}</span>
                  )}
                  <h3 className="font-heading text-xl font-semibold text-slate-100">{p.name}</h3>
                  <div className="mt-4 flex items-baseline gap-2">
                    {p.kind === "contact" ? (
                      <span className="font-heading text-3xl font-semibold text-white" data-testid={`plan-${p.id}-price`}>Custom</span>
                    ) : (
                      <>
                        <span className="font-mono text-5xl font-semibold text-white" data-testid={`plan-${p.id}-price`}>${shown}</span>
                        <span className="text-sm text-slate-500">{p.cadence}</span>
                      </>
                    )}
                  </div>
                  {sub && (
                    <p className="mt-2 font-mono text-xs text-slate-500" data-testid={`plan-${p.id}-cadence-note`}>
                      {annual ? `billed annually · $${p.monthly_price}/mo month-to-month` : "month-to-month · switch to annual for 20% off"}
                    </p>
                  )}
                  <p className="mt-3 text-[15px] text-slate-400">{p.blurb}</p>
                  <p className="mt-2 font-mono text-xs uppercase tracking-widest text-[#E2F952]">{p.seats}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 border-y border-slate-800 py-4 font-mono text-sm">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Blueprint pages</div>
                      <div className="mt-0.5 text-base font-semibold text-white" data-testid={`plan-${p.id}-pages`}>
                        {p.pages_included < 0 ? "Pooled volume" : `${p.pages_included}${p.kind === "one_time" ? " total" : " / mo"}`}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Max PDF size</div>
                      <div className="mt-0.5 text-base font-semibold text-white">{p.max_file_mb} MB</div>
                    </div>
                  </div>
                  <ul className="mt-6 flex-1 space-y-3">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2.5 text-[15px] text-slate-300">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#E2F952]" />{f}
                      </li>
                    ))}
                  </ul>
                  {p.kind === "contact" ? (
                    <a
                      href="#demo" data-testid={`plan-${p.id}-cta`}
                      className={cn(buttonVariants({ variant: "outline", size: "lg" }), "mt-8 w-full font-semibold")}
                    >
                      Contact sales
                    </a>
                  ) : (
                    <Link
                      to="/login?mode=signup" data-testid={`plan-${p.id}-cta`}
                      className={cn(buttonVariants({ variant: p.highlight ? "default" : "outline", size: "lg" }), "mt-8 w-full font-semibold")}
                    >
                      {p.kind === "trial" ? "Start free" : sub ? "Start free trial" : "Buy one takeoff"}
                    </Link>
                  )}
                </div>
              </Reveal>
            );
          })}
        </div>

        {/* the pricing math, published */}
        <div className="mt-14 grid gap-px border border-slate-800/80 bg-slate-800/60 lg:grid-cols-[0.95fr_1.05fr]" data-testid="pricing-math">
          <div className="bg-[#0F1722] p-7">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#E2F952]">Why it costs what it costs</p>
            <h3 className="mt-3 font-heading text-2xl font-bold text-slate-100">
              {cost ? `$${cost.page_cost.toFixed(3)}` : "$0.115"} of AI per blueprint page
            </h3>
            <div className="mt-5 space-y-3">
              {(cost?.breakdown ?? []).map((b) => (
                <div key={b.item} className="flex items-start justify-between gap-4 border-b border-slate-800/60 pb-3">
                  <div>
                    <div className="text-[15px] text-slate-200">{b.item}</div>
                    <div className="font-mono text-xs text-slate-500">{b.detail}</div>
                  </div>
                  <span className="shrink-0 font-mono text-base font-semibold text-white">${b.cost.toFixed(3)}</span>
                </div>
              ))}
            </div>
            <p className="mt-5 text-[15px] leading-relaxed text-slate-400">
              Claude Opus reads every page at 200 DPI — accuracy over speed. Each tier gives you roughly
              two pages per dollar, and past your allowance it is {cost ? `$${cost.overage_per_page.toFixed(2)}` : "$0.50"} a
              page instead of a hard stop. Quotes, invoicing and payments start at Crew; the $49 one-off is
              takeoff and PDF only.
            </p>
          </div>
          <div className="bg-[#131D2A] p-7">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-slate-500">What the trade pays elsewhere</p>
            <div className="mt-5 space-y-4" data-testid="pricing-competitors">
              {(cost?.competitors ?? []).map((c) => (
                <div key={c.name} className="border-b border-slate-800/60 pb-4 last:border-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-heading text-lg font-semibold text-slate-100">{c.name}</span>
                    <span className="font-mono text-sm text-[#E2F952]">{c.price}</span>
                  </div>
                  <p className="mt-1 text-[15px] leading-relaxed text-slate-400">{c.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* trust / security */}
      <section className="border-y border-slate-800/80 bg-[#0B121A]">
        <div className="mx-auto max-w-[1200px] px-5 py-16">
          <Reveal>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#E2F952]">Your drawings, handled properly</p>
            <div className="mt-8 grid gap-6 md:grid-cols-3" data-testid="landing-security">
              {TRUST.map((t) => (
                <div key={t.t} className="border border-slate-800/80 bg-[#0F1722] p-6">
                  <t.icon className="h-6 w-6 text-[#E2F952]" />
                  <h3 className="mt-4 font-heading text-lg font-semibold text-slate-100">{t.t}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-slate-400">{t.d}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-[900px] px-5 py-20">
        <Reveal>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#E2F952]">FAQ</p>
          <h2 className="mt-3 font-heading text-4xl font-bold tracking-tight text-slate-100">Questions estimators ask first</h2>
        </Reveal>
        <div className="mt-10 divide-y divide-slate-800 border border-slate-800/80 bg-[#0F1722]" data-testid="landing-faq">
          {FAQ.map((f, i) => (
            <div key={f.q}>
              <button
                type="button" data-testid={`faq-toggle-${i}`}
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors duration-150 hover:bg-[#131D2A]"
              >
                <span className="font-heading text-lg font-semibold text-slate-100">{f.q}</span>
                <span className="font-mono text-xl text-[#E2F952]">{openFaq === i ? "−" : "+"}</span>
              </button>
              {openFaq === i && (
                <p className="px-6 pb-6 text-[15px] leading-relaxed text-slate-400" data-testid={`faq-answer-${i}`}>{f.a}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* demo / contact */}
      <section id="demo" className="border-t border-slate-800/80 bg-[#0B121A]">
        <div className="mx-auto grid max-w-[1200px] gap-12 px-5 py-20 lg:grid-cols-[0.9fr_1.1fr]">
          <Reveal>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#E2F952]">Book a demo</p>
            <h2 className="mt-3 font-heading text-4xl font-bold tracking-tight text-slate-100">
              Bring your worst blueprint set
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-slate-400">
              Send us a real set and we'll read it live on the call — scale, room dimensions, floor types,
              waste, adhesive and labor — then hand you the priced takeoff. Enterprise pricing, seat counts
              and custom cost books are covered on the same call.
            </p>
            <ul className="mt-8 space-y-3">
              {["30 minutes, screen-shared", "Your drawings, not a canned deck", "Enterprise & multi-seat quotes"].map((x) => (
                <li key={x} className="flex gap-2.5 text-[15px] text-slate-300">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#E2F952]" />{x}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={80}><ContactForm /></Reveal>
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
            <a href="#demo" className="hover:text-[#E2F952]">Book a demo</a>
            <Link to="/login" className="hover:text-[#E2F952]">Sign in</Link>
            <Link to="/login?mode=signup" className="hover:text-[#E2F952]">Free trial</Link>
            <Link to="/v2" data-testid="footer-v2-link" className="hover:text-[#E2F952]">Design v2</Link>
          </div>
        </div>
        <div className="border-t border-slate-800/60 px-5 py-5 text-center font-mono text-xs text-slate-600">
          © {new Date().getFullYear()} Gridline · Built for the trade
        </div>
      </footer>
    </div>
  );
}
