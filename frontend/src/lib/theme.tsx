import { createContext, useContext, useEffect, useState } from "react";

// Three full app themes (not just the landing page): every page paints from the palette
// tokens in index.css, so switching the data-theme attribute repaints the whole product.
export const THEMES = [
  { id: "readout", name: "Readout", note: "Near-black technical readout, neon-yellow accent", swatch: ["#090D12", "#E2F952", "#0F1722"] },
  { id: "blueprint", name: "Blueprint", name2: "", note: "Deep indigo drafting table, cyan drafting ink", swatch: ["#060A16", "#5BE9E0", "#0C152C"] },
  { id: "daylight", name: "Daylight", note: "Paper-white jobsite print, ink-blue accent", swatch: ["#F3F4EF", "#16509B", "#FFFFFF"] },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
const KEY = "gridline-theme";

function initial(): ThemeId {
  const stored = localStorage.getItem(KEY) as ThemeId | null;
  return stored && THEMES.some((t) => t.id === stored) ? stored : "readout";
}

const Ctx = createContext<{ theme: ThemeId; setTheme: (t: ThemeId) => void }>({
  theme: "readout",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeId>(initial);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(KEY, theme);
  }, [theme]);

  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
