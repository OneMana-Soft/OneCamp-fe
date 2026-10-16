/**
 * Anchor decorations (docs programme A8): draws the anchored threads a doc
 * shows as highlights on their words. Decorations, never marks: a commenter's
 * socket is read-only, marks would land in history and in exports, and a
 * highlight is the viewer's, not the doc's (I5).
 *
 * Whoever shows threads (B7) hands in the ones to draw, open ones only for
 * the cost (setThreadAnchors), and hears where each one is now (onResolve):
 * attached, detached (deleted, or another lineage) or pending. A thread on
 * several blocks chosen together is drawn on each of them, never on what lies
 * between; a block with no words (a picture) is outlined.
 *
 * Cost (I20): on your own edits the highlights move with the transaction's
 * mapping, with no walk of the doc. A remote change replaces the editor's doc
 * wholesale (y-prosemirror), so then each anchor is read again from its Yjs
 * relative positions; so is a change of anchors, lineage or sync. Remote
 * transactions are only read, never answered with one (I6).
 */

import { Extension } from '@tiptap/core'
import { isChangeOrigin } from '@tiptap/extension-collaboration'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { bindingOf, blockIdsOf, blockRanges, resolveAnchor, type BlockRange } from '@/lib/anchors/anchors'
import type { Anchor, ResolvedAnchor } from '@/lib/anchors/types'

/** One thread to draw. */
export interface ThreadAnchor {
  id: string
  anchor: Anchor
  /** The thread being looked at, drawn stronger. */
  active?: boolean
}

interface AnchorsState {
  anchors: ThreadAnchor[]
  /** Whether the doc has synced with the server; until then all are pending. */
  synced: boolean
  /** The doc's lineage when the doc session knows it; else the Yjs doc's own. */
  lineage?: string
  resolved: Map<string, ResolvedAnchor>
  decorations: DecorationSet
}

interface AnchorsMeta {
  anchors?: ThreadAnchor[]
  synced?: boolean
  lineage?: string
}

export const anchorDecorationsKey = new PluginKey<AnchorsState>('anchorDecorations')

/**
 * One highlight: words take a tint; a block with none of its own (a picture, a
 * divider, an empty line) is outlined whole, as a tint on no words shows nothing.
 */
function mark(doc: PMNode, from: number, to: number, a: ThreadAnchor): Decoration {
  const node = doc.nodeAt(from)
  if (node && !node.isInline && node.nodeSize === to - from) {
    return Decoration.node(from, to, {
      class: a.active ? 'thread-anchor-block thread-anchor-block-active' : 'thread-anchor-block',
      'data-thread-id': a.id,
    })
  }
  return Decoration.inline(from, to, {
    class: a.active ? 'thread-anchor thread-anchor-active' : 'thread-anchor',
    'data-thread-id': a.id,
  })
}

/** Every block a block anchor names, for anchors that name them (one walk of the doc's blocks). */
function blocksOf(doc: PMNode, anchors: ThreadAnchor[]): Map<string, BlockRange> | undefined {
  const ids = anchors.flatMap((a) => blockIdsOf(a.anchor))
  return ids.length > 0 ? blockRanges(doc, ids) : undefined
}

function draw(
  state: EditorState,
  anchors: ThreadAnchor[],
  resolved: Map<string, ResolvedAnchor>,
  blocks?: ReadonlyMap<string, BlockRange>,
): DecorationSet {
  const decorations: Decoration[] = []
  let found = blocks
  for (const a of anchors) {
    const r = resolved.get(a.id)
    if (r?.state !== 'attached') continue
    const ids = blockIdsOf(a.anchor)
    if (ids.length < 2) {
      decorations.push(mark(state.doc, r.from, r.to, a))
      continue
    }
    // Blocks chosen together: each one that is still there, never what lies between them.
    found ??= blocksOf(state.doc, anchors)
    for (const id of ids) {
      const at = found?.get(id)
      if (at) decorations.push(mark(state.doc, at.from, at.to, a))
    }
  }
  return DecorationSet.create(state.doc, decorations)
}

