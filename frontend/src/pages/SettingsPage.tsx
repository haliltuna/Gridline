import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save, Wand2 } from "lucide-react";
import { apiGet, apiPut } from "@/lib/api";
import type { Settings as SettingsT, TaxDetect, TaxRegions } from "@/lib/types";
import Shell, { Panel } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function SettingsPage() {
  const qc = useQueryClient();
  const settings = useQuery<SettingsT>({ queryKey: ["settings"], queryFn: () => apiGet<SettingsT>("/settings"), retry: false });
  const regions = useQuery<TaxRegions>({ queryKey: ["tax-regions"], queryFn: () => apiGet<TaxRegions>("/tax/regions"), retry: false });

  const [form, setForm] = useState<SettingsT | null>(null);
  useEffect(() => { if (settings.data && !form) setForm(settings.data); }, [settings.data, form]);

  const set = (patch: Partial<SettingsT>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const detect = useMutation({
    mutationFn: (p: { country: string; region: string }) =>
      apiGet<TaxDetect>(`/tax/detect?country=${encodeURIComponent(p.country)}&region=${encodeURIComponent(p.region)}`),
    onSuccess: (d) => { set({ tax_label: d.tax_label, tax_rate: d.tax_rate }); toast.success(`Detected ${d.tax_label} at ${d.tax_rate}%`); },
    onError: () => toast.error("Could not auto-detect tax"),
  });

  const save = useMutation({
    mutationFn: () => {
      if (!form) throw new Error("not loaded");
      const { country, region, tax_label, tax_rate, currency, labor_rate, company_name, company_email } = form;
      return apiPut<SettingsT>("/settings", { country, region, tax_label, tax_rate, currency, labor_rate, company_name, company_email });
    },
    onSuccess: (d) => { qc.setQueryData(["settings"], d); toast.success("Settings saved"); },
    onError: () => toast.error("Could not save settings"),
  });

  const countries = Object.keys(regions.data ?? {});
  const availableRegions = form && regions.data?.[form.country]?.regions ? regions.data[form.country].regions : [];

  return (
    <Shell title="Settings" subtitle="Tax is auto-detected from your country and state or province, and stays editable.">
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <h2 className="font-heading text-lg font-semibold text-ink">Tax</h2>
          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label className="text-ink-2">Country</Label>
              <Select
                value={form?.country ?? "United States"}
                onValueChange={(v: string) => { set({ country: v, region: "" }); detect.mutate({ country: v, region: "" }); }}
              >
                <SelectTrigger className="h-12 text-base" data-testid="settings-country-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(countries.length ? countries : ["United States", "Canada"]).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {availableRegions.length > 0 && (
              <div className="space-y-2">
                <Label className="text-ink-2">State / Province</Label>
                <Select
                  value={form?.region || availableRegions[0]}
                  onValueChange={(v: string) => { set({ region: v }); detect.mutate({ country: form?.country ?? "United States", region: v }); }}
                >
                  <SelectTrigger className="h-12 text-base" data-testid="settings-region-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {availableRegions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="taxlabel" className="text-ink-2">Tax label</Label>
                <Input id="taxlabel" data-testid="settings-tax-label-input" value={form?.tax_label ?? ""} onChange={(e) => set({ tax_label: e.target.value })} className="h-12 text-base" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="taxrate" className="text-ink-2">Tax rate %</Label>
                <Input id="taxrate" type="number" step="0.005" data-testid="settings-tax-rate-input" value={form?.tax_rate ?? 0} onChange={(e) => set({ tax_rate: parseFloat(e.target.value) || 0 })} className="h-12 font-mono text-base" />
              </div>
            </div>

            <Button
              variant="outline"
              data-testid="settings-detect-button"
              onClick={() => detect.mutate({ country: form?.country ?? "United States", region: form?.region ?? "" })}
            >
              <Wand2 className="h-4 w-4" /> Auto-detect tax
            </Button>
          </div>
        </Panel>

        <Panel>
          <h2 className="font-heading text-lg font-semibold text-ink">Company & labor</h2>
          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cname" className="text-ink-2">Company name</Label>
              <Input id="cname" data-testid="settings-company-input" value={form?.company_name ?? ""} onChange={(e) => set({ company_name: e.target.value })} className="h-12 text-base" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cemail" className="text-ink-2">Billing email</Label>
              <Input id="cemail" type="email" data-testid="settings-company-email-input" value={form?.company_email ?? ""} onChange={(e) => set({ company_email: e.target.value })} className="h-12 text-base" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="labor" className="text-ink-2">Labor rate / hr</Label>
                <Input id="labor" type="number" step="0.5" data-testid="settings-labor-rate-input" value={form?.labor_rate ?? 0} onChange={(e) => set({ labor_rate: parseFloat(e.target.value) || 0 })} className="h-12 font-mono text-base" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cur" className="text-ink-2">Currency</Label>
                <Input id="cur" data-testid="settings-currency-input" value={form?.currency ?? "USD"} onChange={(e) => set({ currency: e.target.value })} className="h-12 text-base" />
              </div>
            </div>
            <p className="text-sm text-ink-3">New takeoff lines use this labor rate. Existing lines keep the rate they were priced at.</p>
          </div>
        </Panel>
      </div>

      <Button size="lg" className="mt-8 font-semibold" data-testid="settings-save-button" onClick={() => save.mutate()} disabled={!form || save.isPending}>
        <Save className="h-4 w-4" /> {save.isPending ? "Saving…" : "Save settings"}
      </Button>
    </Shell>
  );
}
