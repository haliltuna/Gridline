import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save, Wand2, ImagePlus, Trash2 } from "lucide-react";
import { apiDelete, apiGet, apiPut } from "@/lib/api";
import type { Settings as SettingsT, TaxDetect, TaxRegions } from "@/lib/types";
import { FLOOR_TYPES } from "@/lib/types";
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
      const {
        country, region, tax_label, tax_rate, currency, labor_rate, company_name, company_email,
        acc_transition_price, acc_nosing_price, acc_cove_base_price,
        business_number, tax_number, waste_overrides,
      } = form;
      return apiPut<SettingsT>("/settings", {
        country, region, tax_label, tax_rate, currency, labor_rate, company_name, company_email,
        acc_transition_price, acc_nosing_price, acc_cove_base_price,
        business_number, tax_number, waste_overrides,
      });
    },
    onSuccess: (d) => { qc.setQueryData(["settings"], d); toast.success("Settings saved"); },
    onError: () => toast.error("Could not save settings"),
  });

  const uploadLogo = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/settings/logo", { method: "POST", body, credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? "Upload failed");
      return (await res.json()) as SettingsT;
    },
    onSuccess: (d) => { qc.setQueryData(["settings"], d); setForm(d); toast.success("Logo saved — it now prints on quotes and invoices"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeLogo = useMutation({
    mutationFn: () => apiDelete<SettingsT>("/settings/logo"),
    onSuccess: (d) => { qc.setQueryData(["settings"], d); setForm(d); toast.success("Logo removed"); },
    onError: () => toast.error("Could not remove the logo"),
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

        <Panel testId="branding-panel">
          <h2 className="font-heading text-lg font-semibold text-ink">Branding &amp; registration</h2>
          <p className="mt-2 text-[15px] text-ink-2">
            Your logo and numbers print on the header of every quote and invoice PDF, and in the
            email that carries them.
          </p>
          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="grid h-20 w-40 place-items-center border border-hairline bg-surface-2 p-2">
                {form?.logo_data ? (
                  <img src={form.logo_data} alt="Company logo" data-testid="settings-logo-preview"
                       className="max-h-16 max-w-[140px] object-contain" />
                ) : (
                  <span className="font-mono text-[11px] uppercase tracking-widest text-ink-4"
                        data-testid="settings-logo-empty">no logo</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 border border-hairline px-4 py-2.5 font-semibold text-ink transition-colors hover:border-brand/60 hover:text-brand"
                       data-testid="settings-logo-upload-label">
                  <ImagePlus className="h-4 w-4" /> {uploadLogo.isPending ? "Uploading…" : "Upload logo"}
                  <input
                    type="file" accept="image/png,image/jpeg" className="hidden"
                    data-testid="settings-logo-input"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo.mutate(f); e.target.value = ""; }}
                  />
                </label>
                {form?.logo_data && (
                  <Button variant="ghost" size="sm" data-testid="settings-logo-remove-button"
                          onClick={() => removeLogo.mutate()}>
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </Button>
                )}
                <span className="font-mono text-[11px] text-ink-4">PNG or JPEG, up to 1.5 MB</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bnum" className="text-ink-2">Business / licence number</Label>
              <Input id="bnum" data-testid="settings-business-number-input" placeholder="TX-FL-884210"
                     value={form?.business_number ?? ""} onChange={(e) => set({ business_number: e.target.value })}
                     className="h-12 text-base" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tnum" className="text-ink-2">Tax number (GST / HST / VAT / EIN)</Label>
              <Input id="tnum" data-testid="settings-tax-number-input" placeholder="87-1234567"
                     value={form?.tax_number ?? ""} onChange={(e) => set({ tax_number: e.target.value })}
                     className="h-12 text-base" />
            </div>
          </div>
        </Panel>

        <Panel testId="waste-defaults">
          <h2 className="font-heading text-lg font-semibold text-ink">Waste factor defaults</h2>
          <p className="mt-2 text-[15px] text-ink-2">
            Your own overage % per floor type. Leave a field blank to keep the industry default —
            a waste figure printed on the drawings always wins.
          </p>
          <div className="mt-5 grid max-h-[300px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {FLOOR_TYPES.map((ft) => (
              <div key={ft} className="flex items-center justify-between gap-3 border border-hairline/70 bg-surface-2 px-3 py-2">
                <span className="text-sm text-ink-2">{ft}</span>
                <Input
                  data-testid={`settings-waste-${ft.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-input`}
                  inputMode="decimal" placeholder="default"
                  value={form?.waste_overrides?.[ft] ?? ""}
                  onChange={(e) => {
                    const next = { ...(form?.waste_overrides ?? {}) };
                    if (e.target.value === "") delete next[ft];
                    else next[ft] = Number(e.target.value);
                    set({ waste_overrides: next });
                  }}
                  className="h-10 w-[92px] text-right font-mono text-base"
                />
              </div>
            ))}
          </div>
        </Panel>

        <Panel testId="accessory-catalogue">
          <h2 className="font-heading text-lg font-semibold text-ink">Accessory catalogue</h2>
          <p className="mt-2 text-[15px] text-ink-2">
            Your own unit prices for the trim work the AI counts off the drawings — door openings,
            stair treads and wall base. Every new takeoff is priced from these.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {([
              ["acc_transition_price", "Transition strip / door", "18.00", "settings-acc-transition-input"],
              ["acc_nosing_price", "Stair nosing / step", "42.00", "settings-acc-nosing-input"],
              ["acc_cove_base_price", "Cove base / linear ft", "3.40", "settings-acc-cove-input"],
            ] as const).map(([key, label, ph, testId]) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={key} className="text-ink-2">{label}</Label>
                <Input
                  id={key} type="number" step="0.05" placeholder={ph} data-testid={testId}
                  value={form?.[key] ?? 0}
                  onChange={(e) => set({ [key]: parseFloat(e.target.value) || 0 } as Partial<SettingsT>)}
                  className="h-12 font-mono text-base"
                />
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-ink-3">
            Existing lines keep the price they were quoted at — change one on the takeoff to reprice it.
          </p>
        </Panel>
      </div>

      <Button size="lg" className="mt-8 font-semibold" data-testid="settings-save-button" onClick={() => save.mutate()} disabled={!form || save.isPending}>
        <Save className="h-4 w-4" /> {save.isPending ? "Saving…" : "Save settings"}
      </Button>
    </Shell>
  );
}
