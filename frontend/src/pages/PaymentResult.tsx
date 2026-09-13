import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { PaymentStatus } from "@/lib/types";
import { money } from "@/lib/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/Shell";
import { cn } from "@/lib/utils";

// Where Stripe Checkout returns to. The browser is never trusted: we poll the backend,
// which re-reads the session from Stripe before it reports "paid".
export default function PaymentResult({ cancelled = false }: { cancelled?: boolean }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = params.get("session_id") ?? "";
  const [tries, setTries] = useState(0);

  const status = useQuery<PaymentStatus>({
    queryKey: ["payment-status", sessionId],
    queryFn: () => apiGet<PaymentStatus>(`/payments/status/${sessionId}`),
    enabled: !cancelled && Boolean(sessionId),
    refetchInterval: (q) => {
      const st = q.state.data?.payment_status;
      return st && ["paid", "failed", "expired", "cancelled", "refunded"].includes(st) ? false : 2000;
    },
    retry: false,
  });

  useEffect(() => {
    if (!status.data || ["paid", "failed", "expired", "cancelled"].includes(status.data.payment_status)) return;
    const id = setTimeout(() => setTries((t) => t + 1), 2000);
    return () => clearTimeout(id);
  }, [status.data, tries]);

  const state = status.data?.payment_status ?? "";
  const paid = state === "paid";
  // Stripe told us the attempt is over: a declined card or an abandoned session must never
  // leave the page spinning "confirming…" forever.
  const failed = state === "failed" || state === "cancelled";
  const expired = state === "expired";
  const pending = !cancelled && !paid && !failed && !expired && tries < 10;

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-canvas px-5 py-12">
      <div className="gl-grid absolute inset-0 opacity-25" />
      <div className="relative w-full max-w-lg gl-rise border border-hairline bg-surface p-8">
        <Logo />
        {cancelled && (
          <div className="mt-6" data-testid="payment-cancelled">
            <XCircle className="h-10 w-10 text-ink-3" />
            <h1 className="mt-4 font-heading text-3xl font-bold text-ink">Checkout cancelled</h1>
            <p className="mt-2 text-[15px] text-ink-3">Nothing was charged. You can pick a plan again any time.</p>
          </div>
        )}
        {!cancelled && paid && (
          <div className="mt-6" data-testid="payment-success">
            <CheckCircle2 className="h-10 w-10 text-emerald-400" />
            <h1 className="mt-4 font-heading text-3xl font-bold text-ink">Payment confirmed</h1>
            <p className="mt-2 text-[15px] text-ink-3">
              {money(status.data?.amount ?? 0)} received. Your plan is active — the new page allowance applies immediately.
            </p>
          </div>
        )}
        {!cancelled && (failed || expired) && (
          <div className="mt-6" data-testid={failed ? "payment-failed" : "payment-expired"}>
            <XCircle className="h-10 w-10 text-red-400" />
            <h1 className="mt-4 font-heading text-3xl font-bold text-ink">
              {failed ? "Payment did not go through" : "Checkout link expired"}
            </h1>
            <p className="mt-2 text-[15px] text-ink-3">
              {failed
                ? "Your card was declined or the payment was cancelled, so nothing was charged and your plan is unchanged. Try again with another card."
                : "This checkout session timed out before it was paid. Nothing was charged — start a fresh checkout from Billing."}
            </p>
            {sessionId && <p className="mt-3 break-all font-mono text-xs text-ink-4">{sessionId}</p>}
          </div>
        )}
        {!cancelled && !paid && !failed && !expired && (
          <div className="mt-6" data-testid="payment-pending">
            {pending ? <Loader2 className="h-10 w-10 animate-spin text-brand" /> : <XCircle className="h-10 w-10 text-amber-400" />}
            <h1 className="mt-4 font-heading text-3xl font-bold text-ink">
              {pending ? "Confirming with Stripe…" : "Still not confirmed"}
            </h1>
            <p className="mt-2 text-[15px] text-ink-3">
              {pending
                ? "This takes a couple of seconds. Do not close the page."
                : "Stripe has not reported this payment yet. Open Billing to check, or contact support with the session id."}
            </p>
            {sessionId && <p className="mt-3 break-all font-mono text-xs text-ink-4">{sessionId}</p>}
          </div>
        )}
        <div className="mt-8 flex gap-3">
          <Button size="lg" className="font-semibold" data-testid="payment-billing-button" onClick={() => navigate("/billing")}>
            Go to billing
          </Button>
          <a href="/dashboard" data-testid="payment-dashboard-link" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
            Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
