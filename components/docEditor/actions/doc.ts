"use client"

/**
 * The doc's own actions (docs programme A1, PROGRAM.md §4 #2): what its More
 * menu, the phone's doc sheet and the page's keys do. Each is written once and
 * shown on every surface it lists; what the shell keeps (focus mode, full
 * width, Later, its panels and dialogs) is asked for on the doc's command bus,
 * and the shell answers it (DocView).
 *
 * More's groups, in this order (MORE_GROUPS): view, doc, export, import,
 * share, help. The phone's sheet: doc, then delete, alone and last.
 */

import { Bookmark, BookmarkCheck, Eye, History, Keyboard, Link2, MessageCircle, Maximize2, Minimize, Pencil, Share2 } from "@/lib/icons"
import { registerAction } from "@/components/docEditor/registry/registry"
import { copyDocLink } from "@/components/docEditor/docLink"

registerAction({
  id: "doc.saveForLater",
  label: "Save for later",
  labelFor: (ctx) => (ctx.state?.saved ? "Saved for later" : "Save for later"),
  icon: Bookmark,
  iconFor: (ctx) => (ctx.state?.saved ? BookmarkCheck : Bookmark),
  group: "view",
  order: 10,
  surfaces: ["more", "palette", "phoneSheet"],
  edition: "both",
  isChecked: (ctx) => !!ctx.state?.saved,
  // L, outside the text (G then L still goes to Later).
  shortcut: "l",
  shortcutOrder: 24,
  run: (ctx) => ctx.bus.emit("toggle", { what: "saved" }),
})

registerAction({
  id: "doc.focusMode",
  label: "Focus mode",
  labelFor: (ctx) => (ctx.state?.focusMode ? "Leave focus mode" : "Focus mode"),
  icon: Minimize,
  group: "view",
  order: 20,
  surfaces: ["more", "palette", "phoneSheet"],
  shortcut: "Shift-f",
  shortcutOrder: 30,
  edition: "both",
  run: (ctx) => ctx.bus.emit("toggle", { what: "focusMode" }),
})

registerAction({
  id: "doc.fullWidth",
  label: "Full width",
  icon: Maximize2,
  group: "view",
  order: 30,
  surfaces: ["more", "palette"],
  edition: "both",
  // A phone's page is its width already.
  isEnabled: (ctx) => ctx.state?.desktop !== false,
  isChecked: (ctx) => !!ctx.state?.fullWidth,
  run: (ctx) => ctx.bus.emit("toggle", { what: "fullWidth" }),
})

registerAction({
  id: "doc.rename",
  label: "Edit doc title",
  icon: Pencil,
  group: "doc",
  order: 5,
  // A wide screen renames in the breadcrumb and the title itself.
  surfaces: ["phoneSheet"],
  edition: "both",
  isEnabled: (ctx) => !!ctx.state?.owner,
  run: (ctx) => ctx.bus.emit("openDialog", { id: "doc.rename" }),
})

registerAction({
  id: "doc.share",
  label: "Share",
  icon: Share2,
  group: "doc",
  order: 6,
  // The header's Share button on a wide screen, by the same rule (the page's
  // canShare): a reader was offered it, and found every control disabled (QA
  // DSA-14). Copy link is theirs on the sheet.
  surfaces: ["phoneSheet"],
  edition: "both",
  isEnabled: (ctx) => (ctx.state?.canShare ?? ctx.canEdit) === true,
  run: (ctx) => ctx.bus.emit("openDialog", { id: "doc.share" }),
})

registerAction({
  id: "doc.comments",
  label: "Comments",
  icon: MessageCircle,
  group: "doc",
  order: 7,
  // The header's comment count on a wide screen.
  surfaces: ["phoneSheet"],
  edition: "both",
  run: (ctx) => ctx.bus.emit("openPanel", { kind: "comments" }),
})

registerAction({
  id: "doc.history",
  label: "Version history",
  icon: History,
  group: "doc",
  order: 10,
  surfaces: ["more", "phoneSheet", "palette"],
  edition: "both",
  isEnabled: (ctx) => ctx.canEdit,
  // B8's sheet (history/register.ts).
  run: (ctx) => ctx.bus.emit("openDialog", { id: "doc.history" }),
})

registerAction({
  id: "doc.viewers",
  label: "Viewed by",
  icon: Eye,
  group: "doc",
  order: 20,
  surfaces: ["more", "phoneSheet", "palette"],
  edition: "both",
  isEnabled: (ctx) => ctx.canEdit,
  run: (ctx) => ctx.bus.emit("openPanel", { kind: "viewers" }),
})

registerAction({
  id: "doc.copyLink",
  label: "Copy link",
  icon: Link2,
  group: "share",
  order: 10,
  surfaces: ["more", "palette", "phoneSheet"],
  shortcut: "Mod-l",
  shortcutLabel: "Copy the doc's link",
  shortcutOrder: 20,
  edition: "both",
  run: (ctx) => void copyDocLink(ctx.docId),
})

registerAction({
  id: "doc.shortcuts",
  label: "Keyboard shortcuts",
  icon: Keyboard,
  group: "help",
  order: 10,
  // The palette has its own Keyboard shortcuts.
  surfaces: ["more"],
  shortcut: "?",
  shortcutLabel: "These shortcuts",
  shortcutOrder: 90,
  edition: "both",
  run: (ctx) => ctx.bus.emit("toggle", { what: "shortcuts" }),
})

/** More's groups in the order the menu shows them; a group not named here comes after them. */
export const MORE_GROUPS = ["view", "doc", "export", "import", "share", "help"]

/** The phone's doc sheet: what destroys is alone, and last. */
export const SHEET_GROUPS = ["doc", "view", "export", "import", "share", "help", "delete"]

/** The sheet's groups that open as a sheet of their own from one row: the four exports. */
export const SHEET_SUBSHEETS = ["export"]
