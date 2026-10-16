"use client"

// B1, block interactions: what every surface reads. What runs it, and the
// block actions, load with a doc's editor (blockOnly.ts); the block menu and
// its phone sheet with the editor's overlay (docEditor/BlockMenu.tsx).
import type { Editor, Range } from "@tiptap/core"
import { Columns2, Columns3, Columns4 } from "@/lib/icons"
import { registerBlock, registerSlot } from "@/components/docEditor/registry/registry"
import { DOC_EDITORS, SLASH_ORDER } from "../../blocks/kinds"
import { DIR_NODES, INDENT_NODES } from "./nodes"

registerBlock({
  id: "blockLayout",
  editors: DOC_EDITORS,
  edition: "both",
  load: () => import("./blockOnly").then((m) => [m.Indent, m.BlockDir, m.ColumnList, m.Column, m.BlockSelectionExtension, m.BlockCommands]),
  schema: [
    { kind: "node", name: "columnList", attrs: [] },
    { kind: "node", name: "column", attrs: ["width"] },
  ],
  globalAttrs: [
    { name: "indent", on: INDENT_NODES },
    { name: "dir", on: DIR_NODES },
  ],
  slash: [Columns2, Columns3, Columns4].map((icon, i) => ({
    id: `columns${i + 2}`,
    title: `${i + 2} columns`,
    description: `${["Two", "Three", "Four"][i]} blocks side by side`,
    aliases: ["columns", "side by side", "layout"],
    icon,
    section: "Basic",
    // After B2's toggle headings (collapsible + 1-3), B3's table and B2's contents (table + 5).
    order: SLASH_ORDER.table + 6 + i,
    run: (editor: Editor, range: Range) => void editor.chain().focus().deleteRange(range).insertColumns(i + 2).run(),
  })),
  shortcuts: [
    { keys: "Escape", label: "Select the block", group: "Blocks", order: 165 },
    { keys: "Shift-ArrowDown", alt: ["Shift-ArrowUp"], label: "With blocks selected, select more", group: "Blocks", order: 166 },
    { keys: "Delete", alt: ["Backspace"], label: "With blocks selected, delete them", group: "Blocks", order: 167 },
    { keys: "Mod-Shift-ArrowUp", alt: ["Mod-Shift-ArrowDown"], label: "Move the block up or down", group: "Blocks", order: 170 },
    { keys: "Mod-/", label: "Block menu", group: "Blocks", order: 175 },
    { keys: "Alt-Shift-l", label: "Copy link to the block", group: "Blocks", order: 180 },
  ],
})

registerSlot({ slot: "editorOverlay", id: "blocks.menu", edition: "both", load: () => import("@/components/docEditor/BlockMenu") })
