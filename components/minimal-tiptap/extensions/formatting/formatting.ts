"use client"

import { TableOfContents } from "@/lib/icons"
import { registerAction, registerBlock, registerSlot } from "@/components/docEditor/registry/registry"
import type { ActionContext } from "@/components/docEditor/registry/types"
import { BLOCK_COLOUR_NODES } from "@/lib/docColours"
import { DOC_EDITORS, SLASH_ORDER } from "../../blocks/kinds"
import { BlockColor } from "../block-color/blockColor"
import { Highlight } from "../highlight/highlight"
import { Toc } from "../toc/toc"
import { ListFormatKeys, listFormatOf, orderedListAround, resolvedAt, type ListFormat } from "../list-format/listFormat"
import { QuoteSize, quoteAround } from "../quote-size/quoteSize"
import "../block-color/colourUi"

/**
 * A doc's formatting (B2), registered as this chunk loads with the doc's
 * editor (formatting/register.ts loads it), before the editor is built: the
 * blocks and attributes, their "/" entries, the block menu's List format and
 * Large quote, and the floating outline. The chat composer and a task's description never fetch it (I20).
 */

registerBlock({
  id: "blockColor",
  editors: DOC_EDITORS,
  edition: "both",
  extensions: [BlockColor],
  schema: [],
  globalAttrs: [{ name: "blockColor", on: BLOCK_COLOUR_NODES }],
})

registerBlock({
  id: "highlight",
  editors: DOC_EDITORS,
  edition: "both",
  extensions: [Highlight],
  schema: [{ kind: "mark", name: "highlight", attrs: ["color"] }],
})

registerBlock({
  id: "toc",
  editors: DOC_EDITORS,
  edition: "both",
  extensions: [Toc],
  schema: [{ kind: "node", name: "toc", attrs: [] }],
  slash: [
    {
      id: "toc",
      title: "Table of contents",
      description: "Links to the doc's headings, kept up to date",
      aliases: ["toc", "contents", "outline"],
      icon: TableOfContents,
      section: "Basic",
      order: SLASH_ORDER.table + 5,
      run: (editor, range) => {
        editor.chain().focus().deleteRange(range).insertContent({ type: "toc" }).run()
      },
    },
  ],
})

registerBlock({ id: "listFormat", editors: DOC_EDITORS, edition: "both", extensions: [ListFormatKeys], schema: [] })

registerBlock({
  id: "quoteSize",
  editors: DOC_EDITORS,
  edition: "both",
  extensions: [QuoteSize],
  schema: [],
  globalAttrs: [{ name: "quoteSize", on: ["blockquote"] }],
})

/** The block menu's blocks (its range), or none for the caret's. */
const rangeOf = (ctx: ActionContext) => (ctx.state?.range as { from: number; to: number } | undefined) ?? null
const listAt = (ctx: ActionContext) => (ctx.editor ? orderedListAround(resolvedAt(ctx.editor.state, rangeOf(ctx))) : null)

// List format, in the block menu of a numbered list (and the phone's block sheet).
const FORMATS: Array<[string, ListFormat]> = [
  ["Numbers 1, 2, 3", "1"],
  ["Letters a, b, c", "a"],
  ["Roman numerals i, ii, iii", "i"],
]
FORMATS.forEach(([label, format], i) =>
  registerAction({
    id: `listFormat.${format}`,
    label,
    group: "listFormat",
    order: i,
    surfaces: ["blockMenu"],
    edition: "both",
    isVisible: (ctx) => !!listAt(ctx),
    isEnabled: (ctx) => ctx.canEdit,
    isChecked: (ctx) => {
      const list = listAt(ctx)
      return !!list && listFormatOf(list) === format
    },
    run: (ctx) => void ctx.editor?.chain().focus().setListFormat(format, rangeOf(ctx)).run(),
  }),
)

registerAction({
  id: "quote.large",
  label: "Large quote",
  group: "quote",
  surfaces: ["blockMenu"],
  edition: "both",
  isVisible: (ctx) => !!ctx.editor && !!quoteAround(ctx.editor.state, rangeOf(ctx)),
  isEnabled: (ctx) => ctx.canEdit,
  isChecked: (ctx) => !!ctx.editor && quoteAround(ctx.editor.state, rangeOf(ctx))?.node.attrs.quoteSize === "large",
  run: (ctx) => {
    if (!ctx.editor) return
    const large = quoteAround(ctx.editor.state, rangeOf(ctx))?.node.attrs.quoteSize === "large"
    ctx.editor.chain().focus().setQuoteSize(large ? null : "large", rangeOf(ctx)).run()
  },
})

// The floating outline, over the doc's editor (it shows from 1,280 px with three headings).
registerSlot({ slot: "editorOverlay", id: "doc.outline", edition: "both", load: () => import("@/components/docEditor/DocOutline") })
