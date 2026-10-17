"use client"

import { CodeBlock } from '@tiptap/extension-code-block'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { DecorationSet } from '@tiptap/pm/view'
import { changedRange } from '@/components/minimal-tiptap/utils/changedRange'

// The code block, highlighted once lowlight loads with the first one (I20).

type Highlighter = typeof import('./highlighter')

let hl: Highlighter | null = null
let fetching: Promise<Highlighter> | null = null

/** Fetches the highlighter, once (again after a failed fetch). */
export function loadHighlighter(): Promise<Highlighter> {
  fetching ??= import('./highlighter').then(
    (m) => (hl = m),
    (e) => {
      fetching = null
      throw e
    },
  )
  return fetching
}

const lazyLowlightKey = new PluginKey<DecorationSet>('lazyLowlight')


/** Whether a range of a doc holds a code block. */
const holds = (doc: PMNode, from: number, to: number, name: string) => {
  let found = false
  doc.nodesBetween(from, to, (n) => !(found ||= n.type.name === name) && !n.isTextblock)
  return found
}

function lazyLowlightPlugin(name: string, defaultLanguage: string | null) {
  return new Plugin<DecorationSet>({
    key: lazyLowlightKey,
    state: {
      init: (_, state) => (hl ? hl.decorateAll(state.doc, name, defaultLanguage) : DecorationSet.empty),
      apply(tr, set, old, next) {
        if (tr.getMeta(lazyLowlightKey)) return hl!.decorateAll(next.doc, name, defaultLanguage)
        return tr.docChanged && hl ? hl.decorateChange(set, old.doc, next.doc, name, defaultLanguage) : set
      },
    },
    props: {
      decorations: (state) => lazyLowlightKey.getState(state),
    },
    view(view) {
      let gone = false
      let asked = false
      const redraw = () => {
        if (!gone && !view.isDestroyed) view.dispatch(view.state.tr.setMeta(lazyLowlightKey, true))
      }
      // The highlighter once a code block is in the doc (the whole doc as the
      // editor starts, then what each change touched); then the grammars
      // beyond the common set that blocks name.
      const check = (prev?: PMNode) => {
        if (hl) {
          if (hl.hasWanted()) void hl.loadWanted().then((any) => any && redraw())
          return
        }
        if (asked) return
        const doc = view.state.doc
        const r = prev ? changedRange(prev, doc) : { start: 0, endB: doc.content.size }
        if (!r || !holds(doc, r.start, r.endB, name)) return
        asked = true
        void loadHighlighter().then(redraw, () => (asked = false))
      }
      check()
      return {
        update(v, prev) {
          check(prev.doc === v.state.doc ? v.state.doc : prev.doc)
        },
        destroy() {
          gone = true
        },
      }
    },
  })
}

/** The code block, its highlighting loaded when one is first shown. */
export const LazyCodeBlock = CodeBlock.extend<{ defaultLanguage: string | null } & Record<string, unknown>>({
  addOptions() {
    return {
      ...this.parent?.(),
      defaultLanguage: null,
      HTMLAttributes: { class: 'block-node' },
    }
  },
  addProseMirrorPlugins() {
    return [...(this.parent?.() ?? []), lazyLowlightPlugin(this.name, this.options.defaultLanguage)]
  },
})
