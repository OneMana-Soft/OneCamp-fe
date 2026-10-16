"use client"

/**
 * Proposals in the editor: a change shown for review, never written until it is
 * accepted (docs programme A9, D-10).
 *
 * What a proposal would remove is struck through in the danger tint; what it
 * would add is drawn beside it as ghost text in the agent tint. All of it is
 * decoration: the doc does not change, so another tab, and the server, see
 * nothing until Accept. Accept applies the chosen changes as one transaction,
 * so one ⌘Z takes them back; Discard leaves the doc exactly as it was.
 *
 * Places are carried through this tab's edits by the transaction's mapping,
 * and found again from their Yjs positions when another tab's edit arrives (it
 * comes as a swap of the whole doc, which maps nothing). The work is bounded by
 * the proposals' own size: no walk of the doc per key.
 */

import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { DOMSerializer, Fragment } from '@tiptap/pm/model'
import { checkPlace, nodesFromJSON } from '@/lib/proposals/core'
import {
  acceptIn,
  insertBelowIn,
  retrack,
  type AcceptResult,
  type Tracked,
} from '@/lib/proposals/review'
import type { ProposalHunk } from '@/lib/proposals/types'

export interface ProposalsState {
  /** The proposals under review in this editor, by id. */
  active: Record<string, Tracked>
  /**
   * What is drawn, built when the doc or the proposals change and kept: a
   * selection move or a focus change of the view draws nothing new.
   */
  decos: DecorationSet | null
  /** The one the review bar is on. */
  focus: string | null
  /** The change within it that is picked, for per-change accept. */
  focusHunk: string | null
}

type Meta =
  | { type: 'show'; tracked: Tracked; focus?: boolean }
  | { type: 'drop'; id: string }
  | { type: 'focus'; id: string | null; hunk?: string | null }
  | { type: 'decided'; id: string; hunks: string[]; decision: 'accepted' | 'declined' }

export const proposalsKey = new PluginKey<ProposalsState>('proposals')

const EMPTY: ProposalsState = { active: {}, decos: null, focus: null, focusHunk: null }

function reduce(value: ProposalsState, tr: Transaction, before: EditorState, state: EditorState): ProposalsState {
  const next = step(value, tr, before, state)
  if (next === value && !(tr.docChanged && value.decos)) return value
  const decos = Object.keys(next.active).length ? decorationsOf(state, next) : null
  return { ...next, decos }
}

