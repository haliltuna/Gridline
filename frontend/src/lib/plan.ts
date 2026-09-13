import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { Usage } from "@/lib/types";

/** Plan capabilities, read from the server so the UI hides exactly what the API blocks. */
export function usePlanCaps() {
  const usage = useQuery<Usage>({
    queryKey: ["usage"],
    queryFn: () => apiGet<Usage>("/billing/usage"),
    retry: false,
  });
  const caps = usage.data?.capabilities ?? [];
  return {
    usage: usage.data,
    loading: usage.isLoading,
    planName: usage.data?.plan_name ?? "",
    // While usage is loading we assume allowed, so buttons don't flicker for paid accounts.
    can: (cap: string) => (usage.data ? caps.includes(cap) : true),
  };
}

export const CAP = {
  takeoff: "takeoff",
  edit: "edit_lines",
  pdf: "pdf",
  quote: "quote",
  invoice: "invoice",
  changeOrder: "change_order",
  costing: "costing",
  export: "export",
  templates: "templates",
  spec: "spec_sheet",
} as const;
