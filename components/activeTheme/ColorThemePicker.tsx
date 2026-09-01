"use client";

import { useThemeConfig, VALID_COLOR_THEMES } from "@/components/activeTheme/activeTheme";
import { cn } from "@/lib/utils/helpers/cn";

/**
 * No colour map.
 *
 * The swatches used to be ten raw Tailwind hues (bg-blue-500 and friends), which
 * meant the dot you clicked was not the colour you got: the real accents are
 * solved for contrast and sit at a different lightness entirely. Two sources of
 * truth for one thing, and the one people looked at was the wrong one.
 *
 * Each swatch now renders INSIDE its own theme class and paints itself with
 * bg-brand, so it shows exactly what selecting it will do. Adding a theme to
 * themes.css is all it takes; there is nothing here to keep in step.
 */
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
                            `theme-${color} bg-brand`,
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
