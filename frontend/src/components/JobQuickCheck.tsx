import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check, ChevronDown, ChevronUp, Loader2, RotateCcw, Sparkles, Sliders,
} from "lucide-react";
import { apiDelete, apiGet, apiPut } from "@/lib/api";
import { FLOOR_TYPES } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types — the merged profile the backend returns from GET /jobs/{id}/profile
// ---------------------------------------------------------------------------

type Profile = {
  default_scope: string;
  default_install_method: string;
  adhesive_supplied_by: string;
  transition_rule: string;
  rates_per_sqft: Record<string, number>;
  waste_pct: Record<string, number>;
  extra_work_billed: Record<string, boolean>;
  completed: boolean;
};

const SCOPE_LABEL: Record<string, string> = {
  supply_install: "Supply & Install",
  install_only: "Install Only",
  supply_only: "Supply Only",
};

const METHOD_LABEL: Record<string, string> = {
  glued: "Glue-down",
  click: "Click-lock",
  floating: "Floating",
  mixed: "Mixed",
};

const ADHESIVE_LABEL: Record<string, string> = {
  contractor: "You supply",
  gc: "GC / owner supplies",
  not_required: "Not required",
};

const TRANSITION_LABEL: Record<string, string> = {
  on_flooring_change: "Only at flooring changes",
  every_door: "Every door opening",
};

