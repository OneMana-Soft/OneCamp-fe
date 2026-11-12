"use client"

import { memo } from "react"
import { SidebarSection } from "@/components/navigationBar/desktop/desktopSideNavigationBar"
import { placeRows, useRecentPlaces } from "@/lib/nav/placeRows"
import { useSidebarDisclosure } from "@/lib/nav/sidebarDisclosure"
import { useStableRows } from "@/lib/ui/stableRows"

const rowPath = (r: { path: string }) => r.path

/**
 * What the person opened lately of one kind, as a sidebar section (miro-46:
 * Recent boards), newest first, its heading the kind's own page. A component
 * of its own, so its read draws only it. Nothing opened yet, a failed read or
 * offline: no section at all, never an empty box or a broken row.
 */
export const RecentPlacesSection = memo(function RecentPlacesSection({ kind, title, href, path }: { kind: string; title: string; href: string; path: readonly string[] }) {
    const [open, setOpen] = useSidebarDisclosure(`recent-${kind}`, true)
    const rows = useStableRows(placeRows(useRecentPlaces(kind), path), rowPath)
    return <SidebarSection title={title} href={href} open={open} setOpen={setOpen} rows={rows} cap={5} />
})
