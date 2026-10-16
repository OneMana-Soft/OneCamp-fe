/**
 * B6's soft lock on a doc's editor (D-12: a client-side guard; a hard lock is
 * the server's): while it holds, the editor can't be edited. It is given to
 * the editor when the editor is made (chrome/register.ts), and reads the
 * page's facts (pageFacts.ts) each time the view asks. The page guard, which
 * loads a moment after the doc opens, only keeps those facts current: adding
 * a plugin to an open editor would make every plugin view again (an open
 * menu closes, a flash is lost).
 */

import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import type { BlockContext } from "@/components/docEditor/registry/types"
import { factsOf, softLocked, subscribeFacts } from "./pageFacts"

export const softLockKey = new PluginKey<boolean>("b6SoftLock")

export const SoftLock = Extension.create<{ docId: string }>({
  name: "b6SoftLock",

  addOptions: () => ({ docId: "" }),

  addProseMirrorPlugins() {
    const { docId } = this.options
    const locked = () => softLocked(factsOf(docId))
    return [
      new Plugin({
        key: softLockKey,
        props: { editable: () => !locked() },
        // The view reads editable again on its next update: one that changes
        // nothing, when the lock comes or goes.
        view: (view) => {
          let was = locked()
          const stop = subscribeFacts(() => {
            const now = locked()
            if (now === was || view.isDestroyed) return
            was = now
            view.dispatch(view.state.tr.setMeta(softLockKey, now))
          })
          return { destroy: stop }
        },
      }),
    ]
  },
})

/** The registry's maker (chrome/register.ts): the soft lock for an editor of a doc. */
export const softLockFor = (ctx: BlockContext) => (ctx.docId ? [SoftLock.configure({ docId: ctx.docId })] : [])