export default function JobQuickCheck({
  jobId,
  onReady,
}: {
  jobId: string;
  onReady: () => void; // called when the user is ready to run the takeoff
}) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<Profile | null>(null);

  const profile = useQuery<Profile>({
    queryKey: ["job-profile", jobId],
    queryFn: () => apiGet<Profile>(`/jobs/${jobId}/profile`),
    enabled: Boolean(jobId),
  });

  useEffect(() => {
    if (profile.data && !draft) setDraft(profile.data);
  }, [profile.data, draft]);

  const saveOverrides = useMutation({
    mutationFn: (patch: Partial<Profile>) =>
      apiPut<Profile>(`/jobs/${jobId}/overrides`, {
        scope: patch.default_scope,
        install_method: patch.default_install_method,
        adhesive_supplied_by: patch.adhesive_supplied_by,
        transition_rule: patch.transition_rule,
        rates_per_sqft: patch.rates_per_sqft,
        waste_pct: patch.waste_pct,
        extra_work_billed: patch.extra_work_billed,
      }),
    onSuccess: (data) => {
      qc.setQueryData(["job-profile", jobId], data);
      setDraft(data);
      toast.success("This job's settings saved");
      setExpanded(false);
    },
    onError: () => toast.error("Could not save this job's settings"),
  });

  const resetOverrides = useMutation({
    mutationFn: () => apiDelete(`/jobs/${jobId}/overrides`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["job-profile", jobId] });
      setDraft(null);
      toast.success("Reset to your defaults");
      setExpanded(false);
    },
    onError: () => toast.error("Could not reset"),
  });

  if (profile.isLoading || !draft) {
    return (
      <div className="flex items-center gap-3 border border-hairline bg-surface px-5 py-4 text-ink-3">
        <Loader2 className="h-4 w-4 animate-spin text-brand" />
        Loading your defaults…
      </div>
    );
  }

  const hasOverrides = Boolean(
    draft.default_scope !== profile.data?.default_scope ||
    draft.default_install_method !== profile.data?.default_install_method,
  );

  const set = (patch: Partial<Profile>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));

  // -------- Collapsed view: one line summary + the two actions --------
  if (!expanded) {
    return (
      <div className="gl-rise border border-hairline bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <div>
              <p className="font-heading text-base font-semibold text-ink">
                {SCOPE_LABEL[draft.default_scope] ?? draft.default_scope} ·{" "}
                {METHOD_LABEL[draft.default_install_method] ?? draft.default_install_method}
              </p>
              <p className="mt-0.5 text-[14px] text-ink-3">
                {ADHESIVE_LABEL[draft.adhesive_supplied_by]} · Transitions:{" "}
                {TRANSITION_LABEL[draft.transition_rule]}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 border border-hairline px-3 py-2 font-mono text-[12px] uppercase tracking-[0.12em] text-ink-2 transition-colors hover:border-brand/60 hover:text-brand"
              onClick={() => setExpanded(true)}
            >
              <Sliders className="h-3.5 w-3.5" /> Adjust for this job
            </button>
          </div>
        </div>

        <div className="border-t border-hairline px-5 py-3">
          <Button
            size="lg"
            className="w-full font-semibold"
            onClick={onReady}
          >
            <Check className="h-4 w-4" /> Read the blueprint
          </Button>
        </div>
      </div>
    );
  }

  // -------- Expanded view: the override form --------
  return (
    <div className="gl-rise border border-brand/40 bg-surface">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-3">
          This job only
        </span>
        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            setDraft(profile.data ?? draft); // discard
          }}
          className="text-ink-3 hover:text-ink"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-6 p-5">
        {/* Scope */}
        <Field label="Bid type">
          <Row>
            {(["supply_install", "install_only", "supply_only"] as const).map((v) => (
              <Chip
                key={v}
                active={draft.default_scope === v}
                onClick={() => set({ default_scope: v })}
              >
                {SCOPE_LABEL[v]}
              </Chip>
            ))}
          </Row>
        </Field>

        {/* Install method */}
        <Field label="Install method">
          <Row>
            {(["glued", "click", "floating", "mixed"] as const).map((v) => (
              <Chip
                key={v}
                active={draft.default_install_method === v}
                onClick={() => set({ default_install_method: v })}
              >
                {METHOD_LABEL[v]}
              </Chip>
            ))}
          </Row>
        </Field>

        {/* Adhesive supplier — only if method touches glue */}
        {["glued", "mixed", "floating"].includes(draft.default_install_method) && (
          <Field label="Adhesive supplier">
            <Row>
              {(["contractor", "gc", "not_required"] as const).map((v) => (
                <Chip
                  key={v}
                  active={draft.adhesive_supplied_by === v}
                  onClick={() => set({ adhesive_supplied_by: v })}
                >
                  {ADHESIVE_LABEL[v]}
                </Chip>
              ))}
            </Row>
          </Field>
        )}

        {/* Transition rule */}
        <Field label="Transition strips">
          <Row>
            {(["on_flooring_change", "every_door"] as const).map((v) => (
              <Chip
                key={v}
                active={draft.transition_rule === v}
                onClick={() => set({ transition_rule: v })}
              >
                {TRANSITION_LABEL[v]}
              </Chip>
            ))}
          </Row>
        </Field>

        {/* Rates / waste — collapsible to keep the phone view clean */}
        <details className="border border-hairline bg-surface-2">
          <summary className="flex cursor-pointer items-center justify-between px-4 py-3 font-heading text-[15px] font-semibold text-ink">
            Rates & waste for this job
            <ChevronDown className="h-4 w-4 text-ink-3" />
          </summary>
          <div className="border-t border-hairline p-4">
            <div className="grid gap-2.5 sm:grid-cols-2">
              {FLOOR_TYPES.map((ft) => (
                <div
                  key={ft}
                  className="flex items-center justify-between gap-3 border border-hairline bg-surface px-3 py-2"
                >
                  <span className="text-[14px] text-ink-2">{ft}</span>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="0.05"
                      value={draft.rates_per_sqft[ft] ?? ""}
                      onChange={(e) =>
                        set({
                          rates_per_sqft: {
                            ...draft.rates_per_sqft,
                            [ft]: Number(e.target.value) || 0,
                          },
                        })
                      }
                      className="h-9 w-[84px] text-right font-mono text-sm"
                    />
                    <span className="font-mono text-[11px] text-ink-4">$/sf</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </details>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-4">
        <button
          type="button"
          onClick={() => resetOverrides.mutate()}
          disabled={resetOverrides.isPending || !hasOverrides}
          className={cn(
            "inline-flex items-center gap-1.5 font-mono text-[12px] uppercase tracking-[0.12em]",
            hasOverrides ? "text-ink-3 hover:text-ink" : "text-ink-4",
          )}
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
        </button>

        <Button
          size="lg"
          className="font-semibold"
          onClick={() => saveOverrides.mutate(draft)}
          disabled={saveOverrides.isPending}
        >
          {saveOverrides.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Check className="h-4 w-4" /> Save for this job
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiny layout helpers — kept local so this component is self-contained
// ---------------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">
        {label}
      </div>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border px-4 py-2.5 text-[14px] font-medium transition-all duration-150",
        active
          ? "border-brand bg-brand/10 text-ink"
          : "border-hairline bg-surface text-ink-2 hover:border-brand/50",
      )}
    >
      {children}
    </button>
  );
}