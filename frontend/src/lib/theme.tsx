import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiPatch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

// Three complete app themes. The choice lives on the ACCOUNT so it follows the user onto
// any device; localStorage is only the instant-paint cache and the guest fallback.
export const THEMES = [
  {
    id: "readout", name: "Blueprint",
    note: "Near-black technical readout · Chakra Petch + Sora",
    swatch: ["#090D12", "#E2F952", "#0F1722"],
  },
  {
    id: "ios", name: "iOS",
    note: "Native iPhone feel · SF Pro, system blue, soft corners",
    swatch: ["#000000", "#0A84FF", "#1C1C1E"],
  },
  {
    id: "daylight", name: "Daylight",
    note: "Paper-white jobsite print · Archivo + Instrument Sans",
    swatch: ["#F3F4EF", "#16509B", "#FFFFFF"],
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
const KEY = "gridline-theme";

// Legacy migration: "blueprint" used to be the indigo + cyan theme. We replaced it with
// "ios" so anyone still holding that value snaps to the new one on next paint.
const LEGACY: Record<string, ThemeId> = {
  blueprint: "ios",
};

const isTheme = (v: string | null | undefined): v is ThemeId =>
  Boolean(v) && THEMES.some((t) => t.id === v);

function cached(): ThemeId {
  const stored = localStorage.getItem(KEY);
  if (stored && LEGACY[stored]) return LEGACY[stored];
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
  const applied = useRef<string | null>(null);

  useEffect(() => {
    const accountTheme = user?.theme;
    const resolved = accountTheme && LEGACY[accountTheme] ? LEGACY[accountTheme] : accountTheme;
    if (!isTheme(resolved)) return;
    if (applied.current === resolved) return;
    applied.current = resolved;
    setThemeState(resolved);
  }, [user?.theme]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(KEY, theme);
  }, [theme]);

  const setTheme = (next: ThemeId) => {
    applied.current = next;
    setThemeState(next);
    void apiPatch<{ theme: string }>("/me/theme", { theme: next })
      .then(() => qc.invalidateQueries({ queryKey: ["me"] }))
      .catch(() => {});
  };

  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);