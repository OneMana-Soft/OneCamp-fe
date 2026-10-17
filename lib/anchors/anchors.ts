/**
 * Anchors on a live doc (docs programme A8; types in ./types).
 *
 * A range is kept as two Yjs relative positions on the doc's `default`
 * fragment, made against the lineage the doc has now, plus the text it covers.
 * Relative positions follow their characters through every edit anyone makes,
 * so a thread stays on its words while people type around it. They are read
 * back only against the live Yjs doc, never against HTML or saved offsets.
 *
 * Detached, never moved (D-9):
 * - the words were deleted: the range collapses (or its characters are gone);
 * - the doc is another lineage (rebuilt from its saved HTML, or restored): the
 *   positions name characters that copy doesn't have.
 * A detached anchor keeps its quote. findReattachCandidates offers exact
 * matches of the quote; only someone's choice of one ("Reattach here") makes a
 * new anchor, sent to the API's reanchor.
 *
 * LINEAGE. Today a doc's lineage is the epoch the collaboration server stamps in
 * the Yjs doc's `meta` map when it rebuilds a doc from its HTML (W0-1,
 * collaboration-service/lineage.js); a doc never rebuilt has none (''). When A4
 * moves the lineage elsewhere (the auth reply, the doc session), callers pass
 * it in, and lineageOf stays the fallback.
 */

import * as Y from 'yjs'
import { absolutePositionToRelativePosition, relativePositionToAbsolutePosition, ySyncPluginKey } from 'y-prosemirror'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import type { Anchor, ReattachCandidate, ResolvedAnchor } from './types'

/** The live doc an editor is bound to: what y-prosemirror's sync plugin holds. */
export interface YBinding {
  doc: Y.Doc
  type: Y.XmlFragment
  /** y-prosemirror's map from Yjs types to the editor's nodes. */
  mapping: Map<Y.AbstractType<unknown>, unknown>
}

/** The quote a thread keeps is cut at this many characters. */
const MAX_QUOTE = 10000

/** The binding of an editor's state, or null when it isn't collaborative (or not yet). */
export function bindingOf(state: EditorState): YBinding | null {
  const sync = ySyncPluginKey.getState(state) as { binding?: { doc: Y.Doc; type: Y.XmlFragment; mapping: YBinding['mapping'] } } | undefined
  const b = sync?.binding
  return b && b.doc && b.type && b.mapping ? { doc: b.doc, type: b.type, mapping: b.mapping } : null
}

/** The doc's lineage today ('' for a doc that was never rebuilt). */
export function lineageOf(doc: Y.Doc): string {
  const epoch = doc.getMap('meta').get('epoch')
  return typeof epoch === 'string' ? epoch : ''
}

/** Standard padded base64 of bytes: what the API's []byte JSON reads. */
export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

