import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view"

/**
 * Passing looks on blocks, as decorations so ProseMirror draws them: the
 * dragged blocks dimmed, a dropped block's landing, a linked block's flash.
 * They follow the doc through this tab's edits; a collaborator's update
 * (which y-prosemirror applies as a new doc) lets them go, which for a look
 * that lasts a second is fine.
 */

export const blockEffectsKey = new PluginKey<DecorationSet>("blockEffects")

interface EffectMeta {
  remove?: string
  add?: { id: string; ranges: Array<{ from: number; to: number }>; attrs: Record<string, string> }
}

export function blockEffectsPlugin() {
  return new Plugin<DecorationSet>({
    key: blockEffectsKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, set) {
        let next = set.map(tr.mapping, tr.doc)
        const meta = tr.getMeta(blockEffectsKey) as EffectMeta | undefined
        if (meta?.remove) next = next.remove(next.find(undefined, undefined, (spec) => spec.effect === meta.remove))
        if (meta?.add) {
          const { id, ranges, attrs } = meta.add
          const size = tr.doc.content.size
          next = next.add(
            tr.doc,
            ranges.filter((r) => r.from >= 0 && r.to <= size && r.from < r.to).map((r) => Decoration.node(r.from, r.to, attrs, { effect: id })),
          )
        }
        return next
      },
    },
    props: {
      decorations: (state) => blockEffectsKey.getState(state),
    },
  })
}

const timers = new WeakMap<EditorView, Map<string, ReturnType<typeof setTimeout>>>()

/**
 * Shows a look (its attributes: a class, a style) on blocks, in place of any
 * earlier look of that id; for ms milliseconds when given.
 */
export function showEffect(view: EditorView, id: string, ranges: Array<{ from: number; to: number }>, attrs: Record<string, string>, ms?: number) {
  if (view.isDestroyed) return
  const mine = timers.get(view) ?? new Map()
  timers.set(view, mine)
  clearTimeout(mine.get(id))
  view.dispatch(view.state.tr.setMeta(blockEffectsKey, { remove: id, add: { id, ranges, attrs } }).setMeta("addToHistory", false))
  if (ms) mine.set(id, setTimeout(() => clearEffect(view, id), ms))
}

/** Takes a look away. */
export function clearEffect(view: EditorView, id: string) {
  timers.get(view)?.delete(id)
  if (view.isDestroyed) return
  const set = blockEffectsKey.getState(view.state)
  if (!set || !set.find(undefined, undefined, (spec) => spec.effect === id).length) return
  view.dispatch(view.state.tr.setMeta(blockEffectsKey, { remove: id }).setMeta("addToHistory", false))
}

/** Whether reduced motion is asked for: looks that move snap instead. */
export const reducedMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
