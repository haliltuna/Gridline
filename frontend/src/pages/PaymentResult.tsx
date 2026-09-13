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
    refetchInterval: (q) => (q.state.data?.payment_status === "paid" ? false : 2000),
    retry: false,
  });

  useEffect(() => {
    if (!status.data || status.data.payment_status === "paid") return;
    const id = setTimeout(() => setTries((t) => t + 1), 2000);
    return () => clearTimeout(id);
  }, [status.data, tries]);

  const paid = status.data?.payment_status === "paid";
  const pending = !cancelled && !paid && tries < 10;

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-[#090D12] px-5 py-12">
      <div className="gl-grid absolute inset-0 opacity-25" />
      <div className="relative w-full max-w-lg gl-rise border border-slate-800 bg-[#0F1722] p-8">
        <Logo />
        {cancelled && (
          <div className="mt-6" data-testid="payment-cancelled">
            <XCircle className="h-10 w-10 text-slate-500" />
            <h1 className="mt-4 font-heading text-3xl font-bold text-slate-100">Checkout cancelled</h1>
            <p className="mt-2 text-[15px] text-slate-400">Nothing was charged. You can pick a plan again any time.</p>
          </div>
        )}
        {!cancelled && paid && (
          <div className="mt-6" data-testid="payment-success">
            <CheckCircle2 className="h-10 w-10 text-emerald-400" />
            <h1 className="mt-4 font-heading text-3xl font-bold text-slate-100">Payment confirmed</h1>
            <p className="mt-2 text-[15px] text-slate-400">
              {money(status.data?.amount ?? 0)} received. Your plan is active — the new page allowance applies immediately.
            </p>
          </div>
        )}
        {!cancelled && !paid && (
          <div className="mt-6" data-testid="payment-pending">
            {pending ? <Loader2 className="h-10 w-10 animate-spin text-[#E2F952]" /> : <XCircle className="h-10 w-10 text-amber-400" />}
            <h1 className="mt-4 font-heading text-3xl font-bold text-slate-100">
              {pending ? "Confirming with Stripe…" : "Still not confirmed"}
            </h1>
            <p className="mt-2 text-[15px] text-slate-400">
              {pending
                ? "This takes a couple of seconds. Do not close the page."
                : "Stripe has not reported this payment yet. Open Billing to check, or contact support with the session id."}
            </p>
            {sessionId && <p className="mt-3 break-all font-mono text-xs text-slate-600">{sessionId}</p>}
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
