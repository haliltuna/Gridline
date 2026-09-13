import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Plus, Trash2, TrendingUp } from "lucide-react";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import type { Expense, ProfitSummary } from "@/lib/types";
import { money } from "@/lib/types";
import Shell, { Panel } from "@/components/Shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CATEGORIES = ["Materials", "Adhesive", "Subcontract Labor", "Equipment", "Fuel", "Permits", "Other"];

export default function Expenses() {
  const qc = useQueryClient();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState("Materials");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");

  const expenses = useQuery<Expense[]>({ queryKey: ["expenses"], queryFn: () => apiGet<Expense[]>("/expenses"), retry: false });
  const profit = useQuery<ProfitSummary>({ queryKey: ["profit"], queryFn: () => apiGet<ProfitSummary>("/profit/summary"), retry: false });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["expenses"] });
    void qc.invalidateQueries({ queryKey: ["profit"] });
  };
  const add = useMutation({
    mutationFn: () => apiPost<Expense>("/expenses", { date, category, vendor, amount: parseFloat(amount) || 0 }),
    onSuccess: () => { refresh(); setVendor(""); setAmount(""); toast.success("Expense logged"); },
    onError: () => toast.error("Could not log that expense"),
  });
  const del = useMutation({
    mutationFn: (id: string) => apiDelete(`/expenses/${id}`),
    onSuccess: () => { refresh(); toast.success("Expense removed"); },
  });

  const p = profit.data;

  return (
    <Shell
      title="Expenses & profit"
      subtitle="Log what you spend. Paid invoices minus expenses, by month."
      action={
        <div className="flex flex-wrap gap-2">
          <a
            href="/api/export/expenses.csv"
            data-testid="export-expenses-csv-link"
            className={cn(buttonVariants({ variant: "outline" }), "font-semibold")}
          >
            <Download className="h-4 w-4" /> Expenses CSV
          </a>
          <a
            href="/api/export/invoices.csv"
            data-testid="export-invoices-csv-link"
            className={cn(buttonVariants({ variant: "outline" }), "font-semibold")}
          >
            <Download className="h-4 w-4" /> Invoices CSV (QuickBooks)
          </a>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Panel><div className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand">Revenue (paid)</div><div className="mt-2 font-mono text-3xl font-semibold text-ink" data-testid="profit-revenue">{p ? money(p.total_revenue) : "—"}</div></Panel>
        <Panel><div className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand">Expenses</div><div className="mt-2 font-mono text-3xl font-semibold text-ink" data-testid="profit-expenses">{p ? money(p.total_expenses) : "—"}</div></Panel>
        <Panel><div className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand">Net profit</div><div className="mt-2 font-mono text-3xl font-semibold text-brand" data-testid="profit-net">{p ? money(p.total_profit) : "—"}</div></Panel>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[380px_1fr]">
        <Panel className="h-fit">
          <h2 className="font-heading text-lg font-semibold text-ink">Log an expense</h2>
          <form className="mt-5 space-y-4" data-testid="expense-form" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
            <div className="space-y-2">
              <Label htmlFor="exp-date" className="text-ink-2">Date</Label>
              <Input id="exp-date" type="date" data-testid="expense-date-input" value={date} onChange={(e) => setDate(e.target.value)} className="h-12 text-base" />
            </div>
            <div className="space-y-2">
              <Label className="text-ink-2">Category</Label>
              <Select value={category} onValueChange={(v: string) => setCategory(v)}>
                <SelectTrigger className="h-12 text-base" data-testid="expense-category-select"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="exp-vendor" className="text-ink-2">Vendor</Label>
              <Input id="exp-vendor" data-testid="expense-vendor-input" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Shaw Contract" className="h-12 text-base" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exp-amount" className="text-ink-2">Amount</Label>
              <Input id="exp-amount" type="number" step="0.01" data-testid="expense-amount-input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required className="h-12 text-base font-mono" />
            </div>
            <Button type="submit" size="lg" className="w-full font-semibold" data-testid="expense-submit-button" disabled={add.isPending}>
              <Plus className="h-4 w-4" /> Log expense
            </Button>
          </form>
        </Panel>

        <div className="space-y-6">
          <Panel>
            <h2 className="flex items-center gap-2 font-heading text-lg font-semibold text-ink">
              <TrendingUp className="h-5 w-5 text-brand" /> Monthly profit summary
            </h2>
            {(p?.months.length ?? 0) === 0 && <p className="mt-3 text-ink-3" data-testid="profit-empty">Nothing to summarise yet.</p>}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left" data-testid="profit-table">
                <thead>
                  <tr className="border-b border-hairline font-mono text-[11px] uppercase tracking-wider text-ink-3">
                    <th className="py-3">Month</th><th className="py-3 text-right">Revenue</th>
                    <th className="py-3 text-right">Expenses</th><th className="py-3 text-right">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {(p?.months ?? []).map((m) => (
                    <tr key={m.month} className="border-b border-hairline/60 font-mono" data-testid={`profit-row-${m.month}`}>
                      <td className="py-3 text-base text-ink-2">{m.month}</td>
                      <td className="py-3 text-right text-base text-ink-2">{money(m.revenue)}</td>
                      <td className="py-3 text-right text-base text-ink-2">{money(m.expenses)}</td>
                      <td className={`py-3 text-right text-base font-semibold ${m.profit >= 0 ? "text-brand" : "text-red-400"}`}>{money(m.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel>
            <h2 className="font-heading text-lg font-semibold text-ink">Expense log</h2>
            {(expenses.data ?? []).length === 0 && <p className="mt-3 text-ink-3" data-testid="expenses-empty">No expenses logged yet.</p>}
            <div className="mt-4 space-y-2" data-testid="expense-list">
              {(expenses.data ?? []).map((e) => (
                <div key={e.id} data-testid={`expense-row-${e.id}`} className="flex items-center justify-between gap-4 border border-hairline bg-surface-2 px-4 py-3">
                  <div>
                    <div className="text-base text-ink">{e.category}{e.vendor ? ` · ${e.vendor}` : ""}</div>
                    <div className="font-mono text-xs text-ink-3">{e.date}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-lg font-semibold text-ink" data-testid={`expense-amount-${e.id}`}>{money(e.amount)}</span>
                    <Button variant="ghost" size="icon-sm" data-testid={`expense-delete-${e.id}`} onClick={() => del.mutate(e.id)}>
                      <Trash2 className="h-4 w-4 text-ink-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </Shell>
  );
}
