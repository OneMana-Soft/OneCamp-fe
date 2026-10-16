"use client"

/**
 * The doc meta events' registry entry (docs programme A6): a session-slot
 * contribution, run once for every open doc. Nothing mounts it until A1's host
 * renders the session slot.
 *
 * The integrator adds `import '@/components/docEditor/session/register'` to
 * components/docEditor/registry/index.ts when A6 merges.
 */
import { registerSlot } from "@/components/docEditor/registry/registry"

registerSlot({
    slot: "session",
    id: "doc-meta-events",
    edition: "both",
    load: () => import("./DocMetaEvents"),
})
