"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { RecordingEmbedView } from "./recording-embed-view"

export interface RecordingEmbedOptions {
  HTMLAttributes: Record<string, any>
}

// RecordingEmbed is an atomic, read-only block that references a call
// recording by its LiveKit egress id plus the surface it belongs to. It is
// emitted server-side by the meeting-recap agent (recapToHTML) as
// <div data-type="recording-embed" data-egress data-kind data-sid|u1|u2>, so
// the recap message renders a "▶ Play recording" button that opens the
// recording player IN PLACE (no navigation), mirroring how table-embed /
// reference-mention render interactive UI inside Tiptap content.
//
// Surface attributes (mirror the call room-name shapes):
//   - channel → kind="channel", sid=<channelUUID>
//   - group   → kind="group",   sid=<groupId>
//   - DM      → kind="dm", u1=<uuidA>, u2=<uuidB> (the view picks the peer ≠ self,
//     since a DM recording URL is addressed by the OTHER participant)
export const RecordingEmbed = Node.create<RecordingEmbedOptions>({
  name: "recordingEmbed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { HTMLAttributes: {} }
  },

  addAttributes() {
    return {
      egress: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-egress") || "",
        renderHTML: (attrs) => (attrs.egress ? { "data-egress": attrs.egress } : {}),
      },
      kind: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-kind") || "",
        renderHTML: (attrs) => (attrs.kind ? { "data-kind": attrs.kind } : {}),
      },
      sid: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-sid") || "",
        renderHTML: (attrs) => (attrs.sid ? { "data-sid": attrs.sid } : {}),
      },
      u1: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-u1") || "",
        renderHTML: (attrs) => (attrs.u1 ? { "data-u1": attrs.u1 } : {}),
      },
      u2: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-u2") || "",
        renderHTML: (attrs) => (attrs.u2 ? { "data-u2": attrs.u2 } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="recording-embed"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes({ "data-type": "recording-embed" }, this.options.HTMLAttributes, HTMLAttributes),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(RecordingEmbedView, { className: "block-node" })
  },
})

export default RecordingEmbed
