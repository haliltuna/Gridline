import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Library, Search, Loader2 } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import type { Product, TakeoffLine } from "@/lib/types";
import { money } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

// Pick a product from the account's library and drop it (with its cost per sq ft and
// approved alternative) onto one takeoff line.
export default function ProductLibraryDialog({ line, onApplied }: { line: TakeoffLine; onApplied: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const products = useQuery<Product[]>({
    queryKey: ["products", q],
    queryFn: () => apiGet<Product[]>(`/products${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    enabled: open,
  });

  const apply = useMutation({
    mutationFn: (productId: string) => apiPost<TakeoffLine>(`/products/${productId}/apply/${line.id}`),
    onSuccess: (l) => {
      void qc.invalidateQueries({ queryKey: ["products"] });
      onApplied();
      setOpen(false);
      toast.success(`${l.product} applied to ${l.room}`);
    },
    onError: () => toast.error("Could not apply that product"),
  });

  const rows = products.data ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        data-testid={`line-library-${line.id}`}
        title="Pick from your product library"
        className="mt-1 inline-flex items-center gap-1 border border-hairline px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-3 transition-colors hover:border-brand/50 hover:text-brand"
      >
        <Library className="h-3 w-3" /> library
      </DialogTrigger>
      <DialogContent className="max-w-xl" data-testid="product-library-dialog">
        <DialogHeader>
          <DialogTitle>Product library</DialogTitle>
          <DialogDescription>
            Applying a product sets the name, the approved alternative and your own cost per sq ft on
            <span className="text-ink"> {line.room}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 border border-hairline bg-surface-2 px-3">
          <Search className="h-4 w-4 text-ink-3" />
          <Input
            data-testid="product-library-search-input" placeholder="Search brand or product"
            value={q} onChange={(e) => setQ(e.target.value)}
            className="h-11 border-0 bg-transparent text-base focus-visible:ring-0"
          />
        </div>

        <div className="max-h-[320px] divide-y divide-hairline/60 overflow-y-auto">
          {rows.length === 0 && (
            <p className="py-4 text-[15px] text-ink-3" data-testid="product-library-empty">
              {products.isLoading ? "Loading…" : "No product matches. Add one on the Products page."}
            </p>
          )}
          {rows.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3"
                 data-testid={`product-library-row-${p.id}`}>
              <div className="min-w-0">
                <div className="truncate text-[15px] text-ink">{p.name}</div>
                <div className="mt-0.5 font-mono text-[11px] text-ink-3">
                  {p.floor_type || "any floor type"} · {money(p.cost_per_sqft)}/sf · used {p.times_used}×
                </div>
              </div>
              <Button size="sm" data-testid={`product-library-apply-${p.id}`}
                      disabled={apply.isPending} onClick={() => apply.mutate(p.id)}>
                {apply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
