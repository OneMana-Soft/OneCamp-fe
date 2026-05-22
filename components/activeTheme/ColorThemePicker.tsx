"use client";

import { useThemeConfig, VALID_COLOR_THEMES, type ColorTheme } from "@/components/activeTheme/activeTheme";
import { cn } from "@/lib/utils/helpers/cn";

export const THEME_COLOR_MAP: Record<ColorTheme, string> = {
    blue: "bg-blue-500",
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    violet: "bg-violet-500",
    teal: "bg-teal-500",
    orange: "bg-orange-500",
    slate: "bg-slate-500",
    zinc: "bg-zinc-500",
    stone: "bg-stone-500",
};

export function ColorThemePicker() {
    const { activeTheme, setActiveTheme } = useThemeConfig();

    return (
        <div className="w-full">
            <div className="text-xs text-muted-foreground mb-2 font-medium">Accent Color</div>
            <div className="flex items-center gap-2 flex-wrap">
                {VALID_COLOR_THEMES.map((color) => (
                    <button
                        key={color}
                        type="button"
                        onClick={() => setActiveTheme(color)}
                        className={cn(
                            "w-7 h-7 rounded-full transition-all duration-150",
                            THEME_COLOR_MAP[color],
                            activeTheme === color
                                ? "ring-2 ring-offset-2 ring-primary scale-110"
                                : "opacity-70 hover:opacity-100 hover:scale-105"
                        )}
                        aria-label={`Set theme color to ${color}`}
                        title={color}
                    />
                ))}
            </div>
        </div>
    );
}
