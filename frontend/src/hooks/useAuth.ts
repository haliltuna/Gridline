import { useQuery } from "@tanstack/react-query";
import { apiGet, ApiError } from "@/lib/api";
import type { User } from "@/lib/types";

// Three-state auth, deliberately: "signed in", "definitely signed out" (a real 401), and
// "we don't know yet" (loading, or the request failed for a reason that is NOT 401).
// Collapsing the third case into "signed out" is what bounces a freshly-logged-in user
// back to /login and makes the sign-in page look stuck.
export function useAuth() {
  const q = useQuery<User | null>({
    queryKey: ["me"],
    retry: 1,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      try {
        return await apiGet<User>("/auth/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null; // genuinely signed out
        throw e; // network/5xx — let react-query surface it as an error, not as "signed out"
      }
    },
  });

  return {
    user: q.data ?? null,
    loading: q.isPending,
    // Only a resolved 401 counts as signed out. An errored query means "unknown".
    signedOut: !q.isPending && !q.isError && q.data === null,
    unreachable: q.isError,
  };
}
