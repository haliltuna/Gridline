import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CreditCard, Lock, CheckCircle2 } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import type { PublicInvoice } from "@/lib/types";
import { money } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Shell";

// The page a CLIENT lands on from the emailed Pay Now button. No login: the opaque
// pay token in the URL is the credential. Stripe is DUMMY here.
export default function Pay() {
  const { payToken = "" } = useParams();
  const qc = useQueryClient();
  const [card, setCard] = useState("4242 4242 4242 4242");
  const [nameOnCard, setNameOnCard] = useState("");

  const inv = useQuery<PublicInvoice>({
    queryKey: ["pay", payToken],
    queryFn: () => apiGet<PublicInvoice>(`/pay/${payToken}`),
    retry: false,
  });

  const pay = useMutation({
    mutationFn: () => apiPost<PublicInvoice>(`/pay/${payToken}`, {
      card_number: card.replace(/\s+/g, ""), name_on_card: nameOnCard,
    }),
    onSuccess: (d) => {
      qc.setQueryData(["pay", payToken], d);
      toast.success("Payment received — thank you");
    },
    onError: () => toast.error("Could not take that payment"),
  });

  const d = inv.data;
  const paid = d?.status === "paid";

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-[#090D12] px-5 py-12">
      <div className="gl-grid absolute inset-0 opacity-25" />
      <div className="relative w-full max-w-lg gl-rise">
        <div className="mb-6 flex items-center justify-between">
          <Logo />
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-slate-500">
            <Lock className="h-3.5 w-3.5" /> Secure payment
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
                    A receipt has been recorded against {d.number}. You can close this page.
                  </p>
                </div>
              </div>
            ) : (
              <form className="space-y-4 px-7 pb-7" data-testid="pay-form"
                    onSubmit={(e) => { e.preventDefault(); pay.mutate(); }}>
                <div className="space-y-2">
                  <Label htmlFor="pay-name" className="text-slate-300">Name on card</Label>
                  <Input id="pay-name" data-testid="pay-name-input" value={nameOnCard} required
                         onChange={(e) => setNameOnCard(e.target.value)} placeholder="Full name" className="h-12 text-base" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pay-card" className="text-slate-300">Card number</Label>
                  <Input id="pay-card" data-testid="pay-card-input" value={card}
                         onChange={(e) => setCard(e.target.value)} className="h-12 font-mono text-base" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pay-exp" className="text-slate-300">Expiry</Label>
                    <Input id="pay-exp" data-testid="pay-expiry-input" defaultValue="12/34" className="h-12 font-mono text-base" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pay-cvc" className="text-slate-300">CVC</Label>
                    <Input id="pay-cvc" data-testid="pay-cvc-input" defaultValue="123" className="h-12 font-mono text-base" />
                  </div>
                </div>
                <Button type="submit" size="lg" className="w-full font-semibold" data-testid="pay-submit-button" disabled={pay.isPending}>
                  <CreditCard className="h-4 w-4" /> {pay.isPending ? "Processing…" : `Pay ${money(d.total)}`}
                </Button>
                <p className="text-center font-mono text-[11px] text-slate-600">
                  DEMO CHECKOUT — no card is charged and no card details are stored.
                </p>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