export function fromBase64(s: string): Uint8Array {
  const raw = atob(s)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** The text a leaf inline node (a mention, a chip) stands for in a quote. */
function leafText(node: PMNode): string {
  const own = node.type.spec.leafText
  if (own) return own(node)
  const label = (node.attrs as Record<string, unknown> | null)?.label
  return typeof label === 'string' ? label : ''
}

/** The text between two positions, as a thread quotes it: blocks on their own lines. */
export function quoteOf(doc: PMNode, from: number, to: number): string {
  return doc.textBetween(from, to, '\n', leafText).slice(0, MAX_QUOTE)
}

/**
 * The anchor for a range of the editor's doc (a selection), made against the
 * live Yjs doc and its lineage. The start keeps to the first character and the
 * end to the last, so typing just outside the range stays outside it.
 */
export function anchorFor(b: YBinding, doc: PMNode, from: number, to: number, lineage = lineageOf(b.doc)): Anchor {
  if (!(from < to)) throw new Error('An anchor needs a range with something in it')
  const start = absolutePositionToRelativePosition(from, b.type, b.mapping as never) as Y.RelativePosition
  const endRight = absolutePositionToRelativePosition(to, b.type, b.mapping as never) as Y.RelativePosition
  const at = Y.createAbsolutePositionFromRelativePosition(endRight, b.doc)
  const end = at ? Y.createRelativePositionFromTypeIndex(at.type, at.index, -1) : endRight
  const anchor: Anchor = {
    kind: 'yrange',
    start: toBase64(Y.encodeRelativePosition(start)),
    end: toBase64(Y.encodeRelativePosition(end)),
    lineage,
    quote: quoteOf(doc, from, to),
  }
  const block = doc.resolve(from).node(1)
  const blockId = (block?.attrs as Record<string, unknown> | undefined)?.blockId
  if (typeof blockId === 'string' && blockId) anchor.block_id = blockId
  return anchor
}

/**
 * Where an anchor is in the doc now. b is null while the editor isn't bound,
 * and synced false until the doc has synced with the server: both are
 * 'pending', never detached (a block anchor needs no binding, but an unsynced
 * doc may not hold its block yet). lineage defaults to the doc's own.
 */
export function resolveAnchor(
  b: YBinding | null,
  doc: PMNode,
  anchor: Anchor,
  opts: { synced?: boolean; lineage?: string; blocks?: ReadonlyMap<string, BlockRange> } = {},
): ResolvedAnchor {
  if (anchor.kind === 'block') return opts.synced === false ? { state: 'pending' } : resolveBlock(doc, anchor, opts.blocks)
  if (anchor.kind !== 'yrange') return { state: 'page' }
  if (!b || opts.synced === false) return { state: 'pending' }
  const quote = anchor.quote ?? ''
  const lineage = opts.lineage ?? lineageOf(b.doc)
  if ((anchor.lineage ?? '') !== lineage) return { state: 'detached', reason: 'lineage', quote }
  if (!anchor.start || !anchor.end) return { state: 'detached', reason: 'deleted', quote }
  let from: number | null
  let to: number | null
  try {
    from = relativePositionToAbsolutePosition(b.doc, b.type, Y.decodeRelativePosition(fromBase64(anchor.start)), b.mapping as never)
    to = relativePositionToAbsolutePosition(b.doc, b.type, Y.decodeRelativePosition(fromBase64(anchor.end)), b.mapping as never)
  } catch {
    // The editor hasn't caught up with the doc (its mapping lacks a node):
    // ask again on the next change.
    return { state: 'pending' }
  }
  if (from === null || to === null || !(from < to) || to > doc.content.size) {
    return { state: 'detached', reason: 'deleted', quote }
  }
  return { state: 'attached', from, to }
}

/** Where a block is: its words, or the whole node when it has none of its own. */
export interface BlockRange {
  from: number
  to: number
}

/**
 * The blocks a block anchor is on, in the order they were chosen: its own, then
 * any chosen with it (meta.block_ids: the block menu's Comment on several
 * blocks, B7). Only these, never what lies between blocks chosen apart.
 */
export function blockIdsOf(anchor: Anchor): string[] {
  if (anchor.kind !== 'block') return []
  const ids = anchor.block_id ? [anchor.block_id] : []
  const listed = anchor.meta?.block_ids
  if (Array.isArray(listed)) {
    for (const id of listed) if (typeof id === 'string' && id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

/**
 * Where each of these blocks is now, in the doc's order, from one walk of its
 * blocks (never their words), a block inside another (a list's item) included.
 * A block with words is its words; one with none of its own (a picture, a
 * divider, an empty line) is the whole node, so the range is never empty and
 * isn't taken for deleted words when the doc is next edited (B7).
 */
export function blockRanges(doc: PMNode, ids: Iterable<string>): Map<string, BlockRange> {
  const wanted = new Set(ids)
  const found = new Map<string, BlockRange>()
  if (wanted.size === 0) return found
  doc.descendants((node, pos) => {
    if (found.size === wanted.size || node.isInline) return false
    const id = (node.attrs as Record<string, unknown>).blockId
    if (typeof id === 'string' && wanted.has(id) && !found.has(id)) {
      found.set(id, node.content.size > 0 ? { from: pos + 1, to: pos + node.nodeSize - 1 } : { from: pos, to: pos + node.nodeSize })
    }
    return !node.isTextblock
  })
  return found
}

/**
 * A block anchor: attached while any of its blocks is in the doc, at the first
 * of them there; detached (deleted) once none is. blocks is where they are,
 * when the caller has found every anchor's blocks in one walk.
 */
function resolveBlock(doc: PMNode, anchor: Anchor, blocks?: ReadonlyMap<string, BlockRange>): ResolvedAnchor {
  const ids = blockIdsOf(anchor)
  const at = blocks ?? blockRanges(doc, ids)
  let first: BlockRange | undefined
  for (const id of ids) {
    const r = at.get(id)
    if (r && (!first || r.from < first.from)) first = r
  }
  return first ? { state: 'attached', from: first.from, to: first.to } : { state: 'detached', reason: 'deleted', quote: anchor.quote ?? '' }
}

interface Segment {
  /** Where it starts in the flat text. */
  flat: number
  /** Where it starts in the doc. */
  pos: number
  len: number
  leaf: boolean
}

/** The doc's text as quoteOf reads it, and where each piece of it is. */
function flatten(doc: PMNode): { text: string; segments: Segment[] } {
  let text = ''
  let first = true
  const segments: Segment[] = []
  doc.descendants((node, pos) => {
    const nodeText = node.isText ? node.text ?? '' : node.isLeaf ? leafText(node) : ''
    if (node.isBlock && ((node.isLeaf && nodeText) || node.isTextblock)) {
      if (first) first = false
      else text += '\n'
    }
    if (nodeText) {
      segments.push({ flat: text.length, pos, len: nodeText.length, leaf: !node.isText })
      text += nodeText
    }
    return true
  })
  return { text, segments }
}

/**
 * Where an exact match of a detached anchor's quote sits now, in document
 * order: offered as "Reattach here", never applied. Exact means the same
 * characters, case and all; a match can run across blocks as the quote did,
 * but never starts or ends inside a chip.
 */
export function findReattachCandidates(doc: PMNode, quote: string, max = 20): ReattachCandidate[] {
  if (!quote) return []
  const { text, segments } = flatten(doc)
  const startAt = (i: number) => {
    const s = segments.find((g) => g.flat <= i && i < g.flat + g.len)
    if (!s || (s.leaf && i !== s.flat)) return null
    return s.pos + (s.leaf ? 0 : i - s.flat)
  }
  const endAt = (e: number) => {
    const s = segments.find((g) => g.flat < e && e <= g.flat + g.len)
    if (!s || (s.leaf && e !== s.flat + s.len)) return null
    return s.leaf ? s.pos + 1 : s.pos + (e - s.flat)
  }
  const out: ReattachCandidate[] = []
  for (let i = text.indexOf(quote); i !== -1 && out.length < max; i = text.indexOf(quote, i + 1)) {
    const from = startAt(i)
    const to = endAt(i + quote.length)
    if (from !== null && to !== null && from < to) out.push({ from, to })
  }
  return out
}
