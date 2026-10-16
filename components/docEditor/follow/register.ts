"use client"

/**
 * The follow menu's registry entry (docs programme A6): "Notifications" in the
 * doc shell's More slot. Nothing renders it until A1's host reads the slot.
 *
 * The integrator adds `import '@/components/docEditor/follow/register'` to
 * components/docEditor/registry/index.ts when A6 merges.
 */
import { Bell } from "@/lib/icons"
import { registerAction, registerDialog, registerSlot } from "@/components/docEditor/registry/registry"

registerSlot({
    slot: "more",
    id: "follow",
    edition: "both",
    load: () => import("./FollowAction"),
})

// The phone's doc sheet has no submenus: the same choice opens as a sheet of
// its own (QA DSA-06: the sheet had no Notifications at all).
registerDialog({ id: "doc.follow", edition: "both", load: () => import("./FollowDialog") })
registerAction({
    id: "doc.follow",
    label: "Notifications",
    icon: Bell,
    group: "doc",
    order: 30,
    surfaces: ["phoneSheet"],
    edition: "both",
    run: (ctx) => ctx.bus.emit("openDialog", { id: "doc.follow" }),
})
