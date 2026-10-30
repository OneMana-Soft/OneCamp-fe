/**
 * Edit proposals in an editor: make one from a replacement, find its hunks as
 * the doc moves on, and accept them as one transaction with one undo (docs
 * programme A9, D-10).
 *
 * The diff, the places and the apply are core.js, the same file the
 * collaboration service runs, so a proposal accepted here and one accepted from
 * a list on the server leave the same doc. This file is the editor's side: the
 * Yjs binding of a shared doc, the transaction, and undo.
 */

import { Fragment, Slice, type Node as PMNode } from '@tiptap/pm/model'
import { Transform } from '@tiptap/pm/transform'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'
import type * as Y from 'yjs'
import type { JSONContent } from '@tiptap/core'
import {
  checkPlace,
  diffBlocks,
  encodePlaces,
  encodeTarget,
  insertBelow,
  locate,
  nodesKey,
  placeIn,
  proposalFromReplacement,
  resolveRelative,
  validHunks,
  nodesFromJSON,
  type Range,
  type YMapping,
} from './core'
import type { EditProposal, EphemeralProposal, ProposalHunk } from './types'
import { KEEP_PAGES } from '@/components/minimal-tiptap/extensions/subpage/keepPages'

/** A shared doc's Yjs side, as the editor's sync plugin holds it. */
interface YBinding {
  ydoc: Y.Doc
  fragment: Y.XmlFragment
  mapping: YMapping
}

interface PluginLike {
  key: string
  getState(state: EditorState): unknown
}

const pluginNamed = (state: EditorState, prefix: string) =>
  (state.plugins as unknown as PluginLike[]).find((p) => typeof p.key === 'string' && p.key.startsWith(prefix))

/** The editor's Yjs binding, when it edits a shared doc (y-prosemirror's sync plugin). */
export function yBindingOf(state: EditorState): YBinding | null {
  const sync = pluginNamed(state, 'y-sync$')?.getState(state) as
    | { doc?: Y.Doc; type?: Y.XmlFragment; binding?: { mapping?: YMapping } }
    | undefined
  if (!sync?.doc || !sync.type || !sync.binding?.mapping) return null
  return { ydoc: sync.doc, fragment: sync.type, mapping: sync.binding.mapping }
}

/**
 * Whether a transaction came from another tab, through Yjs: y-prosemirror marks
 * its own with isChangeOrigin under its plugin key ('y-sync$', numbered when
 * there are several), which ProseMirror keeps in the transaction's meta.
 */
/**
 * Marks the write of an accepted (or inserted-below) proposal: the one write
 * an editor that is suggesting makes (suggest-mode), carried by that
 * transaction alone, so nothing else passes while an accept waits.
 */
export const DECISION_WRITE = 'proposalDecisionWrite'
export const isDecisionWrite = (tr: Transaction) => tr.getMeta(DECISION_WRITE) === true

export function isRemote(tr: Transaction): boolean {
  const meta = (tr as unknown as { meta?: Record<string, unknown> }).meta ?? {}
  for (const key of Object.keys(meta)) {
    if (key.startsWith('y-sync$') && (meta[key] as { isChangeOrigin?: boolean } | undefined)?.isChangeOrigin) return true
  }
  return false
}

const lineageOf = (b: YBinding | null) => {
  if (!b) return undefined
  const meta = b.ydoc.getMap('meta')
  const v = meta.get('lineage') ?? meta.get('epoch')
  return typeof v === 'string' ? v : undefined
}

let seq = 0
const newId = () => `p-${Date.now().toString(36)}-${(seq++).toString(36)}`

/** What the editor tracks for a proposal under review. */
export interface Tracked {
  proposal: EphemeralProposal | EditProposal
  /** The target's place now, or null when it is gone. */
  range: Range | null
  /** Each undecided hunk's place now (null when it could not be found). */
  places: Record<string, Range | null>
}

/**
 * proposeReplacement is the proposal that replacing from..to with `content`
 * makes: an AI rewrite of a selection, a line typed in suggesting mode. Nothing
 * in the doc changes.
 */
export function proposeReplacement(
  state: EditorState,
  from: number,
  to: number,
  content: Fragment | Slice | JSONContent[],
): Tracked | null {
  const schema = state.schema
  const slice =
    content instanceof Slice
      ? content
      : new Slice(content instanceof Fragment ? content : Fragment.fromArray(nodesFromJSON(schema, content)), 0, 0)
  const { target, base, proposed } = proposalFromReplacement(new Transform(state.doc), from, to, slice)
  return proposalFor(state, target, base, proposed)
}

/** proposalFor is the proposal that turns the target's blocks into `proposed`. */
function proposalFor(state: EditorState, target: Range, base: PMNode[], proposed: PMNode[]): Tracked | null {
  let hunks = diffBlocks(base, proposed)
  if (hunks.length === 0) return null
  const binding = yBindingOf(state)
  let anchor: EphemeralProposal['anchor'] = { kind: 'none' }
  if (binding) {
    hunks = encodePlaces(binding.fragment, state.doc, target.from, base, hunks)
    const ends = encodeTarget(binding.fragment, state.doc, target)
    anchor = { kind: 'yrange', start: ends.start, end: ends.end, lineage: lineageOf(binding) }
  }
  const firstId = base[0]?.attrs?.blockId
  if (typeof firstId === 'string') anchor.block_id = firstId
  anchor.quote = base.map((b) => b.textContent).join('\n').slice(0, 2000)
  const proposal: EphemeralProposal = {
    id: newId(),
    anchor,
    base_hash: '',
    base: base.map((b) => b.toJSON()),
    proposed: proposed.map((b) => b.toJSON()),
    hunks,
  }
  const places: Record<string, Range | null> = {}
  for (const h of hunks) places[h.id] = placeIn(target.from, base, h)
  return { proposal, range: target, places }
}

