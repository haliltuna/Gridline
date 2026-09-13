import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, FileSignature, Loader2 } from "lucide-react";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import type { ApprovalView } from "@/lib/types";
import { money } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/Shell";

// The page a CLIENT lands on from the change-order email. No login: the opaque approve
// token in the URL is the credential. Signing accepts this revision only — earlier
// revisions stay on record exactly as they were.
export default function Approve() {
  const { token = "" } = useParams();
  const qc = useQueryClient();
  const [name, setName] = useState("");

  const view = useQuery<ApprovalView>({
    queryKey: ["approve", token],
    queryFn: () => apiGet<ApprovalView>(`/approve/${token}`),
    retry: false,
  });

  const sign = useMutation({
    mutationFn: () => apiPost<ApprovalView>(`/approve/${token}`, { signed_by: name }),
    onSuccess: (d) => {
      qc.setQueryData(["approve", token], d);
      toast.success("Change order approved — thank you");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not sign this change order"),
  });

  const d = view.data;
  const signed = Boolean(d?.signed_by);

  return (
    <div className="min-h-screen bg-canvas px-5 py-10 text-ink">
      <div className="mx-auto max-w-2xl">
        <Logo />

        {view.isLoading && (
          <p className="mt-10 flex items-center gap-3 text-ink-2" data-testid="approve-loading">
            <Loader2 className="h-5 w-5 animate-spin text-brand" /> Loading the change order…
          </p>
        )}

        {view.isError && (
          <div className="mt-10 border border-red-500/40 bg-red-500/10 p-6" data-testid="approve-invalid">
            <h1 className="font-heading text-2xl font-bold text-ink">This approval link is not valid</h1>
            <p className="mt-2 text-[15px] text-ink-2">
              Ask your contractor to resend the change order — links are unique to each revision.
            </p>
          </div>
        )}

        {d && (
          <div className="mt-8 border border-hairline bg-surface" data-testid="approve-card">
            <div className="border-b border-hairline px-6 py-5">
              <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand">
                Change order · revision {d.revision}
              </div>
              <h1 className="mt-2 font-heading text-3xl font-bold text-ink" data-testid="approve-number">
                {d.number}
              </h1>
              <p className="mt-1 text-[15px] text-ink-2">
                {d.company_name} · {d.job_name} · for {d.client_name || "you"}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-px bg-hairline/60">
              <div className="bg-surface-2 px-5 py-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">Previous</div>
                <div className="mt-1 font-mono text-lg text-ink-2" data-testid="approve-previous-total">
                  {money(d.previous_total)}
                </div>
              </div>
              <div className="bg-surface-2 px-5 py-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">Revised</div>
                <div className="mt-1 font-mono text-lg font-semibold text-ink" data-testid="approve-total">
                  {money(d.total)}
                </div>
              </div>
              <div className="bg-surface-2 px-5 py-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">Change</div>
                <div className={`mt-1 font-mono text-lg font-semibold ${d.delta >= 0 ? "text-brand" : "text-emerald-400"}`}
                     data-testid="approve-delta">
                  {d.delta >= 0 ? "+" : "−"}{money(Math.abs(d.delta))}
                </div>
              </div>
            </div>

            {d.lines.length > 0 && (
              <div className="divide-y divide-hairline/60 px-6" data-testid="approve-lines">
                {d.lines.map((l, i) => (
                  <div key={i} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-[15px] text-ink">{String(l.room ?? "")}</span>
                      <span className="font-mono text-sm text-ink-2">
                        {money(Number(l.old_cost ?? 0))} → <span className="text-ink">{money(Number(l.new_cost ?? 0))}</span>
                      </span>
                    </div>
                    {Array.isArray(l.changes) && l.changes.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {(l.changes as { field: string; before: string; after: string }[]).map((c) => (
                          <span key={c.field} className="border border-hairline bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-ink-2">
                            {c.field}: <span className="text-ink-4 line-through">{c.before}</span>{" "}
                            <span className="text-brand">{c.after}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-hairline px-6 py-6">
              {signed ? (
                <div className="flex items-start gap-3" data-testid="approve-signed">
                  <CheckCircle2 className="mt-0.5 h-6 w-6 text-brand" />
                  <div>
                    <div className="font-heading text-xl font-semibold text-ink">Approved</div>
                    <p className="mt-1 text-[15px] text-ink-2">
                      Signed by {d.signed_by}. Your contractor has been notified and can now invoice this revision.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <label htmlFor="sig" className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">
                    Type your full name to sign
                  </label>
                  <div className="mt-2 flex flex-wrap gap-3">
                    <Input
                      id="sig" data-testid="approve-name-input" placeholder="Jordan Michaels"
                      value={name} onChange={(e) => setName(e.target.value)}
                      className="h-12 flex-1 text-base"
                    />
                    <Button
                      size="lg" className="font-semibold" data-testid="approve-sign-button"
                      disabled={!name.trim() || sign.isPending}
                      onClick={() => sign.mutate()}
                    >
                      {sign.isPending
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing…</>
                        : <><FileSignature className="h-4 w-4" /> Approve &amp; sign</>}
                    </Button>
                  </div>
                  <p className="mt-3 text-sm text-ink-3">
                    Signing authorises the revised scope and total above. The earlier revision stays on record.
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
