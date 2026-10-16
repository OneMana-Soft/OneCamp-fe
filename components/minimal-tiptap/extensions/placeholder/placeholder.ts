import { Extension, isNodeEmpty, type Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

// The doc editor's placeholder, in constant work per keystroke (docs programme
// A2; I20: no walk of the whole doc per key).
//
// WHY. Tiptap's Placeholder works its decorations out on every transaction by
// walking every top-level block (every node, with includeChildren), and asks
// the editor whether it is empty, another walk. On a 2,000-block doc that was
// 1.6 ms of every keystroke (perf §1.8, 0.07 ms on 12 blocks), and it grows with
// the doc. A placeholder only ever shows in two places: the empty doc, and the
// empty block the caret is in. This finds both from the selection alone: the
// caret's ancestors (one level, or every level with includeChildren) and the
// doc's first child. The work is the caret's depth, whatever the doc's size.
//
// Same options and callback as Tiptap's, so A0's texts carry over unchanged.
// One difference: with showOnlyCurrent false, Tiptap marked every empty block
// in the doc; this marks the caret's (and the empty doc's). The doc editor
// shows only the current one anyway.

export interface DocPlaceholderOptions {
  emptyEditorClass: string
  emptyNodeClass: string
  placeholder: string | ((props: { editor: Editor; node: PMNode; pos: number; hasAnchor: boolean }) => string)
  showOnlyWhenEditable: boolean
  /** Kept for Tiptap's signature: the caret's block is the only candidate either way. */
  showOnlyCurrent: boolean
  /** Also nested blocks (an empty list item, a to-do, a callout's line). */
  includeChildren: boolean
}

export const docPlaceholderKey = new PluginKey('docPlaceholder')

/** Whether the doc is one empty textblock: the "empty editor" look. Constant work. */
export function isEmptyDoc(doc: PMNode): boolean {
  if (doc.childCount !== 1) return doc.childCount === 0
  const only = doc.firstChild!
  return only.isTextblock && only.content.size === 0
}

/**
 * The placeholder decorations for a doc and a caret: the caret's empty block
 * (or blocks, nested), and nothing else. Exported for its test.
 */
export function placeholderDecorations(doc: PMNode, anchor: number, options: DocPlaceholderOptions, editor: Editor): Decoration[] {
  const out: Decoration[] = []
  const emptyDoc = isEmptyDoc(doc)
  const pos = Math.max(0, Math.min(anchor, doc.content.size))
  const $pos = doc.resolve(pos)
  const deepest = options.includeChildren ? $pos.depth : Math.min(1, $pos.depth)
  for (let depth = 1; depth <= deepest; depth++) {
    const node = $pos.node(depth)
    if (node.isLeaf || !isNodeEmpty(node)) continue
    const start = $pos.before(depth)
    const classes = [options.emptyNodeClass]
    if (emptyDoc) classes.push(options.emptyEditorClass)
    const text = typeof options.placeholder === 'function' ? options.placeholder({ editor, node, pos: start, hasAnchor: true }) : options.placeholder
    out.push(Decoration.node(start, start + node.nodeSize, { class: classes.join(' '), 'data-placeholder': text }))
  }
  // The caret can sit outside the first block of an empty doc (a node
  // selection, the very end): the empty doc still says what to do.
  if (emptyDoc && out.length === 0 && doc.firstChild) {
    const node = doc.firstChild
    const text = typeof options.placeholder === 'function' ? options.placeholder({ editor, node, pos: 0, hasAnchor: false }) : options.placeholder
    out.push(Decoration.node(0, node.nodeSize, { class: `${options.emptyNodeClass} ${options.emptyEditorClass}`, 'data-placeholder': text }))
  }
  return out
}

export const DocPlaceholder = Extension.create<DocPlaceholderOptions>({
  // Tiptap's name: it stands in for Placeholder, and only one may load.
  name: 'placeholder',

  addOptions() {
    return {
      emptyEditorClass: 'is-editor-empty',
      emptyNodeClass: 'is-empty',
      placeholder: 'Write something …',
      showOnlyWhenEditable: true,
      showOnlyCurrent: true,
      includeChildren: false,
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: docPlaceholderKey,
        props: {
          decorations: ({ doc, selection }) => {
            if (!this.editor.isEditable && this.options.showOnlyWhenEditable) return null
            const decorations = placeholderDecorations(doc, selection.anchor, this.options, this.editor)
            return decorations.length ? DecorationSet.create(doc, decorations) : null
          },
        },
      }),
    ]
  },
})
