import {
  Extension,
  combineTransactionSteps,
  findChildrenInRange,
  getChangedRanges,
  getExtensionField,
  type AnyExtension,
} from "@tiptap/core"
import { Fragment, Slice, type Node as PMNode } from "@tiptap/pm/model"
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state"
import { ReplaceAroundStep, type Step } from "@tiptap/pm/transform"

/**
 * Block identity (docs programme §4 #4, A1): every block carries a stable id,
 * `blockId`, written as data-block-id. Anchored threads (A8), edit proposals
 * (A9), the Live Doc Writer's insertAfter and replaceBlocks (A4) and links to a
 * block all find a block by it.
 *
 * Which nodes: every node that isn't inline, except the doc itself. The
 * collaboration server's schema/blockId.js applies the same rule, and the
 * schema manifest holds the two to the same attributes.
 *
 * Ids are given here only in this tab's own transactions, never in a remote
 * one (y-sync$, I6): two tabs fixing the same block at once would fight over
 * it. A block gets one when it is made (Enter, paste, "/"), or when it is
 * edited and has none yet. Existing docs get theirs on the server, once
 * (collaboration-service transforms/blockIds.js). Ids go in the undo step of
 * the change that made them.
 *
 * A split leaves both halves with the block's attributes, its id included;
 * the half that still reads as the block keeps it (Enter at a block's start
 * moves all its text down, and the id goes with the text), else the first
 * half, and the other gets an id of its own. A pasted block is a new one.
 *
 * A block rebuilt in its place keeps its id. Turn into (Text, a heading, a
 * list of another kind) and a Markdown shortcut ("## ") rebuild a block around
 * its own text without its attributes; threads, links and proposals still
 * find it by its id.
 *
 * Only what a change touched is looked at (I20): a keystroke inside a block
 * finds that block's id already there. A doc-wide check runs only when a
 * change brought in a block that already had an id that could be a copy (a
 * duplicate block, a list split in two), which typing never does.
 */

export const BLOCK_ID_ATTR = "blockId"

/** The node types that are never blocks for this purpose. */
const NOT_BLOCKS = new Set(["doc", "text"])

const blockIdKey = new PluginKey("blockId")

