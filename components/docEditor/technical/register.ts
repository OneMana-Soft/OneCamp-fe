"use client"

// B3's schema and keys; the rest loads with a doc's editor (blocks.ts).

import { Search } from "@/lib/icons"
import { blockById, registerAction, registerBlock } from "@/components/docEditor/registry/registry"
import { DOC_EDITORS, ORDER } from "@/components/minimal-tiptap/blocks/kinds"

type Blocks = typeof import("./blocks")
let chunk: Promise<Blocks> | null = null
const blocks = () =>
  (chunk ??= import("./blocks").catch((e) => {
    chunk = null
    throw e
  }))
const both = { editors: DOC_EDITORS, edition: "both" as const }

registerBlock({
  ...blockById("codeBlock")!,
  ...both,
  id: "docCodeBlock",
  replaces: ["codeBlock"],
  order: ORDER.codeBlock,
  extensions: undefined,
  load: () => blocks().then((m) => m.CODE),
  schema: [{ kind: "node", name: "codeBlock", attrs: ["caption", "language", "wrap"] }],
})

const cell = ["background", "colspan", "colwidth", "rowspan"]
registerBlock({
  ...both,
  id: "simpleTable",
  load: () => blocks().then((m) => m.TABLE),
  schema: [
    { kind: "node", name: "table", attrs: [] },
    { kind: "node", name: "tableCell", attrs: cell },
    { kind: "node", name: "tableHeader", attrs: cell },
    { kind: "node", name: "tableRow", attrs: [] },
  ],
  shortcuts: [{ keys: "Tab", alt: ["Shift-Tab"], label: "Next or previous cell", group: "Blocks", order: 126 }],
})

// Editing a table (cell selection, column widths, the row and column
// handles), on the doc page's editor from when it is made: never added while
// the doc is open (registry/factory.ts). Its own chunk, fetched with the
// doc's blocks; the guest's page, which only reads, has none.
registerBlock({
  id: "simpleTableEditing",
  editors: ["doc"],
  edition: "both",
  schema: [],
  load: () => import("@/components/minimal-tiptap/extensions/simple-table/tableEditing").then((m) => [m.TableEditing]),
})

registerBlock({
  ...both,
  id: "math",
  load: () => blocks().then((m) => m.MATH),
  schema: [
    { kind: "node", name: "blockMath", attrs: ["latex"] },
    { kind: "node", name: "inlineMath", attrs: ["latex"] },
  ],
  shortcuts: [
    { keys: "Mod-Shift-e", typed: ["$x$"], label: "Inline equation", group: "Text", order: 65 },
    { typed: ["$$"], label: "Block equation", group: "Blocks", order: 105 },
    // Only while find is open (else the last colour).
    { keys: "Mod-Shift-h", label: "Replace, while finding", group: "Doc", order: 33 },
  ],
  excludesTypography: true,
})

registerAction({
  id: "find.open",
  label: "Find in doc",
  aliases: ["search", "replace"],
  icon: Search,
  group: "view",
  order: 40,
  surfaces: ["more", "palette", "phoneSheet"],
  shortcut: "Mod-f",
  shortcutLabel: "Find in the doc",
  shortcutOrder: 32,
  edition: "both",
  isEnabled: (ctx) => !!ctx.editor,
  run: (ctx) => void import("@/components/docEditor/FindBar").then((m) => m.openFind(ctx)),
})
