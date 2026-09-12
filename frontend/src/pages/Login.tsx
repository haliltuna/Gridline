import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiPost, ApiError } from "@/lib/api";
import { beginSession } from "@/lib/session";
import { useAuth } from "@/hooks/useAuth";
import type { User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Shell";

export default function Login() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup">(params.get("mode") === "signup" ? "signup" : "login");
  const [email, setEmail] = useState("demo@gridline.app");
  const [password, setPassword] = useState("gridline123");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  // Already signed in (cookie still valid)? Don't sit on the sign-in page.
  useEffect(() => {
    if (user) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  const mut = useMutation({
    mutationFn: async () => {
      beginSession();
      const path = mode === "signup" ? "/auth/signup" : "/auth/login";
      const body = mode === "signup" ? { email, password, name, company } : { email, password };
      return apiPost<User>(path, body);
    },
    onSuccess: async (user) => {
      // Seed the cache AND confirm the cookie round-trips before leaving this page, so we
      // never hand the user to a guarded route that will bounce them straight back here.
      qc.setQueryData(["me"], user);
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success(`Welcome, ${user.name.split(" ")[0]}`);
      navigate("/dashboard", { replace: true });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? (e.body as { detail?: string })?.detail : null;
      const msg = detail ?? (e instanceof Error ? e.message : null) ?? "Could not sign you in";
      setError(msg);
      toast.error(msg);
    },
  });

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-[#090D12] px-5 py-12">
      <div className="gl-grid absolute inset-0 opacity-30" />
      <div className="relative w-full max-w-md gl-rise">
        <Link to="/" data-testid="login-home-link" className="mb-8 inline-block"><Logo /></Link>
        <div className="border border-slate-800/80 bg-[#0F1722] p-8">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#E2F952]">
            {mode === "signup" ? "Create account" : "Sign in"}
          </p>
          <h1 className="mt-3 font-heading text-3xl font-bold tracking-tight text-slate-100">
            {mode === "signup" ? "Start your 14-day trial" : "Back to the estimating desk"}
          </h1>

          <form
            className="mt-8 space-y-5"
            data-testid="login-form"
            onSubmit={(e) => { e.preventDefault(); setError(null); mut.mutate(); }}
          >
            {error && (
              <p className="border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-sm text-red-300" data-testid="login-error">
                {error}
              </p>
            )}
            {mode === "signup" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-slate-300">Your name</Label>
                  <Input id="name" data-testid="signup-name-input" value={name} onChange={(e) => setName(e.target.value)} required className="h-12 text-base" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company" className="text-slate-300">Company</Label>
                  <Input id="company" data-testid="signup-company-input" value={company} onChange={(e) => setCompany(e.target.value)} className="h-12 text-base" />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-300">Email</Label>
              <Input id="email" type="email" data-testid="login-email-input" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-12 text-base" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300">Password</Label>
              <Input id="password" type="password" data-testid="login-password-input" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-12 text-base" />
            </div>
            <Button type="submit" size="lg" data-testid="login-submit-button" disabled={mut.isPending} className="w-full font-semibold">
              {mut.isPending ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
            </Button>
          </form>

          <button
            type="button"
            data-testid="login-mode-toggle"
            className="mt-6 w-full text-center text-sm text-slate-400 transition-colors hover:text-[#E2F952]"
            onClick={() => setMode(mode === "signup" ? "login" : "signup")}
          >
            {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
          </button>
        </div>
        <p className="mt-5 text-center font-mono text-xs text-slate-500" data-testid="login-demo-hint">
          Demo login · demo@gridline.app / gridline123
        </p>
      </div>
    </div>
  );
}
