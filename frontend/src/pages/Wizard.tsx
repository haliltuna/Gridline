import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Check, Sparkles, Layers, Grid3x3, Wind, Shuffle,
  Package, Wrench, Box, CircleDot, DoorOpen, GitBranch, Loader2,
} from "lucide-react";
import { apiGet, apiPut } from "@/lib/api";
import { FLOOR_TYPES } from "@/lib/types";
import Shell from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types — mirror the shape lib/wizard_config.py sends from /api/wizard/steps
// ---------------------------------------------------------------------------

type ChoiceOption = {
  value: string;
  label: string;
  hint?: string;
  icon?: string;
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
  prefill_from?: string;
};

type WizardProfile = {
  default_scope: string;
  default_install_method: string;
  adhesive_supplied_by: string;
  transition_rule: string;
  rates_per_sqft: Record<string, number>;
  waste_pct: Record<string, number>;
  extra_work_billed: Record<string, boolean>;
  completed: boolean;
};

// Map a step's icon name to a lucide icon component
const ICONS: Record<string, typeof Layers> = {
  layers: Layers,
  grid: Grid3x3,
  wind: Wind,
  shuffle: Shuffle,
  package: Package,
  wrench: Wrench,
  box: Box,
  dot: CircleDot,
  door: DoorOpen,
  git: GitBranch,
};

