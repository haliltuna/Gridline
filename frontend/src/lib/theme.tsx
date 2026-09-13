import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiPatch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

// Three complete app themes. The choice lives on the ACCOUNT so it follows the user onto
// any device; localStorage is only the instant-paint cache and the guest fallback.
export const THEMES = [
  {
    id: "readout", name: "Readout",
    note: "Near-black technical readout · Chakra Petch + Sora",
    swatch: ["#090D12", "#E2F952", "#0F1722"],
  },
  {
    id: "blueprint", name: "Blueprint",
    note: "Indigo drafting table, cyan ink · Syne + Inter Tight",
    swatch: ["#060A16", "#5BE9E0", "#0C152C"],
  },
  {
    id: "daylight", name: "Daylight",
    note: "Paper-white jobsite print · Archivo + Instrument Sans",
    swatch: ["#F3F4EF", "#16509B", "#FFFFFF"],
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
const KEY = "gridline-theme";
const isTheme = (v: string | null | undefined): v is ThemeId =>
  Boolean(v) && THEMES.some((t) => t.id === v);

function cached(): ThemeId {
  const stored = localStorage.getItem(KEY);
  return isTheme(stored) ? stored : "readout";
}

const Ctx = createContext<{ theme: ThemeId; setTheme: (t: ThemeId) => void }>({
  theme: "readout",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(cached);
  const { user } = useAuth();
  const qc = useQueryClient();
  // Remember which account value we have already applied. Without this the account theme
  // would keep re-asserting itself (and undo a fresh pick) on every re-render/refetch.
  const applied = useRef<string | null>(null);

  useEffect(() => {
    const accountTheme = user?.theme;
    if (!isTheme(accountTheme)) return;
    if (applied.current === accountTheme) return;
    applied.current = accountTheme;
    setThemeState(accountTheme);
  }, [user?.theme]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(KEY, theme);
  }, [theme]);

  const setTheme = (next: ThemeId) => {
    applied.current = next;           // our own pick wins over the cached account value
    setThemeState(next);
    // Always try to persist: a guest simply gets a 401 here, which we ignore. Gating this
    // on a cached user object is what made the pick silently local-only.
    void apiPatch<{ theme: string }>("/me/theme", { theme: next })
      .then(() => qc.invalidateQueries({ queryKey: ["me"] }))
      .catch(() => {});
  };

  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
