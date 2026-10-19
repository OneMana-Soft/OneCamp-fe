"use client"

// B6's page actions in More (and the phone's sheet and the palette) and its
// dialogs, offered by the page guard (PageGuard) once it has handed the app's
// router over (register.ts keeps the doc route's first load to the slots
// alone); the hosts draw them from then on (useRegistryVersion).
//
// Not as the guard's chunk loads. React 19 draws a lazy piece for the first
// time no sooner than 300 ms after the page last drew a fallback, and a doc
// page draws its pieces' fallbacks one after another as they load, so the
// guard came well after its chunk. Delete was in More meanwhile; run then, it
// left the page by a full page load (pageFacts' navigate had no router yet),
// and the Undo toast went with it (N32 under load: the chunk was in at 1.25 s,
// Delete was answered at 1.62 s, the guard took over at 1.73 s).

import { ArrowRightToLine, Copy, Crown, Lock, SlidersHorizontal, Star, Trash2 } from "@/lib/icons"
import { registerAction, registerDialog } from "@/components/docEditor/registry/registry"
import type { ActionContext } from "@/components/docEditor/registry/types"
import { factsOf } from "./pageFacts"

const run = (name: "toggleStar" | "duplicate" | "trash") => (ctx: ActionContext) => import("./actions").then((m) => m[name](ctx))
const open = (id: string) => (ctx: ActionContext) => ctx.bus.emit("openDialog", { id })
const both = "both" as const
const surfaces = (): ("more" | "phoneSheet" | "palette")[] => ["more", "phoneSheet", "palette"]

let offered = false

/** Offers the page actions and their dialogs, once (PageGuard, after it hands the router over). */
export function offerPageActions() {
  if (offered) return
  offered = true
  registerAction({
    id: "doc.star",
    label: "Star",
    labelFor: (c) => (factsOf(c.docId).starred ? "Starred" : "Star"),
    icon: Star,
    group: "view",
    order: 5,
    surfaces: surfaces(),
    edition: both,
    isChecked: (c) => !!factsOf(c.docId).starred,
    run: run("toggleStar"),
  })
  registerAction({ id: "doc.customize", label: "Customise page", icon: SlidersHorizontal, group: "view", order: 40, surfaces: surfaces(), edition: both, run: open("doc.customize") })
  registerAction({
    id: "doc.lock",
    label: "Lock page…",
    labelFor: (c) => (factsOf(c.docId).lock ? "Unlock page…" : "Lock page…"),
    icon: Lock,
    group: "view",
    order: 50,
    surfaces: surfaces(),
    edition: both,
    isEnabled: (c) => c.canEdit,
    run: open("doc.lock"),
  })
  registerAction({ id: "doc.duplicate", label: "Duplicate", icon: Copy, group: "doc", order: 30, surfaces: surfaces(), edition: both, run: run("duplicate") })
  registerAction({
    id: "doc.moveTo",
    label: "Move to…",
    icon: ArrowRightToLine,
    group: "doc",
    order: 40,
    surfaces: surfaces(),
    edition: both,
    isEnabled: (c) => c.canEdit,
    run: open("doc.moveTo"),
  })
  registerAction({
    id: "doc.transfer",
    label: "Transfer ownership…",
    icon: Crown,
    group: "doc",
    order: 60,
    surfaces: surfaces(),
    edition: both,
    isVisible: (c) => !!factsOf(c.docId).owner,
    run: open("doc.transfer"),
  })
  registerAction({
    id: "doc.trash",
    label: "Delete",
    icon: Trash2,
    group: "delete",
    order: 20,
    surfaces: surfaces(),
    edition: both,
    destructive: true,
    isEnabled: (c) => c.canEdit || !!factsOf(c.docId).owner,
    run: run("trash"),
  })

  registerDialog({ id: "doc.moveTo", edition: both, load: () => import("../MoveToDialog") })
  registerDialog({ id: "doc.lock", edition: both, load: () => import("../LockControl") })
  registerDialog({ id: "doc.transfer", edition: both, load: () => import("../OwnerControl") })
  registerDialog({ id: "doc.customize", edition: both, load: () => import("../CustomizePage") })
}
