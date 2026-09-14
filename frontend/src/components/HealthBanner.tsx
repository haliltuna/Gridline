import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { HealthReport } from "@/lib/types";

// Plain-English label for each key, so the banner says what is OFF rather than naming a variable.
const FEATURE: Record<string, string> = {
  EMERGENT_LLM_KEY: "AI blueprint & spec-sheet reading (takeoffs fall back to sample data)",
  STRIPE_SECRET_KEY: "plan checkout and client card payments",
  STRIPE_WEBHOOK_SECRET: "automatic payment confirmation from Stripe",
  RESEND_API_KEY: "sending quotes, invoices and e-sign requests by email",
  SENDER_EMAIL: "the from-address on outgoing email",
  APP_URL: "links inside emails and client pay pages",
  MONGO_URL: "the database connection",
  DB_NAME: "the database connection",
  CORS_ORIGINS: "browser access control",
};

// Quiet, dismissible notice: a feature is off because its key is missing from backend/.env.
// Deliberately ignores SENDER_EMAIL and CORS_ORIGINS on their own — both have safe defaults.
const NOISE = new Set(["SENDER_EMAIL", "CORS_ORIGINS"]);

export default function HealthBanner() {
  const [dismissed, setDismissed] = useState(false);
  const health = useQuery<HealthReport>({
    queryKey: ["health"],
    queryFn: () => apiGet<HealthReport>("/health"),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  if (dismissed || !health.data) return null;
  const keys = [...health.data.missing_required,
                ...health.data.missing_optional.filter((k) => !NOISE.has(k))];
  if (keys.length === 0) return null;

  const features = keys.map((k) => FEATURE[k] ?? k);
  const blocking = health.data.missing_required.length > 0;

  return (
    <div
      data-testid="health-banner"
      className={`flex items-start gap-3 border-b px-5 py-2.5 text-sm ${
        blocking
          ? "border-red-500/40 bg-red-500/10 text-red-200"
          : "border-amber-500/40 bg-amber-500/10 text-amber-200"
      }`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="flex-1" data-testid="health-banner-message">
        {blocking ? "Server not fully configured — " : "Running with some features off — "}
        <span data-testid="health-banner-features">{features.join(", ")}</span>.{" "}
        <span className="opacity-80">Add the missing keys to backend/.env (see backend/.env.example) and restart.</span>
      </p>
      <button
        type="button" onClick={() => setDismissed(true)} data-testid="health-banner-dismiss"
        aria-label="Dismiss" className="shrink-0 opacity-70 transition-opacity duration-150 hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
