"use client"

import { Extension, nodeInputRule, type Editor } from "@tiptap/core"
import { Fragment, Slice } from "@tiptap/pm/model"
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import { closeHistory } from "@tiptap/pm/history"
import { urlLabel } from "@/lib/links/urlLabel"
import { busFor } from "@/components/docEditor/registry/commandBus"
import { bareUrl, campColours, markdownSignals } from "./pasteRules"
import { newUploadId } from "../image/uploads"

/**
 * Paste in a doc (editor.md P0-5, R6; small-details L3, L4, L11, L12).
 *
 * - One web address, nothing selected: it goes in as a link, labelled from its
 *   shape when it is long (lib/links/urlLabel.ts), and a menu offers Link (the
 *   default: Enter or Esc keeps it), Mention, Bookmark and, for a site the doc
 *   can frame, Embed (links-media/PasteMenu.tsx draws it and acts on it; here
 *   only where it is and what the keys asked). With text selected the link goes
 *   on the text, as before.
 * - Markdown with two or more block signals (pasteRules.ts), never inside
 *   code, never with Shift: the text goes in as it is, then becomes blocks in a
 *   second step, so one ⌘Z gives back the literal text.
 * - Rich HTML from another app keeps its colours only on the doc's palette.
 */

/**
 * The menu over a link just pasted: its range and address, the choice
 * highlighted (as moved by the keys; the menu wraps it), and whether Enter
 * took it.
 */
interface PasteMenu {
  from: number
  to: number
  href: string
  index: number
  accepted?: boolean
}

const smartPasteKey = new PluginKey<PasteMenu | null>("smartPaste")

/** The open paste menu, or null. */
export const pasteMenuOf = (state: EditorState): PasteMenu | null => smartPasteKey.getState(state) ?? null

/** Opens, moves or closes the menu. */
export function setPasteMenu(view: EditorView, menu: PasteMenu | null) {
  view.dispatch(view.state.tr.setMeta(smartPasteKey, menu))
}

const sameOrigin = (href: string) => {
  try {
    return typeof window !== "undefined" && new URL(href).origin === window.location.origin
  } catch {
    return false
  }
}

function pasteLink(view: EditorView, href: string) {
  const { state } = view
  const label = urlLabel(href) ?? href
  const tr = state.tr.replaceSelectionWith(state.schema.text(label, [state.schema.marks.link.create({ href })]), false)
  const to = tr.selection.from
  // The app's own links stay links: a doc, a task or a channel is a mention
  // through "@" and "+", not a preview of the app's page.
  if (!sameOrigin(href)) tr.setMeta(smartPasteKey, { from: to - label.length, to, href, index: 0 })
  view.dispatch(tr.setMeta("uiEvent", "paste").scrollIntoView())
}

/**
 * The next change starts an undo step of its own: in a shared doc Yjs's undo
 * (found by its plugin's key, as lib/proposals/review.ts finds it), else
 * ProseMirror's history.
 */
function stopCapturing(state: EditorState, tr?: Transaction) {
  const undo = state.plugins.find((p) => String((p as unknown as { key: string }).key).startsWith("y-undo$"))
  ;(undo?.getState(state) as { undoManager?: { stopCapturing(): void } } | undefined)?.undoManager?.stopCapturing()
  if (tr) closeHistory(tr)
}

/** Follows a position through every change after it, until stopped. */
export function trackPos(editor: Editor, pos: number, assoc = 1) {
  let at: number | null = pos
  // A change and those appended to it (a block's new id, say).
  const follow = ({ transaction, appendedTransactions }: { transaction: Transaction; appendedTransactions?: Transaction[] }) => {
    for (const t of [transaction, ...(appendedTransactions ?? [])]) {
      if (at === null) return
      const r = t.mapping.mapResult(at, assoc)
      at = r.deleted ? null : r.pos
    }
  }
  editor.on("transaction", follow)
  return { pos: () => at, stop: () => editor.off("transaction", follow) }
}

