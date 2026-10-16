"use client"

// B6, the page chrome (PROGRAM §7): its slots, and the soft lock its editor
// is made with. The page guard's chunk adds More's page actions and the
// dialogs (contributions.ts), off the first load.

import { registerBlock, registerSlot } from "@/components/docEditor/registry/registry"

// The soft lock, on the doc page's editor from the start (loaded with the
// doc's blocks, off the doc's first load): the page guard, which loads later,
// keeps the facts it reads (softLock.ts).
registerBlock({
  id: "b6.softLock",
  editors: ["doc"],
  edition: "both",
  schema: [],
  load: () => import("./softLock").then((m) => m.softLockFor),
})

registerSlot({ slot: "crumbs", id: "b6.breadcrumbs", edition: "both", load: () => import("../Breadcrumbs") })
registerSlot({ slot: "titleChips", id: "b6.lock", edition: "both", load: () => import("../LockControl").then((m) => ({ default: m.LockChip })) })
registerSlot({ slot: "editorOverlay", id: "b6.page", edition: "both", load: () => import("./PageGuard") })
