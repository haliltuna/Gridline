import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserPlus, Trash2, ShieldCheck, Copy } from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from "@/lib/api";
import type { RoleOption, TeamMember } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import Shell, { Panel } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ROLE_BLURB: Record<string, string> = {
  owner: "Full access — billing, settings, team and every job.",
  estimator: "Can read and edit jobs, takeoffs, quotes, invoices and expenses. No billing or settings.",
  viewer: "Read-only. Good for a superintendent or a client-side reviewer.",
};

export default function Team() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isOwner = (user?.role ?? "owner") === "owner";

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("estimator");
  const [issued, setIssued] = useState<TeamMember | null>(null);

  const members = useQuery<TeamMember[]>({
    queryKey: ["team"], queryFn: () => apiGet<TeamMember[]>("/team/members"), retry: false,
  });
  const roles = useQuery<RoleOption[]>({
    queryKey: ["team-roles"], queryFn: () => apiGet<RoleOption[]>("/team/roles"), retry: false,
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ["team"] });
  const fail = (e: unknown, fallback: string) => {
    const detail = e instanceof ApiError ? (e.body as { detail?: string })?.detail : null;
    toast.error(detail ?? fallback);
  };

  const invite = useMutation({
    mutationFn: () => apiPost<TeamMember>("/team/members", { email, name, role }),
    onSuccess: (m) => {
      refresh(); setIssued(m); setEmail(""); setName("");
      toast.success(`${m.name} added as ${m.role}`);
    },
    onError: (e) => fail(e, "Could not add that person"),
  });
  const changeRole = useMutation({
    mutationFn: (p: { id: string; role: string }) => apiPatch<TeamMember>(`/team/members/${p.id}`, { role: p.role }),
    onSuccess: () => { refresh(); toast.success("Role updated"); },
    onError: (e) => fail(e, "Could not change that role"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/team/members/${id}`),
    onSuccess: () => { refresh(); toast.success("Seat removed"); },
    onError: (e) => fail(e, "Could not remove that seat"),
  });

  const roleOptions = (roles.data ?? []).filter((r) => r.id !== "owner");

  return (
    <Shell title="Team & seats" subtitle="Add estimators and viewers to your account. Everyone sees the same jobs.">
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Panel className="h-fit">
          <h2 className="flex items-center gap-2 font-heading text-lg font-semibold text-ink">
            <UserPlus className="h-5 w-5 text-brand" /> Add a seat
          </h2>
          {!isOwner ? (
            <p className="mt-4 text-[15px] text-ink-3" data-testid="team-not-owner">
              Only the account owner can add or change seats.
            </p>
          ) : (
            <form className="mt-5 space-y-4" data-testid="team-invite-form"
                  onSubmit={(e) => { e.preventDefault(); invite.mutate(); }}>
              <div className="space-y-2">
                <Label htmlFor="tm-name" className="text-ink-2">Name</Label>
                <Input id="tm-name" data-testid="team-name-input" value={name} required
                       onChange={(e) => setName(e.target.value)} placeholder="Marisol Vega" className="h-12 text-base" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tm-email" className="text-ink-2">Email</Label>
                <Input id="tm-email" type="email" data-testid="team-email-input" value={email} required
                       onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" className="h-12 text-base" />
              </div>
              <div className="space-y-2">
                <Label className="text-ink-2">Role</Label>
                <Select value={role} onValueChange={(v: string) => setRole(v)}>
                  <SelectTrigger className="h-12 text-base" data-testid="team-role-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(roleOptions.length ? roleOptions : [{ id: "estimator", label: "Estimator" }, { id: "viewer", label: "Viewer (read-only)" }])
                      .map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-sm text-ink-3">{ROLE_BLURB[role]}</p>
              </div>
              <Button type="submit" size="lg" className="w-full font-semibold" data-testid="team-invite-button" disabled={invite.isPending}>
                {invite.isPending ? "Adding…" : "Add seat"}
              </Button>
            </form>
          )}

          {issued && (
            <div className="mt-5 border border-brand/40 bg-brand-soft p-4" data-testid="team-temp-password">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand">Temporary password</p>
              <p className="mt-2 text-[15px] text-ink-2">
                Give <b>{issued.email}</b> this password — they can sign in straight away.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 bg-canvas-2 px-3 py-2 font-mono text-base text-ink">{issued.temp_password}</code>
                <Button variant="outline" size="icon-sm" data-testid="team-copy-password"
                        onClick={() => { void navigator.clipboard.writeText(issued.temp_password ?? ""); toast.success("Copied"); }}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Panel>

        <Panel>
          <h2 className="flex items-center gap-2 font-heading text-lg font-semibold text-ink">
            <ShieldCheck className="h-5 w-5 text-brand" /> Seats on this account
          </h2>
          <div className="mt-5 space-y-3" data-testid="team-list">
            {(members.data ?? []).map((m) => (
              <div key={m.id} data-testid={`team-row-${m.id}`}
                   className="flex flex-wrap items-center justify-between gap-4 border border-hairline bg-surface-2 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-base font-medium text-ink">
                    {m.name} {m.is_you && <span className="font-mono text-xs text-brand">(you)</span>}
                  </div>
                  <div className="font-mono text-xs text-ink-3">{m.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  {m.role === "owner" || !isOwner ? (
                    <span data-testid={`team-role-${m.id}`}
                          className="border border-hairline px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.15em] text-ink-2">
                      {m.role}
                    </span>
                  ) : (
                    <Select value={m.role} onValueChange={(v: string) => changeRole.mutate({ id: m.id, role: v })}>
                      <SelectTrigger className="h-10 w-[190px]" data-testid={`team-role-${m.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {roleOptions.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  {isOwner && m.role !== "owner" && (
                    <Button variant="ghost" size="icon-sm" data-testid={`team-remove-${m.id}`} onClick={() => remove.mutate(m.id)}>
                      <Trash2 className="h-4 w-4 text-ink-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {(members.data ?? []).length === 0 && (
              <p className="text-ink-3" data-testid="team-empty">No seats yet.</p>
            )}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {Object.entries(ROLE_BLURB).map(([r, blurb]) => (
              <div key={r} className="border border-hairline bg-surface p-4">
                <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand">{r}</div>
                <p className="mt-2 text-sm text-ink-3">{blurb}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </Shell>
  );
}
