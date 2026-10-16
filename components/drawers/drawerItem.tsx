"use client"

import * as React from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils/helpers/cn"
import { Tile } from "@/components/ui/graphics/Tile"
import type { CampHue } from "@/lib/campHue"
import { MenuCheck } from "@/components/ui/menuCheck"

interface DrawerItemProps {
    icon?: LucideIcon
    label: string
    description?: string
    onClick: () => void
    destructive?: boolean
    trailing?: React.ReactNode
    /** Drawn in the icon's 32px slot when the row's mark is not an icon (a status glyph, an avatar). */
    leading?: React.ReactNode
    /** The choice in force, of a group of choices (the column a card is in): a check, and said as current. */
    current?: boolean
    disabled?: boolean
    /** Sets the icon on a tint tile in this hue: a place's colour (lib/destinationHue). */
    hue?: CampHue
    /** Sets the icon on a neutral tile: an action that is yours, not a place (focus, pause). */
    neutralTile?: boolean
}

/**
 * DrawerItem — single tappable row used inside mobile drawers.
 *
 * Replaces the various `<div onClick>` patterns that were scattered
 * across drawers: real `<button>` semantics, focus ring, accessible
 * label, active-state press feedback. 48px tall (Notion mobile drawer
 * row density). When `description` is present the row grows to ~64px
 * to accommodate the secondary line.
 */
export function DrawerItem({
    icon: Icon,
    label,
    description,
    onClick,
    destructive,
    trailing,
    leading,
    current,
    disabled,
    hue,
    neutralTile,
}: DrawerItemProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            // The row press (design v3, mobile F2, app/phone.css).
            data-press="row"
            aria-current={current || undefined}
            data-tone={destructive ? "danger" : undefined}
            className={cn(
                // 44px (design v3, Ph3), r10 inside the r20 sheet; the alpha
                // hover and press, so a row reads on any sheet.
                "w-full flex items-center gap-3 px-3 rounded-[10px] text-left transition-colors",
                description ? "py-2 min-h-14" : "h-11",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                destructive
                    ? "text-danger-ink hover:bg-hover focus-visible:bg-hover"
                    : "text-foreground hover:bg-hover focus-visible:bg-hover",
                disabled && "opacity-60 cursor-not-allowed pointer-events-none",
            )}
        >
            {Icon && hue && !destructive ? (
                <Tile hue={hue} data-drawer-tile="">
                    <Icon strokeWidth={1.75} />
                </Tile>
            ) : Icon && neutralTile && !destructive ? (
                <span aria-hidden="true" data-drawer-tile="" className="inline-flex size-8 shrink-0 items-center justify-center bg-press text-ink-2 [&>svg]:size-[18px]">
                    <Icon />
                </span>
            ) : Icon ? (
                // The tile's 32px slot, with or without the tile, so every
                // drawer's labels start on one line: the More menu's tiled
                // places and its plain account rows began 12px apart.
                <span data-drawer-icon="" className="flex size-8 shrink-0 items-center justify-center">
                    <Icon
                        className={cn(
                            "h-5 w-5",
                            destructive ? "text-danger-ink" : "text-muted-foreground",
                        )}
                        strokeWidth={1.75}
                    />
                </span>
            ) : leading ? (
                <span data-drawer-icon="" className="flex size-8 shrink-0 items-center justify-center">
                    {leading}
                </span>
            ) : null}
            <span className="flex-1 min-w-0">
                <span
                    className={cn(
                        "block text-body leading-5",
                        destructive ? "text-danger-ink" : "text-foreground",
                    )}
                >
                    {label}
                </span>
                {description && (
                    <span className="block text-xs text-muted-foreground mt-0.5 truncate">
                        {description}
                    </span>
                )}
            </span>
            {trailing}
            {current !== undefined && <MenuCheck checked={current} className="text-brand" />}
        </button>
    )
}
