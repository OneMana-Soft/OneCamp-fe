/**
 * A doc's threads in the doc's own editor, for what is drawn outside it (the
 * panel beside the doc): where a thread's words are, showing them, and the
 * exact matches a thread whose words changed may be reattached to (D-9). The
 * editor is the one of this doc used last on the page (the command bus), so a
 * doc open twice in split view answers once.
 */
import type { Editor } from "@tiptap/core"
import { busForDoc, editorOf } from "@/components/docEditor/registry/commandBus"
import { anchorDecorationsKey } from "@/components/minimal-tiptap/extensions/anchor-decorations/anchorDecorations"
import { anchorFor, bindingOf, findReattachCandidates } from "@/lib/anchors/anchors"
import type { Anchor, ReattachCandidate, ResolvedAnchor } from "@/lib/anchors/types"

/** The doc's editor on this page, if it is open. */
export function docEditor(docId: string): Editor | null {
    const e = editorOf(busForDoc(docId))
    return e && !e.isDestroyed ? e : null
}

/** Where a thread's words are now, as the doc's highlights found them. */
export function placeIn(editor: Editor | null, threadId: string): ResolvedAnchor | undefined {
    return editor ? anchorDecorationsKey.getState(editor.state)?.resolved.get(threadId) : undefined
}

const smooth = () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches

/** Scrolls the doc to a position, the words there in the middle of the view. */
export function scrollDocTo(editor: Editor, pos: number) {
    try {
        const { node } = editor.view.domAtPos(pos)
        const el = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement
        el?.scrollIntoView({ block: "center", behavior: smooth() ? "smooth" : "auto" })
    } catch {
        // Not in the doc any more: nothing to show.
    }
}

/** Shows a thread's words in the doc; false when they aren't there. */
export function showInDoc(docId: string, threadId: string): boolean {
    const editor = docEditor(docId)
    const place = placeIn(editor, threadId)
    if (!editor || place?.state !== "attached") return false
    scrollDocTo(editor, place.from)
    return true
}

/** Where the same words as a thread's quote are in the doc now, in its order. */
function matchesIn(editor: Editor | null, quote: string | undefined): ReattachCandidate[] {
    return editor && quote ? findReattachCandidates(editor.state.doc, quote) : []
}

/** The anchor "Reattach here" makes: the first exact match of the quote, made against the live doc. */
export function reattachAnchor(docId: string, quote: string | undefined): Anchor | null {
    const editor = docEditor(docId)
    const b = editor ? bindingOf(editor.state) : null
    const [first] = matchesIn(editor, quote)
    if (!editor || !b || !first) return null
    return anchorFor(b, editor.state.doc, first.from, first.to)
}
