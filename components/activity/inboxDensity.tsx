"use client"

import { HubSegmented } from "@/components/activity/hubFrame"
import { usePhone } from "@/hooks/usePhone"
import { useStoredState } from "@/hooks/useStoredState"
// Straight from the package, not the registry: lib/icons reaches every first
// screen, and these two draw only in the Inbox.
import { Rows2, Rows4 } from "lucide-react"

/** The Inbox's two densities (STEP4 #6): two lines a row, or one. */
export type InboxDensity = "comfortable" | "compact"
const isDensity = (v: unknown): v is InboxDensity => v === "comfortable" || v === "compact"
/** Where each viewer's choice is kept (this browser only: a convenience). */
export const INBOX_DENSITY_KEY = "oc_inbox_density"

/**
 * The Inbox's row size, one choice for every tab's list: compact only where
 * it was chosen and never on a phone, and the switch that chooses it (none on
 * a phone).
 */
export function useInboxDensity(): { compact: boolean; densitySwitch: React.ReactNode } {
    const phone = usePhone()
    const [density, setDensity] = useStoredState<InboxDensity>(INBOX_DENSITY_KEY, "comfortable", isDensity)
    const densitySwitch = phone ? undefined : (
        <HubSegmented
            label="Row size"
            value={density}
            onChange={(v) => setDensity(v as InboxDensity)}
            segments={[
                { value: "comfortable", label: "Comfortable", glyph: <Rows2 aria-hidden />, iconOnly: true },
                { value: "compact", label: "Compact", glyph: <Rows4 aria-hidden />, iconOnly: true },
            ]}
        />
    )
    return { compact: !phone && density === "compact", densitySwitch }
}