function pasteMarkdown(editor: Editor, view: EditorView, text: string) {
  const literal = text.replace(/\r\n?/g, "\n")
  const { state } = view
  const { schema } = state
  const paras = literal.split("\n").map((l) => schema.nodes.paragraph.create(null, l ? schema.text(l) : undefined))
  const { from, to } = state.selection
  const tr = state.tr.replaceSelection(new Slice(Fragment.from(paras), 1, 1))
  stopCapturing(state, tr)
  // Not marked as a paste: Tiptap's paste rules would read the **bold** in
  // the literal text and take its asterisks out, and only the text exactly
  // as pasted is converted.
  view.dispatch(tr.scrollIntoView())
  stopCapturing(view.state)
  // Followed from here on: the positions are already after the paste.
  const start = trackPos(editor, tr.mapping.map(from, -1), 1)
  const end = trackPos(editor, tr.mapping.map(to, 1), -1)
  // The converter (A7's codec) is fetched the first time it is needed.
  void import("./markdownBlocks")
    .then(({ blocksFromMarkdown }) => {
      const docId = busFor(editor)?.docId
      const s = start.pos()
      const e = end.pos()
      if (editor.isDestroyed || s === null || e === null || e <= s) return
      const doc = editor.state.doc
      // Converted only while the pasted text is still there as it was.
      if (doc.textBetween(s, e, "\n") !== literal) return
      const { blocks, pictures } = blocksFromMarkdown(literal, docId)
      const nodes = blocks.map((j) => editor.schema.nodeFromJSON(j))
      if (!nodes.length) return
      const $s = doc.resolve(s)
      const $e = doc.resolve(e)
      const a = $s.parent.isTextblock && $s.parentOffset === 0 ? $s.before() : s
      const b = $e.parent.isTextblock && $e.parentOffset === $e.parent.content.size ? $e.after() : e
      const convert = editor.state.tr.replaceWith(a, b, nodes)
      const after = convert.mapping.map(b, 1)
      convert.setSelection(TextSelection.near(convert.doc.resolve(Math.min(after, convert.doc.content.size)), -1))
      stopCapturing(editor.state, convert)
      editor.view.dispatch(convert.scrollIntoView())
      stopCapturing(editor.state)
      // Pictures written as ![](https://…) are kept with the doc, as typed ones are (N28).
      if (pictures.length && docId) void import("../image/remoteImage").then((m) => pictures.forEach((p) => m.keepRemoteImage(editor, p.id, p.url, docId)))
    })
    .catch(() => {
      // The text stays as it was pasted: nothing is lost.
    })
    .finally(() => {
      start.stop()
      end.stop()
    })
}

/** A copy from a code editor is its plain text, whatever HTML it carries. */
const fromCodeEditor = (cd: DataTransfer) => cd.types.includes("vscode-editor-data") || /^\s*<pre[\s>][\s\S]*<\/pre>\s*$/i.test(cd.getData("text/html"))

export const SmartPaste = Extension.create({
  name: "smartPaste",
  // Ahead of the link's own paste handling and the file handler, and of the
  // image's own ![](…) rule.
  priority: 1050,

  // A picture typed as a link, ![alt](https://…), is kept with the doc: the
  // server fetches it once (POST /unfurl/store) and readers load it from the
  // workspace, never from the site, which would see every reader (N28). A
  // link that isn't a web address is left to the image's own rule.
  addInputRules() {
    const editor = this.editor
    const image = editor.schema.nodes.image
    if (!image) return []
    return [
      nodeInputRule({
        find: /(?:^|\s)(!\[(.+|:?)]\((https?:\/\/\S+)(?:(?:\s+)["'](\S+)["'])?\))$/i,
        type: image,
        getAttributes: (match) => {
          const [, , alt, src, title] = match
          const docId = busFor(editor)?.docId
          if (!docId) return { src, alt, title }
          const id = newUploadId()
          queueMicrotask(() => void import("../image/remoteImage").then((m) => m.keepRemoteImage(editor, id, src, docId)))
          return { id, src: null, alt, title }
        },
      }),
    ]
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    let plain = false
    return [
      new Plugin<PasteMenu | null>({
        key: smartPasteKey,
        state: {
          init: () => null,
          apply(tr, menu) {
            const meta = tr.getMeta(smartPasteKey)
            if (meta !== undefined) return meta
            if (!menu) return null
            if (tr.docChanged) {
              const from = tr.mapping.map(menu.from, 1)
              const to = tr.mapping.map(menu.to, -1)
              return to - from === menu.to - menu.from ? { ...menu, from, to } : null
            }
            return tr.selectionSet && !(tr.selection.empty && tr.selection.from === menu.to) ? null : menu
          },
        },
        props: {
          handleKeyDown(view, event) {
            plain = event.shiftKey && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v"
            const menu = pasteMenuOf(view.state)
            if (!menu || menu.accepted) return false
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              setPasteMenu(view, { ...menu, index: menu.index + (event.key === "ArrowDown" ? 1 : -1) })
              return true
            }
            if (event.key === "Enter" || event.key === "Tab") {
              setPasteMenu(view, { ...menu, accepted: true })
              return true
            }
            if (event.key === "Escape") {
              setPasteMenu(view, null)
              return true
            }
            return false
          },

          handlePaste(view, event) {
            const shift = plain
            plain = false
            const cd = event.clipboardData
            if (!view.editable || !cd || cd.files.length || shift) return false
            const { $from, empty } = view.state.selection
            if ($from.parent.type.spec.code) return false
            const text = cd.getData("text/plain")
            const href = bareUrl(text)
            if (href && empty && view.state.schema.marks.link) {
              pasteLink(view, href)
              return true
            }
            if ((!cd.getData("text/html") || fromCodeEditor(cd)) && markdownSignals(text) >= 2) {
              pasteMarkdown(editor, view, text)
              return true
            }
            return false
          },

          transformPastedHTML: (html) => campColours(html),
        },
      }),
    ]
  },
})
