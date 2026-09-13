import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The party trick: a live "measuring" readout that plays while Claude reads the set.
 * A hand-built SVG floor plate gets scanned, rooms light up one at a time, printed
 * dimension strings snap in, and a running square-foot counter climbs. No dependency,
 * no video — it is just timed state over an SVG, so it runs at any size.
 */

type Room = {
  id: string;
  x: number; y: number; w: number; h: number;
  label: string;
  dim: string;
  sqft: number;
  floor: string;
};

// A plausible 2-unit floor plate on a 0..300 x 0..190 canvas.
const ROOMS: Room[] = [
  { id: "r1", x: 8, y: 8, w: 104, h: 78, label: "Living / Dining", dim: "18'-0\" x 14'-0\"", sqft: 252, floor: "LVP" },
  { id: "r2", x: 116, y: 8, w: 74, h: 46, label: "Bedroom 1", dim: "12'-0\" x 11'-6\"", sqft: 138, floor: "Carpet Tile" },
  { id: "r3", x: 116, y: 58, w: 44, h: 28, label: "Bath 1", dim: "8'-0\" x 6'-0\"", sqft: 48, floor: "Porcelain" },
  { id: "r4", x: 164, y: 58, w: 26, h: 28, label: "Backsplash", dim: "12 LF x 18\"", sqft: 18, floor: "Ceramic" },
  { id: "r5", x: 194, y: 8, w: 98, h: 78, label: "Unit 102 Living", dim: "17'-0\" x 13'-6\"", sqft: 230, floor: "LVP" },
  { id: "r6", x: 8, y: 92, w: 88, h: 52, label: "Bedroom 2", dim: "12'-6\" x 11'-0\"", sqft: 138, floor: "Carpet Tile" },
  { id: "r7", x: 100, y: 92, w: 60, h: 52, label: "Kitchen", dim: "11'-0\" x 10'-0\"", sqft: 110, floor: "LVP" },
  { id: "r8", x: 164, y: 92, w: 128, h: 24, label: "Corridor", dim: "40'-0\" x 5'-0\"", sqft: 200, floor: "Broadloom" },
  { id: "r9", x: 164, y: 120, w: 60, h: 24, label: "Bath 2", dim: "7'-6\" x 6'-0\"", sqft: 45, floor: "Porcelain" },
  { id: "r10", x: 228, y: 120, w: 64, h: 24, label: "Utility", dim: "9'-0\" x 6'-0\"", sqft: 54, floor: "Sheet Vinyl" },
];

const STAGES = [
  "Rendering sheets at 200 DPI",
  "Locating printed scale",
  "Reading written dimensions",
  "Outlining rooms & areas",
  "Matching specified products",
  "Applying waste & adhesive",
  "Pricing labor",
];