/** A new id: a random UUID, from getRandomValues (randomUUID needs a secure context). */
export function newBlockId(): string {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** The node extensions that are blocks: not inline, not the doc. */
function blockTypesOf(extensions: AnyExtension[]): string[] {
  return extensions
    .filter((e) => e.type === "node" && !NOT_BLOCKS.has(e.name))
    .filter((e) => {
      const ctx = { name: e.name, options: e.options, storage: e.storage }
      const inline = getExtensionField<boolean | (() => boolean)>(e, "inline", ctx)
      const isInline = typeof inline === "function" ? inline() : inline
      const group = getExtensionField<string | (() => string)>(e, "group", ctx)
      const groups = typeof group === "function" ? group() : group
      return !isInline && !(groups ?? "").split(" ").includes("inline")
    })
    .map((e) => e.name)
}

/** Whether a transaction came from another tab, through Yjs. */
export const isRemote = (tr: Transaction) => !!tr.getMeta("y-sync$")

/** This tab's own change to the doc, one ⌘Z takes back. */
const undoableEdit = (tr: Transaction) => tr.docChanged && !isRemote(tr) && tr.getMeta("addToHistory") !== false

/**
 * Whether the ids belong to an edit ⌘Z takes back: one this plugin saw, or the
 * edit one of them was appended to (a later plugin can answer an edit out of
 * history, and then its answer is all this plugin sees).
 */
function inHistory(transactions: readonly Transaction[]): boolean {
  return transactions.some((tr) => {
    const root = tr.getMeta("appendedTransaction") as Transaction | undefined
    return undoableEdit(tr) || (!!root && undoableEdit(root))
  })
}

/** Where a step rebuilt one node around its own content, in its place (setNodeMarkup, setBlockType); else null. */
function rebuiltAt(step: Step): number | null {
  if (!(step instanceof ReplaceAroundStep)) return null
  const { from, to, gapFrom, gapTo, insert, slice } = step
  const one = insert === 1 && gapFrom === from + 1 && gapTo === to - 1 && !slice.openStart && !slice.openEnd && slice.content.childCount === 1
  return one ? from : null
}

/**
 * The ids blocks had before a change rebuilt them in their place, by where
 * they are now (Turn into resets a block with clearNodes, then rebuilds it
 * with setNode: one block throughout).
 */
function idsBeforeRebuild(transactions: readonly Transaction[]): Map<number, string> {
  const steps = transactions.flatMap((tr) => tr.steps.map((step, i) => ({ step, doc: tr.docs[i] })))
  const had = new Map<number, string>()
  steps.forEach(({ step, doc }, s) => {
    const at = rebuiltAt(step)
    if (at === null) return
    const id = doc.nodeAt(at)?.attrs[BLOCK_ID_ATTR]
    if (typeof id !== "string" || !id) return
    let pos = at
    for (const later of steps.slice(s + 1)) {
      if (rebuiltAt(later.step) === pos) continue
      const moved = later.step.getMap().mapResult(pos, 1)
      if (moved.deleted) return
      pos = moved.pos
    }
    had.set(pos, id)
  })
  return had
}

/** A pasted or dropped slice without block ids: what is pasted is new blocks. */
function withoutIds(fragment: Fragment, types: Set<string>): Fragment {
  const out: PMNode[] = []
  fragment.forEach((node) => {
    const content = withoutIds(node.content, types)
    const attrs = types.has(node.type.name) && node.attrs[BLOCK_ID_ATTR] != null ? { ...node.attrs, [BLOCK_ID_ATTR]: null } : node.attrs
    out.push(node.isText ? node : node.type.create(attrs, content, node.marks))
  })
  return Fragment.fromArray(out)
}

/** A block a change touched: where it is, its id, and whether the change made it. */
interface Touched {
  node: PMNode
  pos: number
  id: string | null
  isNew: boolean
}

/**
 * Which of the blocks holding one id keeps it: the one that still reads as
 * the block that had it (Enter at a block's start moves all its text down:
 * the id follows the text, and the tab's copy of the doc changes least),
 * else the one that was there before (a split's first half), else the first.
 */
function keeperOf(id: string, holders: Touched[], before: PMNode, inverse: { mapResult(pos: number): { pos: number; deleted: boolean } }): Touched {
  let was: PMNode | null = null
  for (const h of holders) {
    const r = inverse.mapResult(h.pos)
    if (r.deleted) continue
    const old = before.nodeAt(r.pos)
    if (old?.attrs[BLOCK_ID_ATTR] === id) {
      was = old
      break
    }
  }
  if (was) {
    const same = holders.find((h) => h.node.type === was!.type && h.node.textContent === was!.textContent)
    if (same) return same
  }
  return holders.find((h) => !h.isNew) ?? holders[0]
}

export const BlockId = Extension.create<{ generate: () => string }>({
  name: "blockId",

  addOptions() {
    return { generate: newBlockId }
  },

  addGlobalAttributes() {
    const types = blockTypesOf((this as unknown as { extensions: AnyExtension[] }).extensions ?? [])
    return [
      {
        types,
        attributes: {
          [BLOCK_ID_ATTR]: {
            default: null,
            // A split's second half is a new block, with an id of its own.
            keepOnSplit: false,
            parseHTML: (el: HTMLElement) => el.getAttribute("data-block-id") || null,
            renderHTML: (attrs: Record<string, unknown>) => (attrs[BLOCK_ID_ATTR] ? { "data-block-id": attrs[BLOCK_ID_ATTR] } : {}),
          },
        },
      },
    ]
  },

  addProseMirrorPlugins() {
    // The types the attribute went on, read back from the schema.
    const types = new Set(Object.values(this.editor.schema.nodes).filter((t) => t.spec.attrs?.[BLOCK_ID_ATTR]).map((t) => t.name))
    const generate = this.options.generate
    const editor = this.editor
    return [
      new Plugin({
        key: blockIdKey,
        props: {
          // A paste is new blocks, and so is a drop from elsewhere; a block
          // dragged within this doc keeps its id.
          transformPasted: (slice, view) =>
            view?.dragging?.move ? slice : new Slice(withoutIds(slice.content, types), slice.openStart, slice.openEnd),
        },
        appendTransaction(transactions, oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null
          if (transactions.some(isRemote) || transactions.some((tr) => tr.getMeta(blockIdKey))) return null
          if (!editor.isEditable) return null

          const transform = combineTransactionSteps(oldState.doc, transactions as Transaction[])
          const inverse = transform.mapping.invert()

          // The blocks this change touched, once each, in document order.
          const touched = new Map<number, Touched>()
          for (const { newRange } of getChangedRanges(transform)) {
            for (const { node, pos } of findChildrenInRange(newState.doc, newRange, (n) => types.has(n.type.name))) {
              if (touched.has(pos)) continue
              touched.set(pos, { node, pos, id: (node.attrs[BLOCK_ID_ATTR] as string | null) ?? null, isNew: inverse.mapResult(pos).deleted })
            }
          }
          if (!touched.size) return null
          const blocks = [...touched.values()].sort((a, b) => a.pos - b.pos)

          // What to give, by position.
          const give = new Map<number, string>()

          // An id two of them hold: a block split in two (both halves keep
          // its attributes) or a copy. One keeps it (keeperOf), the others
          // are new blocks with ids of their own.
          const holders = new Map<string, Touched[]>()
          for (const b of blocks) if (b.id) holders.set(b.id, [...(holders.get(b.id) ?? []), b])
          for (const [id, list] of holders) {
            if (list.length < 2) continue
            const keeper = keeperOf(id, list, oldState.doc, inverse)
            for (const b of list) if (b !== keeper) give.set(b.pos, generate())
          }

          // A block with none gets one: the one it had when the change only
          // rebuilt it in its place, while no other block holds it, else a new one.
          let had: Map<number, string> | undefined
          for (const b of blocks) {
            if (b.id) continue
            if (!had) had = idsBeforeRebuild(transactions)
            const id = had.get(b.pos)
            if (id && !holders.has(id)) {
              holders.set(id, [b])
              give.set(b.pos, id)
            } else give.set(b.pos, generate())
          }

          // A block this change brought in with an id may be a copy of one
          // elsewhere in the doc (a duplicated block). Rare, so only then is
          // the doc counted, once.
          const suspects = blocks.filter((b) => b.isNew && b.id && !give.has(b.pos) && holders.get(b.id)!.length === 1)
          if (suspects.length) {
            const count = new Map<string, number>()
            newState.doc.descendants((node, pos) => {
              const id = node.attrs[BLOCK_ID_ATTR]
              if (typeof id === "string" && types.has(node.type.name) && !give.has(pos)) count.set(id, (count.get(id) ?? 0) + 1)
              return !node.isTextblock
            })
            for (const b of suspects) if ((count.get(b.id!) ?? 0) > 1) give.set(b.pos, generate())
          }

          if (!give.size) return null
          const tr = newState.tr
          // Same-size changes: every position stays where it was.
          for (const [pos, id] of give) {
            const node = tr.doc.nodeAt(pos)
            if (node) tr.setNodeMarkup(pos, undefined, { ...node.attrs, [BLOCK_ID_ATTR]: id })
          }
          // An input rule's undo (⌘Z just after "## " made a heading) is kept
          // by the input-rules plugin until the next change, and this is part
          // of that change: it carries the undo on, or ⌘Z would lose it.
          for (const plugin of newState.plugins) {
            if (!(plugin.spec as { isInputRules?: boolean }).isInputRules) continue
            const undoable = plugin.getState(newState)
            if (undoable) tr.setMeta(plugin, undoable)
          }
          // Part of the change that caused it, in its undo step: y-prosemirror
          // writes the update to Yjs with its last transaction's history flag,
          // this one's, so flagged out it took Enter or a paste out of ⌘Z too.
          // Only a change kept out of history keeps its ids out.
          tr.setMeta(blockIdKey, true)
          if (!inHistory(transactions)) tr.setMeta("addToHistory", false)
          return tr
        },
      }),
    ]
  },
})
