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
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-canvas px-5 py-12">
      <div className="gl-grid absolute inset-0 opacity-30" />
      <div className="relative w-full max-w-md gl-rise">
        <Link to="/" data-testid="login-home-link" className="mb-8 inline-block"><Logo /></Link>
        <div className="border border-hairline/80 bg-surface p-8">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-brand">
            {mode === "signup" ? "Create account" : "Sign in"}
          </p>
          <h1 className="mt-3 font-heading text-3xl font-bold tracking-tight text-ink">
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
                  <Label htmlFor="name" className="text-ink-2">Your name</Label>
                  <Input id="name" data-testid="signup-name-input" value={name} onChange={(e) => setName(e.target.value)} required className="h-12 text-base" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company" className="text-ink-2">Company</Label>
                  <Input id="company" data-testid="signup-company-input" value={company} onChange={(e) => setCompany(e.target.value)} className="h-12 text-base" />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-ink-2">Email</Label>
              <Input id="email" type="email" data-testid="login-email-input" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-12 text-base" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-ink-2">Password</Label>
              <Input id="password" type="password" data-testid="login-password-input" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-12 text-base" />
            </div>
            <button
              type="button"
              data-testid="google-signin-button"
              onClick={() => {
                // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
                const redirectUrl = window.location.origin + "/dashboard";
                window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
              }}
              className="flex h-12 w-full items-center justify-center gap-3 border border-hairline bg-surface-2 font-semibold text-ink transition-colors hover:border-brand/60 hover:text-brand"
            >
              <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.8-6.8C35.6 2.3 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.4 17.7 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-2.8-.4-4.1H24v8.4h12.5c-.3 2.1-1.6 5.2-4.7 7.3l7.7 6c4.5-4.2 6.6-10.3 6.6-17.6z" />
                <path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.7 24c0-1.6.3-3.2.8-4.6l-7.9-6.2A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.2z" />
                <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.5-5.8l-7.7-6c-2.1 1.4-4.8 2.3-7.8 2.3-6.3 0-11.6-3.9-13.5-9.9l-7.9 6.2C6.5 42.6 14.6 48 24 48z" />
              </svg>
              Continue with Google
            </button>
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-hairline" />
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-4">or use email</span>
              <span className="h-px flex-1 bg-hairline" />
            </div>
            <Button type="submit" size="lg" data-testid="login-submit-button" disabled={mut.isPending} className="w-full font-semibold">
              {mut.isPending ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
            </Button>
          </form>

          <button
            type="button"
            data-testid="login-mode-toggle"
            className="mt-6 w-full text-center text-sm text-ink-3 transition-colors hover:text-brand"
            onClick={() => setMode(mode === "signup" ? "login" : "signup")}
          >
            {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
          </button>
        </div>
        <p className="mt-5 text-center font-mono text-xs text-ink-3" data-testid="login-demo-hint">
          Demo login · demo@gridline.app / gridline123
        </p>
      </div>
    </div>
  );
}
