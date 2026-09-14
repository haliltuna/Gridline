import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send, CreditCard, FileText, Download, Sliders, Eye } from "lucide-react";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import type { Invoice, SendOut, TakeoffLine } from "@/lib/types";
import { money } from "@/lib/types";
import Shell, { Panel, StatusBadge } from "@/components/Shell";
import DocLineEditor, { type DocLinePatch } from "@/components/DocLineEditor";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Invoices() {
  const qc = useQueryClient();
  const invoices = useQuery<Invoice[]>({ queryKey: ["invoices"], queryFn: () => apiGet<Invoice[]>("/invoices"), retry: false });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["invoices"] });
    void qc.invalidateQueries({ queryKey: ["stats"] });
    void qc.invalidateQueries({ queryKey: ["profit"] });
  };
  const send = useMutation({
    mutationFn: (id: string) => apiPost<SendOut>(`/invoices/${id}/send`),
    onSuccess: (r) => { refresh(); toast.success(r.message); },
  });
  const pay = useMutation({
    mutationFn: (id: string) => apiPost<Invoice>(`/invoices/${id}/pay`),
    onSuccess: (inv) => { refresh(); toast.success(`${inv.number} marked paid`); },
  });

  // Retyping a product name or price on an invoice that is already out the door.
  const [openLines, setOpenLines] = useState<string | null>(null);
  // Inline PDF preview — see exactly what the client gets before hitting Email.
  const [previewId, setPreviewId] = useState<string | null>(null);
  const editLine = useMutation({
    mutationFn: ({ id, lineId, patch }: { id: string; lineId: string; patch: DocLinePatch }) =>
      apiPatch<Invoice>(`/invoices/${id}/lines/${lineId}`, patch),
    onSuccess: (inv) => { refresh(); toast.success(`${inv.number} re-totalled — ${money(inv.total)}`); },
    onError: () => toast.error("Could not change that invoice line"),
  });

  const rows = invoices.data ?? [];
  const unpaid = rows.filter((r) => r.status !== "paid").reduce((a, b) => a + b.total, 0);

  return (
    <Shell
      title="Invoices"
      subtitle="Accepted quotes become invoices. Paid invoices feed the profit summary."
      action={
        <a
          href="/api/export/invoices.csv"
          data-testid="invoices-export-csv-link"
          className={cn(buttonVariants({ variant: "outline" }), "font-semibold")}
        >
          <Download className="h-4 w-4" /> Export CSV
        </a>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Panel><div className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand">Invoices</div><div className="mt-2 font-mono text-3xl font-semibold text-ink" data-testid="invoices-count">{rows.length}</div></Panel>
        <Panel><div className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand">Outstanding</div><div className="mt-2 font-mono text-3xl font-semibold text-ink" data-testid="invoices-outstanding">{money(unpaid)}</div></Panel>
        <Panel><div className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand">Collected</div><div className="mt-2 font-mono text-3xl font-semibold text-ink" data-testid="invoices-collected">{money(rows.filter((r) => r.status === "paid").reduce((a, b) => a + b.total, 0))}</div></Panel>
      </div>

      {rows.length === 0 && (
        <Panel className="mt-8 text-center">
          <FileText className="mx-auto h-8 w-8 text-ink-4" />
          <p className="mt-3 text-ink-2" data-testid="invoices-empty">No invoices yet. Accept a quote on a job to create one.</p>
        </Panel>
      )}

      <div className="mt-8 space-y-4" data-testid="invoice-list">
        {rows.map((inv) => (
          <div key={inv.id} data-testid={`invoice-row-${inv.id}`} className="flex flex-wrap items-center justify-between gap-5 border border-hairline/80 bg-surface p-5 transition-colors hover:border-hairline">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <span className="font-mono text-lg text-ink" data-testid={`invoice-number-${inv.id}`}>{inv.number}</span>
                <StatusBadge status={inv.status} testId={`invoice-status-${inv.id}`} />
              </div>
              <p className="mt-1 text-[15px] text-ink-3">{inv.job_name} · {inv.client_name || "No client"} · {inv.client_email || "no email"}</p>
            </div>
            <div className="text-right font-mono">
              <div className="text-[11px] uppercase tracking-[0.18em] text-ink-3">{inv.tax_label} {money(inv.tax_amount)}</div>
              <div className="text-2xl font-semibold text-ink" data-testid={`invoice-total-${inv.id}`}>{money(inv.total)}</div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" data-testid={`invoice-send-${inv.id}`} onClick={() => send.mutate(inv.id)}>
                <Send className="h-4 w-4" /> Email
              </Button>
              {inv.status !== "paid" && (
                <Button className="font-semibold" data-testid={`invoice-pay-${inv.id}`} onClick={() => pay.mutate(inv.id)}>
                  <CreditCard className="h-4 w-4" /> Pay now
                </Button>
              )}
              <Button variant="ghost" data-testid={`invoice-edit-lines-${inv.id}`}
                      onClick={() => setOpenLines(openLines === inv.id ? null : inv.id)}>
                <Sliders className="h-4 w-4" /> {openLines === inv.id ? "Close lines" : "Edit lines"}
              </Button>
              <Button variant="ghost" data-testid={`invoice-preview-${inv.id}`}
                      onClick={() => setPreviewId(previewId === inv.id ? null : inv.id)}>
                <Eye className="h-4 w-4" /> {previewId === inv.id ? "Hide PDF" : "Preview PDF"}
              </Button>
            </div>
            {previewId === inv.id && (
              <div className="w-full" data-testid={`invoice-preview-panel-${inv.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-3 border border-hairline bg-surface-2 px-4 py-3">
                  <p className="text-[15px] text-ink-3">
                    This is exactly what the client receives. Edit the lines above and the preview
                    re-renders before you email it.
                  </p>
                  <a href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer"
                     data-testid={`invoice-pdf-download-${inv.id}`}
                     className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}>
                    <Download className="h-3.5 w-3.5" /> Open / download
                  </a>
                </div>
                <iframe
                  key={`${inv.id}-${inv.total}-${inv.lines.length}`}
                  title={`${inv.number} preview`}
                  data-testid={`invoice-pdf-frame-${inv.id}`}
                  src={`/api/invoices/${inv.id}/pdf#toolbar=0&view=FitH`}
                  className="h-[620px] w-full border border-t-0 border-hairline bg-white"
                />
              </div>
            )}
            {openLines === inv.id && (
              <div className="w-full">
                <DocLineEditor
                  testId={`invoice-lines-${inv.id}`}
                  lines={inv.lines as unknown as TakeoffLine[]}
                  pending={editLine.isPending}
                  readOnly={inv.status === "paid"}
                  readOnlyNote="This invoice is paid — raise a change order on the job instead of editing it."
                  onSave={(lineId, patch) => editLine.mutate({ id: inv.id, lineId, patch })}
                />
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-6 font-mono text-xs text-ink-4">Stripe checkout and client email delivery are MOCKED in this build.</p>
    </Shell>
  );
}
