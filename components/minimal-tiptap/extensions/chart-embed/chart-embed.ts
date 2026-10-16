"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { lazyNodeView } from "../lazyNodeView"

// Drawn by a component fetched the first time one shows (lazyNodeView): an
// editor that never holds one never loads it (the chat composer, I20).
const ChartEmbedView = lazyNodeView(() => import("./chart-embed-view").then((m) => m.ChartEmbedView), 220)

interface ChartEmbedOptions {
  HTMLAttributes: Record<string, any>
}

// ChartEmbed is an atomic, read-only block that renders a data chart inline in a
// chat/channel/DM message or a doc. It is emitted server-side by an AI agent's
// reply pipeline (BotPost stream) as
//   <div data-type="chart" data-spec='{…chart JSON…}'></div>
// when the agent includes a ```chart block, mirroring how the meeting-recap
// agent emits a recording-embed node. The node stores ONLY the JSON spec string;
// the view validates + renders it as a dependency-free SVG chart (SvgChart).
//
// Safety: data-spec is treated purely as data — parsed as JSON and drawn as SVG
// numbers by the view, never interpreted as markup — so it carries no injection
// surface even though it originates from model output.
export const ChartEmbed = Node.create<ChartEmbedOptions>({
  name: "chartEmbed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { HTMLAttributes: {} }
  },

  addAttributes() {
    return {
      spec: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-spec") || "",
        renderHTML: (attrs) => (attrs.spec ? { "data-spec": attrs.spec } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="chart"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes({ "data-type": "chart" }, this.options.HTMLAttributes, HTMLAttributes),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChartEmbedView, { className: "block-node" })
  },
})