export default function Wizard() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const stepsQuery = useQuery<{ steps: WizardStep[] }>({
    queryKey: ["wizard-steps"],
    queryFn: () => apiGet<{ steps: WizardStep[] }>("/wizard/steps"),
    staleTime: Infinity, // config never changes at runtime
  });

  const profileQuery = useQuery<WizardProfile>({
    queryKey: ["wizard-profile"],
    queryFn: () => apiGet<WizardProfile>("/wizard/profile"),
  });

  const [answers, setAnswers] = useState<WizardProfile | null>(null);
  const [index, setIndex] = useState(0);

  // Fill local state once the profile loads
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

  if (stepsQuery.isLoading || profileQuery.isLoading || !answers) {
    return (
      <Shell title="Setting up">
        <div className="flex items-center gap-3 text-ink-3">
          <Loader2 className="h-4 w-4 animate-spin text-brand" /> Loading your setup…
        </div>
      </Shell>
    );
  }

  if (!step) {
    // Nothing to show — save and move on
    return (
      <Shell title="All set">
        <Button size="lg" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Go to upload"}
        </Button>
      </Shell>
    );
  }

  const progress = ((index + 1) / steps.length) * 100;
  const isLast = index === steps.length - 1;
  const canAdvance = stepComplete(step, answers);

  return (
    <Shell
      title="Set up your defaults"
      subtitle="Answer six quick questions once. Every future takeoff starts from these — nothing is locked in."
    >
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.2em] text-ink-3">
          <span>{step.section}</span>
          <span>
            {index + 1} / {steps.length}
          </span>
        </div>
        <div className="mt-3 h-[3px] w-full bg-surface-2">
          <div
            className="h-full bg-brand transition-all duration-500 ease-out gl-rise"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* The step */}
      <div key={step.id} className="gl-rise">
        <h2 className="font-heading text-3xl font-semibold leading-tight text-ink sm:text-4xl">
          {step.title}
        </h2>
        {step.subtitle && (
          <p className="mt-3 max-w-2xl text-lg text-ink-2">{step.subtitle}</p>
        )}

        <div className="mt-8">
          {step.type === "choice_cards" && step.options && (
            <ChoiceCards
              options={step.options}
              value={(answers as unknown as Record<string, string>)[step.id]}
              onChange={(v) => set({ [step.id]: v } as unknown as Partial<WizardProfile>)}
            />
          )}

          {step.type === "per_floor_type_number" && step.field && (
            <PerFloorTypeNumbers
              unit={step.unit ?? ""}
              values={
                (answers as unknown as Record<string, Record<string, number>>)[
                  step.field === "rate_per_sqft" ? "rates_per_sqft" : "waste_pct"
                ] ?? {}
              }
              onChange={(ft, v) => {
                const key = step.field === "rate_per_sqft" ? "rates_per_sqft" : "waste_pct";
                const current = (answers as unknown as Record<string, Record<string, number>>)[key] ?? {};
                set({ [key]: { ...current, [ft]: v } } as unknown as Partial<WizardProfile>);
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

      {/* Nav */}
      <div className="mt-12 flex items-center justify-between gap-4 border-t border-hairline pt-6">
        <Button
          variant="ghost"
          size="lg"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        <div className="flex items-center gap-3">
          {!isLast && (
            <button
              className="font-mono text-[12px] uppercase tracking-[0.15em] text-ink-3 hover:text-ink"
              onClick={() => save.mutate()}
              disabled={save.isPending}
            >
              Skip — use defaults
            </button>
          )}

          {isLast ? (
            <Button
              size="lg"
              className="font-semibold"
              onClick={() => save.mutate()}
              disabled={save.isPending || !canAdvance}
            >
              {save.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" /> Save & upload
                </>
              )}
            </Button>
          ) : (
            <Button
              size="lg"
              className="font-semibold"
              onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))}
              disabled={!canAdvance}
            >
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ChoiceCards({
  options,
  value,
  onChange,
}: {
  options: ChoiceOption[];
  value: string;
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
              "group relative flex items-start gap-4 border p-5 text-left transition-all duration-200",
              "hover:border-brand/60",
              selected
                ? "border-brand bg-brand/5"
                : "border-hairline bg-surface",
            )}
          >
            <span
              className={cn(
                "grid h-11 w-11 shrink-0 place-items-center border transition-colors",
                selected ? "border-brand text-brand" : "border-hairline text-ink-3",
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="flex-1">
              <span className="block font-heading text-lg font-semibold text-ink">
                {opt.label}
              </span>
              {opt.hint && (
                <span className="mt-1 block text-[15px] text-ink-3">{opt.hint}</span>
              )}
            </span>
            {selected && (
              <span className="absolute right-4 top-4 grid h-5 w-5 place-items-center bg-brand text-white">
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
  unit,
  values,
  onChange,
}: {
  unit: string;
  values: Record<string, number>;
  onChange: (floorType: string, value: number) => void;
}) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {FLOOR_TYPES.map((ft) => (
        <div
          key={ft}
          className="flex items-center justify-between gap-3 border border-hairline bg-surface px-4 py-3"
        >
          <span className="text-[15px] text-ink-2">{ft}</span>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step={unit === "%" ? "0.5" : "0.05"}
              inputMode="decimal"
              value={values[ft] ?? ""}
              onChange={(e) => onChange(ft, Number(e.target.value) || 0)}
              className="h-10 w-[92px] text-right font-mono text-base"
            />
            <span className="font-mono text-[12px] text-ink-3">{unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Toggles({
  options,
  values,
  onChange,
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
              on ? "border-brand bg-brand/5" : "border-hairline bg-surface hover:border-brand/60",
            )}
          >
            <span className="font-heading text-base font-semibold text-ink">
              {opt.label}
            </span>
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

// ---------------------------------------------------------------------------
// Logic
// ---------------------------------------------------------------------------

function visibleFor(step: WizardStep, answers: WizardProfile | null): boolean {
  if (!answers) return true;
  // The only conditional step right now: adhesive question hides if the method never uses glue
  if (step.id === "adhesive_supplied_by") {
    return ["glued", "mixed", "floating"].includes(answers.default_install_method);
  }
  return true;
}

function stepComplete(step: WizardStep, answers: WizardProfile): boolean {
  switch (step.type) {
    case "choice_cards":
      return Boolean(
        (answers as unknown as Record<string, string>)[step.id],
      );
    case "per_floor_type_number":
      return true; // nothing is required — industry defaults are valid
    case "toggles":
      return true;
    default:
      return true;
  }
}