"use client";

import type { ReactElement } from "react"
import { useTheme } from "next-themes"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

/** ThemeToggle's menu (theme-toggle.tsx), a chunk of its own so a signed-out page doesn't carry the menu. */
export function ThemeMenu({ open, onOpenChange, trigger }: { open: boolean; onOpenChange(open: boolean): void; trigger: ReactElement }) {
    const { setTheme } = useTheme()
    return (
        // modal={false}: this menu changes the theme, which re-renders this
        // component while the menu is closing. In modal mode Radix locks the
        // page with `pointer-events: none` on <body> and restores it on close;
        // that re-render can race the restore and leave the body stuck
        // unclickable (navigation stops responding). A theme menu doesn't need
        // to lock the page, so non-modal avoids the body lock entirely.
        <DropdownMenu modal={false} open={open} onOpenChange={onOpenChange}>
            <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
            <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setTheme("light")}>Light</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("dark")}>Dark</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("system")}>System</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
