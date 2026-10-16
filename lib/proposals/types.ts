/**
 * Edit proposals: a change offered for review before it applies (docs
 * programme, PROGRAM.md §4 #19 and D-10; A9 builds lib/proposals and the review
 * UI).
 *
 * One model serves people's suggestions, inline AI and agents. An inline AI
 * rewrite is an ephemeral proposal: it lives in the tab and is shown as ghost
 * text and a word diff, and nothing reaches the doc, or another tab, until it is
 * accepted. A persisted proposal lives on the server (/proposals). Accepting
 * applies the chosen hunks as one transaction with one undo; a hunk whose text
 * changed since can only be inserted below.
 *
 * The JSON matches the API's Proposal (business/Proposal). The diff and the
 * apply are core.js, shared byte for byte with the collaboration service.
 */

import type { JSONContent } from '@tiptap/core'
import type { Anchor } from '@/lib/anchors/types'

export type ProposalAuthorKind = 'person' | 'agent' | 'ai'

export type ProposalStatus = 'open' | 'accepted' | 'partial' | 'declined' | 'stale' | 'withdrawn'

/** One reviewable piece of a proposal. */
export interface ProposalHunk {
  id: string
  op: 'insert' | 'delete' | 'replace'
  /** Whole blocks ('block'), or words inside one block ('inline'). */
  level: 'block' | 'inline'
  /** Child indices down from the target to the node it changes. */
  path: number[]
  /** Child indices there (block), or offsets into the block's text (inline). */
  from: number
  to: number
  /** The content as codec JSON (lib/codec): arrays of blocks or inline nodes. */
  before?: JSONContent[]
  after?: JSONContent[]
  /** Yjs relative positions of its two ends, base64. */
  start?: string
  end?: string
  decision?: '' | 'accepted' | 'declined'
  decided_by?: string
  decided_at?: string
}

/** A proposal kept on the server. */
export interface EditProposal {
  id: string
  resource_kind: string
  resource_uuid: string
  thread_id?: string
  anchor: Anchor
  /** The hash of the content the proposal was made against (base). */
  base_hash: string
  base?: JSONContent[]
  proposed: JSONContent[]
  hunks: ProposalHunk[]
  note?: string
  author_kind: ProposalAuthorKind
  author_uuid: string
  /** For an agent: the person who asked it. */
  asker_uuid?: string
  run_id?: string
  status: ProposalStatus
  applied_mode?: 'replace' | 'insert_below'
  decided_by?: string
  decided_at?: string
  created_at: string
  updated_at?: string
}

/** An inline AI rewrite before it is accepted: it lives only in this tab. */
export interface EphemeralProposal {
  id: string
  anchor: Anchor
  base_hash: string
  base: JSONContent[]
  proposed: JSONContent[]
  hunks: ProposalHunk[]
}

/** One piece of a word diff, for the review view. */
export interface DiffPart {
  kind: 'same' | 'insert' | 'delete'
  text: string
}
