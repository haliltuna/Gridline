import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, Check, Loader2, Sparkles, Layers, Grid3x3, Shuffle,
  Package, Box, CircleDot, DoorOpen, CornerDownRight,
} from "lucide-react";
import { apiGet, apiPut } from "@/lib/api";
import { FLOOR_TYPES } from "@/lib/types";
import Shell from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ChoiceOption = {
  value: string;
  label: string;
  hint?: string;
  icon?: string;
  multiplier?: number;
  type?: "per_sqft" | "flat";
  rate?: number;
  amount?: number;
  install_only?: boolean;
};

type WizardStep = {
  id: string;
  section: string;
  title: string;
  subtitle?: string;
  type: "choice_cards" | "per_floor_type_number" | "toggles";
  options?: ChoiceOption[];
  unit?: string;
  field?: string;
  region_aware?: boolean;
  focus_from?: string;
  toggleable?: boolean;
  toggle_label?: string;
};

type WizardProfile = {
  default_scope: string;
  default_install_method: string;
  adhesive_supplied_by: string;
  transition_rule: string;
  pattern_default: string;
  rates_per_sqft: Record<string, number>;
  waste_pct: Record<string, number>;
  extra_work_billed: Record<string, boolean>;
  completed: boolean;
};

const ICONS: Record<string, typeof Layers> = {
  layers: Layers, grid: Grid3x3, wind: Shuffle, shuffle: Shuffle,
  package: Package, wrench: Box, box: Box, dot: CircleDot,
  door: DoorOpen, git: CornerDownRight,
};

