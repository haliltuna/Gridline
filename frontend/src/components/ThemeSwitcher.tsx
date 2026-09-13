import { Palette } from "lucide-react";
import { THEMES, useTheme, type ThemeId } from "@/lib/theme";
import { cn } from "@/lib/utils";

// Theme picker. Lives in the app header and on both landing pages, so a visitor can see
// the whole product in each skin before deciding.
export default function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  return (
    <div className={cn("flex items-center gap-1 border border-hairline bg-surface p-1", compact && "gap-0.5")}
         data-testid="theme-switcher">
      {!compact && <Palette className="ml-1.5 mr-0.5 h-3.5 w-3.5 text-ink-4" />}
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          title={t.note}
          aria-label={`${t.name} theme`}
          data-testid={`theme-option-${t.id}`}
          onClick={() => setTheme(t.id as ThemeId)}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors duration-150",
            theme === t.id ? "bg-brand text-on-brand" : "text-ink-3 hover:text-ink",
          )}
        >
          <span className="flex h-3 w-3 overflow-hidden rounded-full border border-hairline">
            <span className="h-full w-1/2" style={{ background: t.swatch[0] }} />
            <span className="h-full w-1/2" style={{ background: t.swatch[1] }} />
          </span>
          {!compact && t.name}
        </button>
      ))}
    </div>
  );
}