export default function ScanSequence({
  running,
  loop = false,
  filename = "blueprint.pdf",
  compact = false,
  onCycle,
}: {
  running: boolean;
  loop?: boolean;
  filename?: string;
  compact?: boolean;
  onCycle?: () => void;
}) {
  const [tick, setTick] = useState(0);
  const timer = useRef<number | null>(null);

  // One ticker drives everything; 120ms keeps the motion legible rather than frantic.
  useEffect(() => {
    if (!running) return;
    timer.current = window.setInterval(() => {
      setTick((t) => {
        const next = t + 1;
        const end = 26 + ROOMS.length * 6;
        if (next > end) {
          if (!loop) return t; // hold the finished state
          onCycle?.();
          return 0;
        }
        return next;
      });
    }, 120);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [running, loop, onCycle]);

  useEffect(() => {
    if (!running) setTick(0);
  }, [running]);

  const scaleLocked = tick > 8;
  const measuredCount = Math.max(0, Math.min(ROOMS.length, Math.floor((tick - 12) / 6) + 1));
  const measured = useMemo(() => ROOMS.slice(0, measuredCount), [measuredCount]);
  const runningSqft = measured.reduce((a, r) => a + r.sqft, 0);
  const activeRoom = measured[measured.length - 1];
  const stageIndex = Math.min(STAGES.length - 1, Math.floor(tick / 11));
  const pct = Math.min(100, Math.round((tick / (26 + ROOMS.length * 6)) * 100));
  const scanY = 8 + ((tick * 5) % 150);

  return (
    <div
      data-testid="scan-sequence"
      className="overflow-hidden border border-hairline bg-canvas-2"
    >
      {/* readout header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-surface px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", running ? "bg-brand animate-pulse" : "bg-ink-4")} />
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand">
            {running ? "Reading blueprint" : "Reader idle"}
          </span>
        </div>
        <span className="max-w-[40%] truncate font-mono text-[11px] text-ink-3">{filename}</span>
      </div>

      <div className={cn("grid gap-0", compact ? "" : "lg:grid-cols-[1.35fr_1fr]")}>
        {/* ---- the plan being measured ---- */}
        <div className="relative border-b border-hairline lg:border-b-0 lg:border-r">
          <div className="gl-grid absolute inset-0 opacity-30" />
          <svg viewBox="0 0 300 190" className="relative block w-full" role="img" aria-label="Blueprint being measured">
            {/* wall outlines always visible, faint */}
            {ROOMS.map((r) => (
              <rect key={`base-${r.id}`} x={r.x} y={r.y} width={r.w} height={r.h}
                    fill="none" stroke="#1E293B" strokeWidth="1" />
            ))}

            {/* measured rooms fill in + outline draws */}
            {measured.map((r, i) => (
              <g key={r.id}>
                <rect
                  x={r.x} y={r.y} width={r.w} height={r.h}
                  fill={r.id === activeRoom?.id ? "rgba(226,249,82,0.16)" : "rgba(226,249,82,0.07)"}
                  stroke="#E2F952"
                  strokeWidth={r.id === activeRoom?.id ? 1.6 : 0.9}
                  style={{ animation: "gl-rise 260ms ease-out both", animationDelay: `${i * 20}ms` }}
                />
                {/* dimension witness line */}
                <line x1={r.x + 3} y1={r.y + r.h - 4} x2={r.x + r.w - 3} y2={r.y + r.h - 4}
                      stroke="#E2F952" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.8" />
                <text x={r.x + 4} y={r.y + 11} fill="#E2F952" fontSize="5.5" fontFamily="monospace">
                  {r.sqft} SF
                </text>
                <text x={r.x + 4} y={r.y + r.h - 7} fill="#94A3B8" fontSize="4.6" fontFamily="monospace">
                  {r.dim}
                </text>
              </g>
            ))}

            {/* the scan bar */}
            {running && (
              <>
                <rect x="0" y={scanY - 14} width="300" height="14" fill="url(#scanGrad)" opacity="0.55" />
                <line x1="0" y1={scanY} x2="300" y2={scanY} stroke="#E2F952" strokeWidth="0.9" />
              </>
            )}
            <defs>
              <linearGradient id="scanGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#E2F952" stopOpacity="0" />
                <stop offset="100%" stopColor="#E2F952" stopOpacity="0.5" />
              </linearGradient>
            </defs>

            {/* corner crosshairs — the "instrument" feel */}
            {[[6, 6], [294, 6], [6, 184], [294, 184]].map(([cx, cy]) => (
              <g key={`${cx}-${cy}`} stroke="#E2F952" strokeWidth="0.8" opacity="0.7">
                <line x1={cx - 5} y1={cy} x2={cx + 5} y2={cy} />
                <line x1={cx} y1={cy - 5} x2={cx} y2={cy + 5} />
              </g>
            ))}
          </svg>

          {/* scale chip */}
          <div className="absolute bottom-3 left-3 flex items-center gap-2 border border-hairline bg-canvas-2/90 px-2.5 py-1.5">
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-3">Scale</span>
            <span
              data-testid="scan-scale"
              className={cn("font-mono text-[11px]", scaleLocked ? "text-brand" : "text-ink-4")}
            >
              {scaleLocked ? "1/4\" = 1'-0\" LOCKED" : "detecting…"}
            </span>
          </div>
        </div>

        {/* ---- the numbers ---- */}
        <div className="p-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-3">Measured</div>
              <div className="font-mono text-4xl font-semibold leading-none text-ink" data-testid="scan-sqft">
                {runningSqft.toLocaleString()}
                <span className="ml-1 text-base text-ink-3">SF</span>
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-3">Rooms</div>
              <div className="font-mono text-2xl font-semibold text-brand" data-testid="scan-rooms">
                {measured.length}/{ROOMS.length}
              </div>
            </div>
          </div>

          {/* progress */}
          <div className="mt-4 h-1.5 w-full bg-hairline">
            <div
              className="h-full bg-brand transition-[width] duration-200 ease-linear"
              style={{ width: `${pct}%` }}
              data-testid="scan-progress"
            />
          </div>
          <div className="mt-2 font-mono text-[11px] text-ink-3" data-testid="scan-stage">
            {STAGES[stageIndex]}
            <span className="text-brand">{running ? " ▍" : ""}</span>
          </div>

          {/* rolling capture log */}
          <div className="mt-4 space-y-1.5">
            {measured.slice(-5).reverse().map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 border-l-2 border-brand/50 bg-surface px-2.5 py-1.5"
                style={{ animation: "gl-rise 220ms ease-out both" }}
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-[11px] text-ink-2">{r.label}</div>
                  <div className="truncate font-mono text-[10px] text-ink-3">{r.dim} · {r.floor}</div>
                </div>
                <span className="shrink-0 font-mono text-[11px] font-semibold text-brand">{r.sqft} SF</span>
              </div>
            ))}
            {measured.length === 0 && (
              <p className="font-mono text-[11px] text-ink-4">Waiting for the first dimension string…</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