export default function Wizard() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const stepsQuery = useQuery<{ steps: WizardStep[] }>({
    queryKey: ["wizard-steps"],
    queryFn: () => apiGet<{ steps: WizardStep[] }>("/wizard/steps"),
    staleTime: Infinity,
  });

  const profileQuery = useQuery<WizardProfile>({
    queryKey: ["wizard-profile"],
    queryFn: () => apiGet<WizardProfile>("/wizard/profile"),
  });

  const [answers, setAnswers] = useState<WizardProfile | null>(null);
  const [index, setIndex] = useState(0);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (profileQuery.data && !answers) setAnswers(profileQuery.data);
  }, [profileQuery.data, answers]);

  const steps = useMemo(() => {
    const all = stepsQuery.data?.steps ?? [];
    return all.filter((s) => visibleFor(s, answers));
  }, [stepsQuery.data, answers]);

  const step = steps[index];

  const save = useMutation({
    mutationFn: () => apiPut<WizardProfile>("/wizard/profile", answers ?? {}),
    onSuccess: (data) => {
      qc.setQueryData(["wizard-profile"], data);
      toast.success("Defaults saved — new jobs will use these");
      navigate("/upload");
    },
    onError: () => toast.error("Could not save your defaults"),
  });

  const set = (patch: Partial<WizardProfile>) =>
    setAnswers((a) => (a ? { ...a, ...patch } : a));

  const pickChoice = (id: string, value: string) => {
    set({ [id]: value } as unknown as Partial<WizardProfile>);
    setPulse(true);
    setTimeout(() => {
      setPulse(false);
      if (index < steps.length - 1) setIndex((i) => i + 1);
    }, 420);
  };

  if (stepsQuery.isLoading || profileQuery.isLoading || !answers) {
    return (
      <Shell title="Setting up" subtitle="Loading your defaults">
        <div className="flex items-center gap-3 text-ink-3">
          <Loader2 className="h-4 w-4 animate-spin text-brand" /> Loading your setup…
        </div>
      </Shell>
    );
  }

  if (!step) {
    return (
      <Shell title="All set" subtitle="Your defaults are saved">
        <Button size="lg" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Go to upload"}
        </Button>
      </Shell>
    );
  }

  const progress = ((index + 1) / steps.length) * 100;
  const isLast = index === steps.length - 1;

  return (
    <Shell title="Set up your defaults" subtitle="Six quick questions — nothing is locked in.">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(226,249,82,0.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(226,249,82,0.6) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(circle at center, black 30%, transparent 85%)",
          WebkitMaskImage: "radial-gradient(circle at center, black 30%, transparent 85%)",
        }}
      />

      <div className="mx-auto max-w-3xl">
        <div className="mb-10">
          <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.22em] text-ink-3">
            <span>{step.section}</span>
            <span>
              {String(index + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}
            </span>
          </div>
          <div className="mt-4 flex gap-1">
            {steps.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-[2px] flex-1 transition-all duration-500",
                  i < index ? "bg-brand"
                    : i === index ? "bg-brand/70"
                    : "bg-surface-2",
                )}
                style={{
                  boxShadow: i === index ? "0 0 12px rgba(226,249,82,0.55)" : undefined,
                }}
              />
            ))}
          </div>
        </div>

        <div key={step.id} className="gl-rise">
          <h2 className="font-heading text-[34px] font-semibold leading-[1.05] tracking-tight text-ink sm:text-[44px]">
            {step.title}
          </h2>
          {step.subtitle && (
            <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-ink-2">
              {step.subtitle}
            </p>
          )}

          <div className="mt-10">
            {step.type === "choice_cards" && step.options && (
              <ChoiceCards
                options={step.options}
                value={(answers as unknown as Record<string, string>)[step.id]}
                pulse={pulse}
                onChange={(v) => pickChoice(step.id, v)}
              />
            )}

            {step.type === "per_floor_type_number" && step.field && (
              <PerFloorTypeNumbers
                step={step}
                answers={answers}
                onFieldChange={(floorType, value) => {
                  const key = step.field === "rate_per_sqft" ? "rates_per_sqft" : "waste_pct";
                  const current = (answers as unknown as Record<string, Record<string, number>>)[key] ?? {};
                  set({ [key]: { ...current, [floorType]: value } } as unknown as Partial<WizardProfile>);
                }}
                onApplyStandards={() => {
                  const key = step.field === "rate_per_sqft" ? "rates_per_sqft" : "waste_pct";
                  void apiGet<WizardProfile>("/wizard/profile").then((serverProfile) => {
                    set({ [key]: (serverProfile as unknown as Record<string, Record<string, number>>)[key] ?? {} } as unknown as Partial<WizardProfile>);
                    toast.success("Regional defaults applied");
                  });
                }}
              />
            )}

            {step.type === "toggles" && step.options && (
              <Toggles
                options={step.options}
                values={answers.extra_work_billed}
                onChange={(id, on) =>
                  set({ extra_work_billed: { ...answers.extra_work_billed, [id]: on } })
                }
              />
            )}
          </div>
        </div>

        <div className="mt-16 flex items-center justify-between gap-4">
          <button
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            className={cn(
              "inline-flex items-center gap-1.5 font-mono text-[12px] uppercase tracking-[0.18em] transition-colors",
              index === 0 ? "text-ink-4" : "text-ink-3 hover:text-ink",
            )}
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>

          <div className="flex items-center gap-4">
            {!isLast && (
              <button
                className="font-mono text-[12px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink"
                onClick={() => save.mutate()}
                disabled={save.isPending}
              >
                Skip
              </button>
            )}

            {isLast ? (
              <Button size="lg" className="font-semibold" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                ) : (
                  <><Check className="h-4 w-4" /> Save &amp; upload</>
                )}
              </Button>
            ) : step.type !== "choice_cards" ? (
              <Button size="lg" className="font-semibold" onClick={() => setIndex((i) => i + 1)}>
                Next
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function ChoiceCards({
  options, value, pulse, onChange,
}: {
  options: ChoiceOption[];
  value: string;
  pulse: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((opt) => {
        const Icon = ICONS[opt.icon ?? ""] ?? Sparkles;
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "group relative flex items-start gap-4 border p-6 text-left transition-all duration-300",
              "hover:border-brand/60",
              selected
                ? "border-brand bg-brand/[0.06] shadow-[0_0_0_1px_rgba(226,249,82,0.35),0_0_32px_-8px_rgba(226,249,82,0.55)]"
                : "border-hairline bg-surface",
              pulse && selected ? "scale-[0.98]" : "scale-100",
            )}
            style={{ transformOrigin: "center" }}
          >
            <span
              className={cn(
                "grid h-12 w-12 shrink-0 place-items-center border transition-colors",
                selected ? "border-brand text-brand" : "border-hairline text-ink-3",
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="flex-1">
              <span className="block font-heading text-[19px] font-semibold text-ink">
                {opt.label}
              </span>
              {opt.hint && (
                <span className="mt-1.5 block text-[15px] leading-relaxed text-ink-3">{opt.hint}</span>
              )}
              {opt.multiplier !== undefined && opt.value !== "standard" && (
                <span className="mt-2 inline-block font-mono text-[12px] uppercase tracking-[0.14em] text-brand">
                  {opt.multiplier.toFixed(2)}×
                </span>
              )}
            </span>
            {selected && (
              <span className="absolute right-4 top-4 grid h-5 w-5 place-items-center bg-brand text-[#0b0f0a]">
                <Check className="h-3.5 w-3.5" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function PerFloorTypeNumbers({
  step, answers, onFieldChange, onApplyStandards,
}: {
  step: WizardStep;
  answers: WizardProfile;
  onFieldChange: (floorType: string, value: number) => void;
  onApplyStandards: () => void;
}) {
  const [applyStandards, setApplyStandards] = useState(true);
  const isRate = step.field === "rate_per_sqft";
  const key = isRate ? "rates_per_sqft" : "waste_pct";
  const values = (answers as unknown as Record<string, Record<string, number>>)[key] ?? {};

  const focus = answers.default_install_method;
  const relevantTypes = useMemo(() => {
    if (focus === "mixed") return FLOOR_TYPES;
    if (focus === "glued") {
      return FLOOR_TYPES.filter((ft) =>
        ft.startsWith("Glue Down") || ft.includes("Glue") || ft.includes("Tile") ||
        ft === "Sheet Vinyl" || ft === "Broadloom Carpet" || ft === "Carpet Tile" ||
        ft === "Natural Stone" || ft === "Epoxy / Resinous"
      );
    }
    return FLOOR_TYPES.filter((ft) =>
      ft.startsWith("Click") || ft === "Laminate" || ft.includes("Nail") ||
      ft === "Broadloom Carpet" || ft === "Carpet Tile" || ft.includes("Tile")
    );
  }, [focus]);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4 border border-hairline bg-surface px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={applyStandards}
            onClick={() => {
              const next = !applyStandards;
              setApplyStandards(next);
              if (next) onApplyStandards();
            }}
            className={cn(
              "relative h-6 w-11 shrink-0 border transition-colors",
              applyStandards ? "border-brand bg-brand" : "border-hairline bg-surface-2",
            )}
          >
            <span
              className={cn(
                "absolute top-[1px] h-[20px] w-[20px] bg-white transition-transform duration-200",
                applyStandards ? "translate-x-[22px]" : "translate-x-[2px]",
              )}
            />
          </button>
          <span className="font-heading text-[15px] font-semibold text-ink">
            {step.toggle_label ?? "Apply industry defaults"}
          </span>
        </div>
        <span className="hidden font-mono text-[11px] uppercase tracking-[0.16em] text-ink-4 sm:block">
          toggle off to enter your own
        </span>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {relevantTypes.map((ft) => (
          <div
            key={ft}
            className="flex items-center justify-between gap-3 border border-hairline bg-surface px-4 py-3"
          >
            <span className="text-[15px] leading-tight text-ink-2">{ft}</span>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step={isRate ? "0.05" : "0.5"}
                inputMode="decimal"
                value={values[ft] ?? ""}
                onChange={(e) => onFieldChange(ft, Number(e.target.value) || 0)}
                className="h-10 w-[96px] text-right font-mono text-base"
              />
              <span className="w-8 font-mono text-[12px] text-ink-3">{step.unit}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 font-mono text-[11px] leading-relaxed text-ink-4">
        * Rates are recommended for your region and bid type. Adjust to match your book.
      </p>
    </div>
  );
}

function Toggles({
  options, values, onChange,
}: {
  options: ChoiceOption[];
  values: Record<string, boolean>;
  onChange: (id: string, on: boolean) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((opt) => {
        const on = values[opt.value] ?? false;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value, !on)}
            className={cn(
              "flex items-center justify-between gap-4 border px-5 py-4 text-left transition-all duration-200",
              on ? "border-brand bg-brand/[0.06]" : "border-hairline bg-surface hover:border-brand/60",
            )}
          >
            <div className="min-w-0">
              <span className="block font-heading text-[16px] font-semibold text-ink">
                {opt.label}
              </span>
              {opt.type && (
                <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
                  {opt.type === "flat"
                    ? `flat · $${(opt.amount ?? 0).toFixed(0)}`
                    : `$${(opt.rate ?? 0).toFixed(2)}/sf${opt.install_only ? " · install" : ""}`}
                </span>
              )}
            </div>
            <span
              className={cn(
                "relative h-6 w-11 shrink-0 border transition-colors",
                on ? "border-brand bg-brand" : "border-hairline bg-surface-2",
              )}
            >
              <span
                className={cn(
                  "absolute top-[1px] h-[20px] w-[20px] bg-white transition-transform duration-200",
                  on ? "translate-x-[22px]" : "translate-x-[2px]",
                )}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}

function visibleFor(step: WizardStep, answers: WizardProfile | null): boolean {
  if (!answers) return true;
  if (step.id === "adhesive_supplied_by") {
    return ["glued", "mixed", "click"].includes(answers.default_install_method);
  }
  return true;
}