function step(value: ProposalsState, tr: Transaction, before: EditorState, state: EditorState): ProposalsState {
  let next = value
  if (tr.docChanged && Object.keys(value.active).length) {
    const active: Record<string, Tracked> = {}
    for (const [id, t] of Object.entries(value.active)) active[id] = retrack(t, tr, state, before)
    next = { ...value, active }
  }
  const meta = tr.getMeta(proposalsKey) as Meta | undefined
  if (!meta) return next
  switch (meta.type) {
    case 'show': {
      const id = meta.tracked.proposal.id
      const focus = meta.focus === false && next.focus ? next.focus : id
      return { ...next, active: { ...next.active, [id]: meta.tracked }, focus, focusHunk: focus === next.focus ? next.focusHunk : null }
    }
    case 'drop': {
      const active = { ...next.active }
      delete active[meta.id]
      const focus = next.focus === meta.id ? (Object.keys(active)[0] ?? null) : next.focus
      return { ...next, active, focus, focusHunk: focus === next.focus ? next.focusHunk : null }
    }
    case 'focus':
      return { ...next, focus: meta.id, focusHunk: meta.hunk ?? null }
    case 'decided': {
      const t = next.active[meta.id]
      if (!t) return next
      const hunks = t.proposal.hunks.map((h) => (meta.hunks.includes(h.id) ? { ...h, decision: meta.decision } : h))
      const open = hunks.filter((h) => !h.decision)
      if (open.length === 0) {
        const active = { ...next.active }
        delete active[meta.id]
        const focus = next.focus === meta.id ? (Object.keys(active)[0] ?? null) : next.focus
        return { ...next, active, focus, focusHunk: null }
      }
      const proposal = { ...t.proposal, hunks } as Tracked['proposal']
      return {
        ...next,
        active: { ...next.active, [meta.id]: { ...t, proposal } },
        focusHunk: next.focusHunk && meta.hunks.includes(next.focusHunk) ? open[0].id : next.focusHunk,
      }
    }
  }
  return next
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function ghost(state: EditorState, hunk: ProposalHunk, focused: boolean): HTMLElement {
  const block = hunk.level === 'block'
  const el = document.createElement(block ? 'div' : 'span')
  el.className = `oc-proposal-ins${block ? ' oc-proposal-ins-block' : ''}${focused ? ' is-focused' : ''}`
  el.setAttribute('data-hunk', hunk.id)
  el.setAttribute('contenteditable', 'false')
  // The text is for eyes: a screen reader hears the review bar's summary.
  el.setAttribute('aria-hidden', 'true')
  const content = Fragment.fromArray(nodesFromJSON(state.schema, hunk.after ?? []))
  el.appendChild(DOMSerializer.fromSchema(state.schema).serializeFragment(content))
  return el
}

function decorationsOf(state: EditorState, value: ProposalsState): DecorationSet {
  const decos: Decoration[] = []
  for (const [id, t] of Object.entries(value.active)) {
    const isFocus = value.focus === id
    for (const h of t.proposal.hunks) {
      if (h.decision) continue
      const place = t.places[h.id]
      // A change whose text moved on is not drawn where it no longer fits.
      if (!place || !checkPlace(state.doc, place, h)) continue
      const focused = isFocus && value.focusHunk === h.id
      const cls = `${focused ? ' is-focused' : ''}${isFocus ? '' : ' is-quiet'}`
      if (place.from < place.to) {
        if (h.level === 'inline') {
          decos.push(Decoration.inline(place.from, place.to, { class: `oc-proposal-del${cls}`, 'data-hunk': h.id }))
        } else {
          state.doc.nodesBetween(place.from, place.to, (node, pos) => {
            if (pos >= place.from && pos + node.nodeSize <= place.to) {
              decos.push(Decoration.node(pos, pos + node.nodeSize, { class: `oc-proposal-del-block${cls}`, 'data-hunk': h.id }))
            }
            return false
          })
        }
      }
      if ((h.after ?? []).length) {
        decos.push(
          Decoration.widget(place.to, () => ghost(state, h, focused), {
            side: h.level === 'block' ? -1 : 1,
            key: `${id}:${h.id}:${focused ? 1 : 0}`,
            ignoreSelection: true,
            marks: [],
          }),
        )
      }
    }
  }
  return DecorationSet.create(state.doc, decos)
}

export const Proposals = Extension.create({
  name: 'proposals',

  addProseMirrorPlugins() {
    return [
      new Plugin<ProposalsState>({
        key: proposalsKey,
        state: {
          init: () => EMPTY,
          apply: (tr, value, old, state) => reduce(value, tr, old, state),
        },
        props: {
          decorations(state) {
            return proposalsKey.getState(state)?.decos ?? null
          },
          // Clicking a change picks it, for per-change accept.
          handleClick(view, _pos, event) {
            const el = (event.target as HTMLElement | null)?.closest?.('[data-hunk]')
            const value = proposalsKey.getState(view.state)
            if (!el || !value?.focus) return false
            view.dispatch(view.state.tr.setMeta(proposalsKey, { type: 'focus', id: value.focus, hunk: el.getAttribute('data-hunk') }))
            return false
          },
        },
      }),
    ]
  },
})

// ---------------------------------------------------------------------------
// What the review bar and the producers call
// ---------------------------------------------------------------------------

export const proposalsOf = (state: EditorState): ProposalsState => proposalsKey.getState(state) ?? EMPTY

/** showProposal puts a proposal under review (or updates one, as a stream grows). */
export function showProposal(editor: Editor, tracked: Tracked, opts: { focus?: boolean } = {}) {
  editor.view.dispatch(editor.state.tr.setMeta(proposalsKey, { type: 'show', tracked, focus: opts.focus } satisfies Meta))
}

/** discardProposal stops reviewing it. Nothing in the doc changes. */
export function discardProposal(editor: Editor, id: string) {
  editor.view.dispatch(editor.state.tr.setMeta(proposalsKey, { type: 'drop', id } satisfies Meta))
}

export function focusProposal(editor: Editor, id: string | null, hunk: string | null = null) {
  editor.view.dispatch(editor.state.tr.setMeta(proposalsKey, { type: 'focus', id, hunk } satisfies Meta))
}

/** markDecided records hunks decided elsewhere (declined, or accepted on the server). */
export function markDecided(editor: Editor, id: string, hunks: string[], decision: 'accepted' | 'declined') {
  editor.view.dispatch(editor.state.tr.setMeta(proposalsKey, { type: 'decided', id, hunks, decision } satisfies Meta))
}

/**
 * acceptProposal applies the chosen changes (all open ones when none are named)
 * as one transaction. All or nothing: the ones whose text moved on come back as
 * conflicts and nothing is applied.
 */
export function acceptProposal(editor: Editor, id: string, ids?: string[]): AcceptResult {
  const tracked = proposalsOf(editor.state).active[id]
  if (!tracked) return { applied: [], conflicts: [] }
  const result = acceptIn(editor.state, (tr) => editor.view.dispatch(tr), tracked, ids)
  if (result.applied.length) markDecided(editor, id, result.applied, 'accepted')
  return result
}

/** insertProposalBelow puts the proposed blocks below the target, and ends the review. */
export function insertProposalBelow(editor: Editor, id: string): boolean {
  const tracked = proposalsOf(editor.state).active[id]
  if (!tracked) return false
  if (!insertBelowIn(editor.state, (tr) => editor.view.dispatch(tr), tracked)) return false
  discardProposal(editor, id)
  return true
}
