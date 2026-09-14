"use client"

import { useCallback, useEffect, useState } from "react"

import { getCookie } from "@/lib/utils/helpers/getCookie"

/**
 * Sidebar section open/closed state, remembered across reloads.
 *
 * Focus mode is only tolerable as a default if it is not a cage: a user
 * who opens "More" should find it open tomorrow. The same has always
 * been true of Docs, Boards, projects and the rest, which reset to
 * closed on every load because their state lived in a useState.
 *
 * One cookie for every section rather than one cookie each, so the
 * request header does not grow with the sidebar. A cookie rather than
 * localStorage because logout clears localStorage, and where someone
 * keeps their sidebar is not session state.
 *
 * The stored value is applied in an effect, never during render: the
 * first paint is server-rendered and must not depend on a value only the
 * browser has, or the markup mismatches on hydration.
 */

export const SIDEBAR_SECTIONS_COOKIE = "onecamp-sidebar-sections"

const ONE_YEAR_SECONDS = 31536000

/** Every remembered section, or an empty map if nothing is stored yet. */
export function readSidebarSections(): Record<string, boolean> {
    if (typeof document === "undefined") return {}
    const raw = getCookie(SIDEBAR_SECTIONS_COOKIE)
    if (!raw) return {}
    try {
        const parsed: unknown = JSON.parse(decodeURIComponent(raw))
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
        const sections: Record<string, boolean> = {}
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof value === "boolean") sections[key] = value
        }
        return sections
    } catch {
        // A hand-edited or truncated cookie is not worth failing a render over.
        return {}
    }
}

/** Remember one section, leaving the others as they are. */
export function writeSidebarSection(key: string, open: boolean): void {
    if (typeof document === "undefined") return
    const next = { ...readSidebarSections(), [key]: open }
    const value = encodeURIComponent(JSON.stringify(next))
    document.cookie = `${SIDEBAR_SECTIONS_COOKIE}=${value}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`
}

/**
 * Open state for one sidebar section: starts at `defaultOpen`, adopts the
 * remembered value once mounted, and writes back on every change.
 */
export function useSidebarDisclosure(
    key: string,
    defaultOpen: boolean,
): [boolean, (open: boolean) => void] {
    const [isOpen, setIsOpen] = useState(defaultOpen)

    useEffect(() => {
        const stored = readSidebarSections()[key]
        if (typeof stored === "boolean") setIsOpen(stored)
    }, [key])

    const setOpen = useCallback(
        (open: boolean) => {
            setIsOpen(open)
            writeSidebarSection(key, open)
        },
        [key],
    )

    return [isOpen, setOpen]
}
