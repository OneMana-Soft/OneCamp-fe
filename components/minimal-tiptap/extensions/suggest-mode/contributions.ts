"use client"

/**
 * Suggesting's actions (docs C5), registered as the suggestions overlay's
 * chunk loads beside a doc's editor, off the doc's first load, as B6's page
 * actions are (chrome/contributions.ts): "Suggest edit" on the selection bar
 * and the phone's bar for anyone who may comment, "Suggestions" in More,
 * the palette and the phone's sheet, and Suggesting itself on the phone's
 * sheet and the palette (a phone draws no header, so no switch). register.ts keeps what must be there as
 * the editor is made: the plugin, the overlay, the header's switch, the chip
 * and the list.
 */

import { registerAction } from "@/components/docEditor/registry/registry"
import { factsOf } from "@/components/docEditor/chrome/pageFacts"
import { GitPullRequest, Pencil, SquarePen } from "@/lib/icons"
import { offersModes } from "@/lib/docs/abilities"
import { openSuggestion, setSuggesting, suggestStateOf } from "./suggestMode"

registerAction({
  id: "text.suggest",
  label: "Suggest edit",
  icon: SquarePen,
  group: "comment",
  order: 20,
  // The phone's bar too: a phone suggests as a wide screen does.
  surfaces: ["selection", "phoneBar"],
  edition: "both",
  // Anyone who may comment may suggest (the server's rule), on words chosen;
  // a hard lock takes no suggestions.
  isVisible: (ctx) => !!ctx.editor && (ctx.abilities?.comment ?? ctx.canEdit) && !ctx.editor.state.selection.empty,
  isEnabled: (ctx) => !!ctx.editor && (ctx.abilities?.comment ?? ctx.canEdit) && factsOf(ctx.docId).lock !== "hard",
  run: (ctx) => {
    const editor = ctx.editor
    if (!editor) return
    const { from, to } = editor.state.selection
    openSuggestion(editor, { from, to })
  },
})

registerAction({
  id: "doc.suggestions",
  label: "Suggestions",
  description: "Every suggested change, to review",
  aliases: ["suggested edits", "proposals", "review changes"],
  icon: GitPullRequest,
  group: "doc",
  order: 40,
  surfaces: ["more", "palette", "phoneSheet"],
  edition: "both",
  run: (ctx) => ctx.bus.emit("openPanel", { kind: "suggestions" }),
})

const suggesting = (ctx: { editor: Parameters<typeof suggestStateOf>[0] }) => suggestStateOf(ctx.editor).suggesting

registerAction({
  id: "doc.suggesting",
  label: "Suggest changes",
  labelFor: (ctx) => (suggesting(ctx) ? "Stop suggesting" : "Suggest changes"),
  description: "What you change becomes a suggestion to accept or decline",
  aliases: ["suggesting", "suggest mode", "editing mode"],
  icon: SquarePen,
  iconFor: (ctx) => (suggesting(ctx) ? Pencil : SquarePen),
  group: "doc",
  order: 41,
  surfaces: ["phoneSheet", "palette"],
  edition: "both",
  isVisible: (ctx) => !!ctx.editor && offersModes(ctx.abilities?.level ?? (ctx.canEdit ? "edit" : "view"), factsOf(ctx.docId).lock),
  isChecked: suggesting,
  run: (ctx) => {
    if (ctx.editor) setSuggesting(ctx.editor, !suggestStateOf(ctx.editor).suggesting)
  },
})
