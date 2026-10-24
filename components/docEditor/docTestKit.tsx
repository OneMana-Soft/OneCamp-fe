// Shared by the doc tests: a real collaboration provider that never opens a
// socket, two tabs' docs joined as the server joins them, and a doc holding one
// of every block the doc editor writes. Not a test itself (no .test. in the
// name), so vitest only runs it through them.

import * as Y from "yjs"
import { HocuspocusProvider } from "@hocuspocus/provider"
import type { JSONContent } from "@tiptap/core"

/** A socket that never connects: the provider stays detached, so nothing is sent. */
const NO_SOCKET = { on() {}, off() {}, attach() {}, detach() {}, send() {}, destroy() {} }

/**
 * A real HocuspocusProvider (its own Y.Doc and awareness, its unsynced-changes
 * count) with no connection: what the doc's editor binds to, offline.
 */
export function offlineProvider(document: Y.Doc = new Y.Doc(), name = "doc-1"): HocuspocusProvider {
  return new HocuspocusProvider({ name, document, websocketProvider: NO_SOCKET as never })
}

const RELAYED = "relayed"

/**
 * Two tabs' docs, each update reaching the other as the provider's sync step
 * hands it on: what the receiving tab's editor throws is caught and kept in
 * `thrown`, as y-protocols catches it and only logs it, never thrown at the
 * tab that sent the update.
 */
export function twoTabDocs(): { docs: [Y.Doc, Y.Doc]; thrown: string[] } {
  const docs: [Y.Doc, Y.Doc] = [new Y.Doc(), new Y.Doc()]
  const thrown: string[] = []
  docs.forEach((from, i) =>
    from.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === RELAYED) return
      try {
        Y.applyUpdate(docs[1 - i], update, RELAYED)
      } catch (e) {
        thrown.push(String(e))
      }
    }),
  )
  return { docs, thrown }
}

const p = (text: string): JSONContent => ({ type: "paragraph", content: [{ type: "text", text }] })

/**
 * One of every node and mark a doc can hold: StarterKit's blocks and marks,
 * the doc's own blocks (callout, toggle, to-dos, table embed), the three chips,
 * images, the blocks agents write (poll, chart, diff, recording), and B2's
 * colours by name, highlight, block colour, large quote and contents.
 */
export const EVERY_BLOCK: JSONContent = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Launch" }] },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Plan" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Bold", marks: [{ type: "bold" }] },
        { type: "text", text: " italic", marks: [{ type: "italic" }] },
        { type: "text", text: " under", marks: [{ type: "underline" }] },
        { type: "text", text: " struck", marks: [{ type: "strike" }] },
        { type: "text", text: " code", marks: [{ type: "code" }] },
        { type: "text", text: " linked", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
        { type: "text", text: " sky", marks: [{ type: "textStyle", attrs: { color: "sky" } }] },
        { type: "text", text: " marked", marks: [{ type: "highlight", attrs: { color: "sun" } }] },
        { type: "text", text: " " },
        { type: "mention", attrs: { id: "u1@0x1", label: "Sam Rivera" } },
        { type: "text", text: " " },
        { type: "channelMention", attrs: { id: "channel:c1", label: "engineering" } },
        { type: "text", text: " " },
        { type: "entityMention", attrs: { id: "doc:d1", label: "Launch brief" } },
        { type: "text", text: " " },
        { type: "linkMention", attrs: { href: "https://example.com/brief", title: "The brief" } },
        { type: "text", text: " " },
        { type: "dateMention", attrs: { date: "2026-10-12" } },
        { type: "hardBreak" },
        { type: "text", text: "second line" },
      ],
    },
    { type: "bulletList", content: [{ type: "listItem", content: [p("a bullet")] }] },
    { type: "orderedList", attrs: { start: 1 }, content: [{ type: "listItem", content: [p("a number")] }] },
    {
      type: "taskList",
      content: [
        { type: "taskItem", attrs: { checked: true, taskId: "3a3f4d5e-6f7a-4b8c-9d2e-3f4a5b6c7d8e" }, content: [p("a done to-do")] },
        { type: "taskItem", attrs: { checked: false }, content: [p("an open to-do")] },
      ],
    },
    { type: "blockquote", attrs: { quoteSize: "large", blockColor: "gray_background" }, content: [p("a quote")] },
    { type: "paragraph", attrs: { blockColor: "sky_background" }, content: [{ type: "text", text: "a blue line" }] },
    { type: "codeBlock", attrs: { language: "js" }, content: [{ type: "text", text: "const x = 1" }] },
    { type: "horizontalRule" },
    { type: "callout", attrs: { color: "sky", icon: "rocket" }, content: [p("a callout")] },
    { type: "collapsible", content: [p("More detail"), p("inside the toggle")] },
    { type: "toc" },
    { type: "tableEmbed", attrs: { tableId: "t1" } },
    { type: "image", attrs: { src: "https://cdn.example.com/chart.png", alt: "A chart", id: "img-1" } },
    { type: "poll", attrs: { id: "poll-1" } },
    { type: "chartEmbed", attrs: { spec: JSON.stringify({ type: "bar", title: "Signups", data: [{ label: "Mon", value: 3 }] }) } },
    { type: "diffEmbed", attrs: { diff: "--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new" } },
    { type: "recordingEmbed", attrs: { egress: "eg-1", kind: "channel", sid: "c1" } },
    // B3: a code block's wrap and caption, equations, a simple table.
    { type: "codeBlock", attrs: { language: "go", wrap: true, caption: "Says hello" }, content: [{ type: "text", text: "fmt.Println(1)" }] },
    { type: "paragraph", content: [{ type: "text", text: "energy " }, { type: "inlineMath", attrs: { latex: "E = mc^2" } }] },
    { type: "blockMath", attrs: { latex: "\\int_0^1 x\\,dx" } },
    {
      type: "table",
      content: [
        { type: "tableRow", content: [{ type: "tableHeader", attrs: { colwidth: [140] }, content: [p("Step")] }, { type: "tableHeader", content: [p("When")] }] },
        { type: "tableRow", content: [{ type: "tableCell", attrs: { background: "sky" }, content: [p("Ship")] }, { type: "tableCell", content: [p("Friday")] }] },
      ],
    },
    { type: "bookmark", attrs: { href: "https://example.com/post", title: "A post", siteName: "Example" } },
    { type: "webEmbed", attrs: { src: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } },
    { type: "fileBlock", attrs: { kind: "file", src: "https://api.example.com/doc/getDocAttachment/d/o", name: "rows.csv", size: 12 } },
    // C1: a page, a project's tasks and board.
    { type: "subpage", attrs: { docId: "0d0c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b", title: "Launch plan" } },
    { type: "taskListEmbed", attrs: { projectId: "2f2e3c4d-5e6f-4a7b-8c1d-2e3f4a5b6c7d", show: "open" } },
    { type: "boardEmbed", attrs: { projectId: "2f2e3c4d-5e6f-4a7b-8c1d-2e3f4a5b6c7d" } },
    p("the end"),
  ],
}

/** Every node type name in a ProseMirror JSON document. */
export function nodeTypesOf(doc: JSONContent, out = new Set<string>()): Set<string> {
  if (doc.type) out.add(doc.type)
  for (const child of doc.content ?? []) nodeTypesOf(child, out)
  return out
}

/** Every mark type name in a ProseMirror JSON document. */
export function markTypesOf(doc: JSONContent, out = new Set<string>()): Set<string> {
  for (const m of doc.marks ?? []) out.add(m.type)
  for (const child of doc.content ?? []) markTypesOf(child, out)
  return out
}