/** Every anchor read again from the live Yjs doc. */
function readAll(state: EditorState, s: Pick<AnchorsState, 'anchors' | 'synced' | 'lineage'>): AnchorsState {
  const b = bindingOf(state)
  const blocks = blocksOf(state.doc, s.anchors)
  const resolved = new Map<string, ResolvedAnchor>()
  for (const a of s.anchors) {
    resolved.set(a.id, resolveAnchor(b, state.doc, a.anchor, { synced: s.synced, lineage: s.lineage, blocks }))
  }
  return { ...s, resolved, decorations: draw(state, s.anchors, resolved, blocks) }
}

/**
 * Your own edit: the ranges move with it; one emptied by it is deleted, except
 * a block's, which is looked for again: the block may still be there, empty,
 * or another block chosen with it may be.
 */
function mapAll(tr: Transaction, prev: AnchorsState, state: EditorState): AnchorsState {
  let changed = false
  const resolved = new Map<string, ResolvedAnchor>()
  for (const a of prev.anchors) {
    const r = prev.resolved.get(a.id)
    if (!r) continue
    if (r.state !== 'attached') {
      resolved.set(a.id, r)
      continue
    }
    const from = tr.mapping.map(r.from, 1)
    const to = tr.mapping.map(r.to, -1)
    if (from < to) {
      resolved.set(a.id, from === r.from && to === r.to ? r : { state: 'attached', from, to })
    } else {
      resolved.set(
        a.id,
        a.anchor.kind === 'block'
          ? resolveAnchor(null, state.doc, a.anchor)
          : { state: 'detached', reason: 'deleted', quote: a.anchor.quote ?? '' },
      )
      changed = true
    }
  }
  return {
    ...prev,
    resolved,
    decorations: changed ? draw(state, prev.anchors, resolved) : prev.decorations.map(tr.mapping, tr.doc),
  }
}

export interface AnchorDecorationsOptions {
  /** Where each thread drawn is now, after every change that moves one. */
  onResolve?: (resolved: ReadonlyMap<string, ResolvedAnchor>) => void
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    anchorDecorations: {
      /** The threads to draw, whether the doc has synced, and its lineage if known. */
      setThreadAnchors: (anchors: ThreadAnchor[], opts?: { synced?: boolean; lineage?: string }) => ReturnType
    }
  }
}

export const AnchorDecorations = Extension.create<AnchorDecorationsOptions>({
  name: 'anchorDecorations',

  addOptions() {
    return { onResolve: undefined }
  },

  addCommands() {
    return {
      setThreadAnchors:
        (anchors, opts = {}) =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(anchorDecorationsKey, { anchors, ...opts } satisfies AnchorsMeta)
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const onResolve = this.options.onResolve
    return [
      new Plugin<AnchorsState>({
        key: anchorDecorationsKey,
        state: {
          init: () => ({ anchors: [], synced: false, resolved: new Map(), decorations: DecorationSet.empty }),
          apply(tr, prev, _old, state) {
            const meta = tr.getMeta(anchorDecorationsKey) as AnchorsMeta | undefined
            if (meta) {
              return readAll(state, {
                anchors: meta.anchors ?? prev.anchors,
                synced: meta.synced ?? prev.synced,
                lineage: meta.lineage ?? prev.lineage,
              })
            }
            if (!tr.docChanged || prev.anchors.length === 0) return prev
            return isChangeOrigin(tr) ? readAll(state, prev) : mapAll(tr, prev, state)
          },
        },
        props: {
          decorations: (state) => anchorDecorationsKey.getState(state)?.decorations,
        },
        view: () => ({
          update(view, prevState) {
            const now = anchorDecorationsKey.getState(view.state)
            const before = anchorDecorationsKey.getState(prevState)
            if (onResolve && now && now.resolved !== before?.resolved) onResolve(now.resolved)
          },
        }),
      }),
    ]
  },
})
