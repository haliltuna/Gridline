import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import type { User } from "@/lib/types";
import { Logo } from "@/components/Shell";

// Emergent Google auth returns to {origin}/dashboard#session_id=...; this screen trades that
// one-time id for a real httpOnly cookie session on our own backend, then moves on.
// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    const sessionId = new URLSearchParams(location.hash.replace(/^#/, "")).get("session_id") ?? "";
    const target = location.pathname || "/dashboard";
    void (async () => {
      try {
        beginSession();
        const user = await apiPost<User>("/auth/google/session", { session_id: sessionId });
        qc.setQueryData(["me"], user);
        window.history.replaceState(null, "", target);
        await qc.invalidateQueries({ queryKey: ["me"] });
        navigate(target, { replace: true });
      } catch {
        window.history.replaceState(null, "", "/login");
        navigate("/login?error=google", { replace: true });
      }
    })();
  }, [location.hash, location.pathname, navigate, qc]);

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-5" data-testid="auth-callback">
      <div className="w-full max-w-sm border border-hairline bg-surface p-8">
        <Logo />
        <p className="mt-6 flex items-center gap-3 text-[15px] text-ink-2">
          <Loader2 className="h-5 w-5 animate-spin text-brand" /> Finishing Google sign-in…
        </p>
      </div>
    </div>
  );
}
