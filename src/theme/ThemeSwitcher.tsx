import { Palette, Shuffle } from "lucide-react";
import type { ThemeMode } from "./context";
import { cn } from "../ui/cn";
import { THEME_PRESETS, type ThemeId } from "./presets";
import { useTheme } from "./useTheme";

interface ThemeSwitcherProps {
  className?: string;
  /**
   * Dentro de uma sala, o host despacha `SET_THEME` em vez de pintar só o
   * próprio aparelho: a cor volta pelo `STATE` e chega aos celulares também.
   * Sem estes callbacks (landing), a troca é puramente local.
   */
  onThemeChange?: (themeId: ThemeId) => void;
  onModeChange?: (mode: ThemeMode) => void;
}

/** Seletor de tema do Host: 5 presets + alternância manual/automática. */
export function ThemeSwitcher({
  className,
  onThemeChange,
  onModeChange,
}: ThemeSwitcherProps) {
  const { themeId, mode, setThemeId, setMode } = useTheme();

  const selectTheme = onThemeChange ?? setThemeId;
  const selectMode = onModeChange ?? setMode;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 border-4 border-ink bg-paper p-3 shadow-brutal",
        className,
      )}
    >
      <span className="flex items-center gap-1.5 font-hand text-lg uppercase text-ink">
        <Palette strokeWidth={2.5} className="size-5" />
        Tema
      </span>

      <div className="flex gap-2">
        {THEME_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => selectTheme(preset.id)}
            aria-label={preset.label}
            aria-pressed={themeId === preset.id}
            title={preset.label}
            style={{ backgroundColor: preset.accent }}
            className={cn(
              "size-9 cursor-pointer rounded-full border-4 border-ink transition-transform",
              "focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink",
              themeId === preset.id
                ? "scale-115 shadow-brutal-sm"
                : "motion-safe:hover:scale-110",
            )}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => selectMode(mode === "auto" ? "manual" : "auto")}
        aria-pressed={mode === "auto"}
        className={cn(
          "flex cursor-pointer items-center gap-1.5 border-4 border-ink px-3 py-1.5",
          "font-action text-sm uppercase transition-colors",
          "focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink",
          mode === "auto" ? "bg-ink text-paper" : "bg-paper text-ink",
        )}
      >
        <Shuffle strokeWidth={2.5} className="size-4" />
        {mode === "auto" ? "Auto" : "Manual"}
      </button>
    </div>
  );
}
