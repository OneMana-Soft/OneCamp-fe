/**
 * B1's rules: a block's indent (0–8, `data-indent`) and its text direction
 * ("ltr" or "rtl", `dir`; none is automatic). The same as the API's
 * business/ContentCodec/block_layout.go. Columns are nodes of their own
 * (schema.ts): HTML keeps them, Markdown writes their blocks in order.
 */

import type { GlobalAttr } from './globalAttrs'

/** The blocks Tab nests (the editor's extensions/block-commands/nodes.ts). */
const INDENT_NODES = ['blockquote', 'bulletList', 'callout', 'chartEmbed', 'codeBlock', 'collapsible', 'diffEmbed', 'heading', 'horizontalRule', 'image', 'orderedList', 'paragraph', 'poll', 'recordingEmbed', 'tableEmbed', 'taskList']

/** The blocks with a direction of their own. */
const DIR_NODES = ['blockquote', 'bulletList', 'callout', 'collapsible', 'heading', 'orderedList', 'paragraph', 'taskList']

const MAX_INDENT = 8

function indentOf(v: unknown): number {
  const n = typeof v === 'number' ? Math.trunc(v) : typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? parseInt(v, 10) : 0
  return Math.max(0, Math.min(MAX_INDENT, n))
}

const dirOf = (v: unknown) => (v === 'ltr' || v === 'rtl' ? v : null)

export const BLOCK_LAYOUT_ATTRS: GlobalAttr[] = [
  {
    name: 'indent',
    html: 'data-indent',
    on: INDENT_NODES,
    def: 0,
    typed: indentOf,
    // Another tool's data-indent means something else.
    read: (raw, foreign) => (foreign ? 0 : indentOf(raw)),
    write: (v) => (indentOf(v) > 0 ? String(indentOf(v)) : ''),
  },
  {
    name: 'dir',
    html: 'dir',
    on: DIR_NODES,
    def: null,
    typed: dirOf,
    // Pasted text marked left to right (Google Docs marks every line so) is
    // left to its letters; one marked right to left keeps that.
    read: (raw, foreign) => {
      const d = dirOf(raw.trim().toLowerCase())
      return foreign && d === 'ltr' ? null : d
    },
    write: (v) => dirOf(v) ?? '',
  },
]
