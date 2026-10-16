/**
 * What a comment is on, from where Comment was asked (docs programme B7):
 * - words: a range of the live doc (A8's yrange), which follows its
 *   characters through everyone's edits;
 * - a whole block (the block menu's Comment, a block chosen with Esc, or ⌘⇧M
 *   with only a caret): the block, by its id, so a picture or an embed takes
 *   a comment as well as a paragraph does;
 * - several blocks the block menu names by id: those blocks (meta.block_ids),
 *   never what lies between blocks chosen apart; several chosen as a range
 *   (a selection across blocks): from the first one's words to the last one's.
 * Never written into the doc: an anchor is the thread's (I5).
 */
import type { Editor } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import { anchorFor, bindingOf } from "@/lib/anchors/anchors"
import type { Anchor } from "@/lib/anchors/types"

/** A block with no words of its own, named as a person would. */
const BLOCK_NAMES: Record<string, string> = {
    image: "Image",
    imageBlock: "Image",
    video: "Video",
    youtube: "Video",
    horizontalRule: "Divider",
    codeBlock: "Code",
    table: "Table",
    tableEmbed: "Table",
    mermaid: "Diagram",
    mathBlock: "Equation",
}

/** A block's words as its comment quotes them; its kind when it has none. */
export function blockQuote(node: PMNode): string {
    const text = node.textContent.replace(/\s+/g, " ").trim()
    return text ? text.slice(0, 10000) : BLOCK_NAMES[node.type.name] ?? "This block"
}

/** Whether a block has words of its own, so its quote is words and not its kind. */
const hasWords = (node: PMNode) => node.textContent.trim() !== ""

/**
 * A comment on one whole block. A block with no words of its own (a picture)
 * is quoted by its kind and marked named (meta.named), so its quote is never
 * taken for words to find again ("Reattach here" on the word "Image").
 */
function wholeBlock(id: string, node: PMNode): Anchor {
    return hasWords(node) ? { kind: "block", block_id: id, quote: blockQuote(node) } : { kind: "block", block_id: id, quote: blockQuote(node), meta: { named: true } }
}

/** The first and last positions with words between from and to, or null when none has any. */
function wordsBetween(doc: PMNode, from: number, to: number): { start: number; end: number } | null {
    let start: number | null = null
    let end: number | null = null
    doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isTextblock) return true
        if (node.content.size > 0) {
            if (start === null) start = pos + 1
            end = pos + node.nodeSize - 1
        }
        return false
    })
    return start !== null && end !== null && start < end ? { start, end } : null
}

/** A comment on one whole block. */
function onBlock(editor: Editor, node: PMNode, pos: number): Anchor | null {
    const blockId = (node.attrs as Record<string, unknown>).blockId
    if (typeof blockId === "string" && blockId) return wholeBlock(blockId, node)
    // A block without an id yet (a doc not opened since block ids came): its words.
    const b = bindingOf(editor.state)
    const words = wordsBetween(editor.state.doc, pos, pos + node.nodeSize)
    return b && words ? anchorFor(b, editor.state.doc, words.start, words.end) : null
}

/** The most blocks one comment names, and the most room their ids take: the API takes 4 KB of an anchor's detail. */
export const MAX_BLOCKS = 50
const MAX_IDS_BYTES = 3000

/**
 * A comment on the blocks the block menu ran Comment on, by their ids (B1's
 * ctx.state.blocks, in the doc's order): one block is that block; several are
 * the first of them, with every one named in the anchor's detail
 * (meta.block_ids), so blocks chosen apart never take in what lies between
 * them. Null when none of them is in the doc.
 */
export function anchorOfBlocks(editor: Editor, ids: string[]): Anchor | null {
    const wanted = new Set(ids)
    const found: { id: string; node: PMNode }[] = []
    const seen = new Set<string>()
    editor.state.doc.descendants((node) => {
        if (seen.size === wanted.size || node.isInline) return false
        const id = (node.attrs as Record<string, unknown>).blockId
        if (typeof id === "string" && wanted.has(id) && !seen.has(id)) {
            seen.add(id)
            found.push({ id, node })
            return false
        }
        return !node.isTextblock
    })
    if (found.length === 0) return null
    if (found.length === 1) return wholeBlock(found[0].id, found[0].node)
    const chosen = [found[0]]
    let bytes = found[0].id.length + 3
    for (const f of found.slice(1)) {
        bytes += f.id.length + 3
        if (chosen.length === MAX_BLOCKS || bytes > MAX_IDS_BYTES) break
        chosen.push(f)
    }
    return {
        kind: "block",
        block_id: chosen[0].id,
        quote: chosen.map((f) => blockQuote(f.node)).join("\n").slice(0, 10000),
        meta: chosen.every((f) => hasWords(f.node)) ? { block_ids: chosen.map((f) => f.id) } : { block_ids: chosen.map((f) => f.id), named: true },
    }
}

/** What Comment on from..to is on; null when there is nothing there to comment on. */
export function anchorOf(editor: Editor, from: number, to: number): Anchor | null {
    const { doc } = editor.state
    const lo = Math.max(0, Math.min(from, to))
    const hi = Math.min(doc.content.size, Math.max(from, to))
    const $lo = doc.resolve(lo)
    // A caret: its block.
    if (lo === hi) {
        if ($lo.depth === 0) {
            const after = doc.nodeAt(lo)
            return after ? onBlock(editor, after, lo) : null
        }
        return onBlock(editor, $lo.node(1), $lo.before(1))
    }
    // Whole blocks: the range runs from one block's edge to another's.
    if ($lo.depth === 0 && doc.resolve(hi).depth === 0) {
        const blocks: { node: PMNode; pos: number }[] = []
        doc.nodesBetween(lo, hi, (node, pos) => {
            blocks.push({ node, pos })
            return false
        })
        if (blocks.length === 0) return null
        if (blocks.length === 1) return onBlock(editor, blocks[0].node, blocks[0].pos)
        const b = bindingOf(editor.state)
        const words = wordsBetween(doc, lo, hi)
        if (!b || !words) return onBlock(editor, blocks[0].node, blocks[0].pos)
        return anchorFor(b, doc, words.start, words.end)
    }
    // Words.
    const b = bindingOf(editor.state)
    if (b) return anchorFor(b, doc, lo, hi)
    // Not bound to the live doc (its session hasn't joined): the block it began in.
    return onBlock(editor, $lo.node(1), $lo.before(1))
}
