import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useInView, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { cn } from "@/lib/utils";

// Scroll choreography for the landing page. Everything here animates named properties
// (transform / opacity / filter) only — never `transition: all` — and collapses to a plain
// render when the visitor has asked for reduced motion.

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const width = useSpring(scrollYProgress, { stiffness: 140, damping: 28, restDelta: 0.001 });
  return (
    <motion.div
      data-testid="scroll-progress-bar"
      style={{ scaleX: width }}
      className="fixed inset-x-0 top-0 z-50 h-[3px] origin-left bg-brand/80 shadow-[0_0_14px_rgba(var(--t-glow),0.6)]"
    />
  );
}

export function Reveal({
  children, delay = 0, y = 34, blur = true, className, testId,
}: {
  children: ReactNode; delay?: number; y?: number; blur?: boolean; className?: string; testId?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      data-testid={testId}
      className={className}
      initial={{ opacity: 0, y, filter: blur ? "blur(8px)" : "none" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.7, delay: delay / 1000, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

// Staggered children: each direct child rises a beat after the one above it.
export function RevealGroup({ children, className, step = 90 }: { children: ReactNode[]; className?: string; step?: number }) {
  return (
    <div className={className}>
      {children.map((child, i) => (
        <Reveal key={i} delay={i * step}>{child}</Reveal>
      ))}
    </div>
  );
}

export function Parallax({
  children, distance = 80, className,
}: { children: ReactNode; distance?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [distance, -distance]);
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <div ref={ref} className={className}>
      <motion.div style={{ y }}>{children}</motion.div>
    </div>
  );
}

// Fades and lifts a whole section as it leaves the viewport, so the page feels layered.
export function DepthSection({ children, className, testId }: { children: ReactNode; className?: string; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "start 0.25"] });
  const scale = useTransform(scrollYProgress, [0, 1], [0.97, 1]);
  const opacity = useTransform(scrollYProgress, [0, 1], [0.45, 1]);
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div ref={ref} data-testid={testId} style={{ scale, opacity }} className={className}>
      {children}
    </motion.div>
  );
}

// Counter that starts the first time it scrolls into view.
export function CountUp({ to, suffix = "", prefix = "", decimals = 0, className, testId }: {
  to: number; suffix?: string; prefix?: string; decimals?: number; className?: string; testId?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.4 });
  const reduced = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!seen) return;
    if (reduced) { setValue(to); return; }
    const duration = 1200;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      // ease-out-expo: fast off the mark, settles on the number
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setValue(to * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, to, reduced]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)} data-testid={testId}>
      {prefix}{value.toFixed(decimals)}{suffix}
    </span>
  );
}
