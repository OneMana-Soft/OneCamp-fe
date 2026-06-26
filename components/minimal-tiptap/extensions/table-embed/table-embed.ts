"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { TableEmbedView } from "./components/table-embed-view"

export interface TableEmbedOptions {
  HTMLAttributes: Record<string, any>
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tableEmbed: {
      // Insert a live embed of an existing table (optionally a specific view).
      setTableEmbed: (attributes: { tableId: string; viewId?: string }) => ReturnType
    }
  }
}

// TableEmbed is an atomic block node that stores ONLY a reference
// { tableId, viewId } to a first-class table. The actual rows/fields live in
// the table entity (Postgres), never in the doc body — this is Notion's real
// inline-database model. The node view renders a live, interactive view.
export const TableEmbed = Node.create<TableEmbedOptions>({
  name: "tableEmbed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { HTMLAttributes: {} }
  },

  addAttributes() {
    return {
      tableId: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-table-id") || "",
        renderHTML: (attributes) =>
          attributes.tableId ? { "data-table-id": attributes.tableId } : {},
      },
      viewId: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-view-id") || "",
        renderHTML: (attributes) =>
          attributes.viewId ? { "data-view-id": attributes.viewId } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="table-embed"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes({ "data-type": "table-embed" }, this.options.HTMLAttributes, HTMLAttributes),
    ]
  },

  addCommands() {
    return {
      setTableEmbed:
        (attributes) =>
        ({ commands }) => {
          if (!attributes?.tableId) return false
          return commands.insertContent({
            type: this.name,
            attrs: { tableId: attributes.tableId, viewId: attributes.viewId || "" },
          })
        },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(TableEmbedView, { className: "block-node" })
  },
})

export default TableEmbed