/**
 * trackOpen finds a proposal made elsewhere (a teammate's, an agent's) in the
 * doc as it is now: its target by its anchor, each hunk exactly where the base
 * still stands, else by its own positions.
 */
export function trackOpen(
  state: EditorState,
  proposal: EditProposal | EphemeralProposal,
  binding: YBinding | null = yBindingOf(state),
): Tracked {
  const resolve = binding
    ? (e: string) => resolveRelative(binding.ydoc, binding.fragment, binding.mapping, e)
    : null
  const lost = !!proposal.anchor.lineage && !!lineageOf(binding) && proposal.anchor.lineage !== lineageOf(binding)
  let range: Range | null = null
  if (resolve && !lost && proposal.anchor.start && proposal.anchor.end) {
    const from = resolve(proposal.anchor.start)
    const to = resolve(proposal.anchor.end)
    if (from !== null && to !== null && from <= to) range = { from, to }
  }
  const open = proposal.hunks.filter((h) => !h.decision)
  const found = locate(state.doc, range, proposal.base, open, null, lost ? null : resolve)
  const places: Record<string, Range | null> = {}
  for (const h of open) places[h.id] = null
  for (const p of found.placed) places[p.hunk.id] = { from: p.from, to: p.to }
  return { proposal, range, places }
}

/**
 * retrack carries a tracked proposal through a transaction. `before` is the
 * state the transaction applies to: inside a plugin's apply, the new state's
 * later plugins have no state yet, so the Yjs binding is read from before (it
 * is one object, kept up to date by the sync plugin).
 */
export function retrack(tracked: Tracked, tr: Transaction, state: EditorState, before: EditorState = state): Tracked {
  if (!tr.docChanged) return tracked
  // Another tab's change arrives as a swap of the whole doc, which maps nothing:
  // find everything again from its Yjs positions.
  if (isRemote(tr)) return trackOpen(state, tracked.proposal, yBindingOf(before))
  const map = (r: Range | null): Range | null => {
    if (!r) return null
    const from = tr.mapping.map(r.from, r.from === r.to ? -1 : 1)
    const to = tr.mapping.map(r.to, -1)
    return from <= to ? { from, to } : { from: to, to }
  }
  const places: Record<string, Range | null> = {}
  for (const [id, r] of Object.entries(tracked.places)) places[id] = map(r)
  return { ...tracked, range: map(tracked.range), places }
}

/** The hunks of a tracked proposal that can apply now, with their places. */
export function applicable(state: EditorState, tracked: Tracked, ids?: string[]) {
  const want = ids && ids.length ? new Set(ids) : null
  const placed: { hunk: ProposalHunk; from: number; to: number }[] = []
  const conflicts: string[] = []
  for (const h of tracked.proposal.hunks) {
    if (h.decision || (want && !want.has(h.id))) continue
    const place = tracked.places[h.id] ?? null
    if (place && checkPlace(state.doc, place, h)) placed.push({ hunk: h, from: place.from, to: place.to })
    else conflicts.push(h.id)
  }
  return { placed, conflicts }
}

/** Undo in a shared doc is Yjs's: each accept is its own step, not merged with typing around it. */
function separateUndo(state: EditorState) {
  const undo = pluginNamed(state, 'y-undo$')?.getState(state) as { undoManager?: { stopCapturing(): void } } | undefined
  undo?.undoManager?.stopCapturing()
}

export interface AcceptResult {
  applied: string[]
  conflicts: string[]
}

/**
 * acceptIn applies the chosen hunks (all open ones when none are named) in one
 * transaction, so one ⌘Z takes all of them back. All or nothing: when any of
 * them no longer fits, nothing is applied and they come back as conflicts.
 */
export function acceptIn(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  tracked: Tracked,
  ids?: string[],
): AcceptResult {
  const { placed, conflicts } = applicable(state, tracked, ids)
  if (conflicts.length || placed.length === 0) return { applied: [], conflicts }
  const tr = state.tr
  try {
    // A proposal whose content this editor's schema cannot hold (made by a
    // newer editor) is a conflict, not an error.
    if (!validHunks(nodesFromJSON(state.schema, tracked.proposal.base ?? []), placed.map((p) => p.hunk))) {
      return { applied: [], conflicts: placed.map((p) => p.hunk.id) }
    }
    const ordered = [...placed].sort((a, b) => b.from - a.from || b.to - a.to)
    for (const p of ordered) {
      tr.replaceWith(p.from, p.to, Fragment.fromArray(nodesFromJSON(state.schema, p.hunk.after ?? [])))
    }
  } catch {
    return { applied: [], conflicts: placed.map((p) => p.hunk.id) }
  }
  separateUndo(state)
  // The agent rewrote the text: a page whose block a hunk drops stays a child (docs C7a).
  dispatch(closeHistory(tr).setMeta('addToHistory', true).setMeta(KEEP_PAGES, true).scrollIntoView())
  separateUndo(state)
  return { applied: placed.map((p) => p.hunk.id), conflicts: [] }
}

/** insertBelowIn puts the proposed blocks below the target, or where it was. */
export function insertBelowIn(state: EditorState, dispatch: (tr: Transaction) => void, tracked: Tracked): boolean {
  const tr = state.tr
  const at = tracked.range ? tracked.range.to : state.doc.content.size
  if (insertBelow(tr, at, tracked.proposal.proposed) === null) return false
  separateUndo(state)
  dispatch(closeHistory(tr).scrollIntoView())
  separateUndo(state)
  return true
}

/** baseHash is the hash the server keeps for a proposal's base. */
export async function baseHash(base: JSONContent[], state: EditorState): Promise<string> {
  const key = nodesKey(nodesFromJSON(state.schema, base))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
