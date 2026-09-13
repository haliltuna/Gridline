import { useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CreditCard, Lock, CheckCircle2, Loader2 } from "lucide-react";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import type { CheckoutSession, PaymentStatus, PublicInvoice } from "@/lib/types";
import { money } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Shell";

// The page a CLIENT lands on from the emailed Pay Now button. No login: the opaque pay
// token in the URL is the credential. Payment itself happens on Stripe Checkout — we never
// see a card number. On return, the session id is polled until Stripe confirms.
export default function Pay() {
  const { payToken = "" } = useParams();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const sessionId = params.get("session_id") ?? "";
  const cancelled = params.get("cancelled") === "1";

  const inv = useQuery<PublicInvoice>({
    queryKey: ["pay", payToken],
    queryFn: () => apiGet<PublicInvoice>(`/pay/${payToken}`),
    retry: false,
  });

  const status = useQuery<PaymentStatus>({
    queryKey: ["payment-status", sessionId],
    queryFn: () => apiGet<PaymentStatus>(`/payments/status/${sessionId}`),
    enabled: Boolean(sessionId),
    refetchInterval: (q) => (q.state.data?.payment_status === "paid" ? false : 2000),
    retry: false,
  });

  useEffect(() => {
    if (status.data?.payment_status === "paid") {
      void qc.invalidateQueries({ queryKey: ["pay", payToken] });
    }
  }, [status.data?.payment_status, qc, payToken]);

  const checkout = useMutation({
    mutationFn: () => apiPost<CheckoutSession>(`/pay/${payToken}/checkout`),
    onSuccess: (s) => { window.location.href = s.checkout_url; },
    onError: (e) => {
      const detail = e instanceof ApiError ? (e.body as { detail?: string })?.detail : null;
      toast.error(detail ?? "Could not open the secure checkout");
    },
  });

  const d = inv.data;
  const paid = d?.status === "paid";
  const confirming = Boolean(sessionId) && !paid && status.data?.payment_status !== "paid";

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-[#090D12] px-5 py-12">
      <div className="gl-grid absolute inset-0 opacity-25" />
      <div className="relative w-full max-w-lg gl-rise">
        <div className="mb-6 flex items-center justify-between">
          <Logo />
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-slate-500">
            <Lock className="h-3.5 w-3.5" /> Stripe secure checkout
          </span>
        </div>

        {inv.isLoading && (
          <div className="border border-slate-800 bg-[#0F1722] p-8 text-slate-300" data-testid="pay-loading">
            Loading your invoice…
          </div>
        )}

        {inv.isError && (
          <div className="border border-red-500/40 bg-red-500/10 p-8" data-testid="pay-invalid">
            <p className="text-lg text-red-200">This payment link is not valid.</p>
            <p className="mt-2 text-sm text-red-300/80">Ask your contractor to resend the invoice.</p>
          </div>
        )}

        {d && (
          <div className="border border-slate-800 bg-[#0F1722]">
            <div className="border-b border-slate-800 px-7 py-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#E2F952]">
                Invoice from {d.company_name}
              </p>
              <h1 className="mt-2 font-heading text-3xl font-bold text-slate-100" data-testid="pay-number">
                {d.number}
              </h1>
              <p className="mt-1 text-[15px] text-slate-400">{d.job_name}</p>
            </div>

            <dl className="space-y-3 px-7 py-6 font-mono text-base">
              <div className="flex justify-between text-slate-300"><dt>Subtotal</dt><dd>{money(d.subtotal)}</dd></div>
              {d.discount_amount > 0 && (
                <div className="flex justify-between text-slate-400"><dt>Discount</dt><dd>−{money(d.discount_amount)}</dd></div>
              )}
              <div className="flex justify-between text-slate-400"><dt>{d.tax_label}</dt><dd>{money(d.tax_amount)}</dd></div>
              <div className="flex justify-between border-t border-slate-800 pt-4 text-2xl font-semibold text-white">
                <dt>Amount due</dt><dd data-testid="pay-total">{money(d.total)}</dd>
              </div>
            </dl>

            {paid ? (
              <div className="mx-7 mb-7 flex items-start gap-3 border border-emerald-500/40 bg-emerald-500/10 p-5" data-testid="pay-success">
                <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-400" />
                <div>
                  <p className="text-lg font-semibold text-emerald-200">Paid in full</p>
                  <p className="mt-1 text-sm text-emerald-300/80">
                    Stripe has confirmed the payment against {d.number}. You can close this page.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 px-7 pb-7" data-testid="pay-form">
                {cancelled && (
                  <p className="border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200" data-testid="pay-cancelled">
                    Checkout was cancelled — nothing has been charged.
                  </p>
                )}
                {confirming && (
                  <p className="flex items-center gap-2 border border-slate-700 bg-[#131D2A] px-4 py-3 text-sm text-slate-300" data-testid="pay-confirming">
                    <Loader2 className="h-4 w-4 animate-spin text-[#E2F952]" /> Confirming your payment with Stripe…
                  </p>
                )}
                <Button size="lg" className="w-full font-semibold" data-testid="pay-submit-button"
                        disabled={checkout.isPending} onClick={() => checkout.mutate()}>
                  <CreditCard className="h-4 w-4" />
                  {checkout.isPending ? "Opening secure checkout…" : `Pay ${money(d.total)} by card`}
                </Button>
                <p className="text-center font-mono text-[11px] text-slate-600">
                  Card details are entered on Stripe, never on this page. TEST MODE — use 4242 4242 4242 4242.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
