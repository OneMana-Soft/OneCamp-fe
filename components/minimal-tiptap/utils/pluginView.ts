/**
 * A plugin's view without the plugin: driven by the editor's transactions,
 * so a view that comes and goes while the editor is open (a bubble menu)
 * never reconfigures it. Adding a plugin to an open editor
 * (editor.registerPlugin, which Tiptap's own BubbleMenu does when it mounts)
 * makes every plugin view again: an open "/" menu closes, a flash is lost,
 * and collaboration draws the whole doc again (registry/factory.ts).
 *
 * The view is made at once, told of each new state as a plugin's view is
 * (update, with the state before it), and destroyed when it is detached or
 * the editor goes.
 */

import type { Editor } from "@tiptap/core"
import type { EditorState, PluginView } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

export function attachPluginView(editor: Editor, make: (view: EditorView) => PluginView): () => void {
  if (editor.isDestroyed) return () => {}
  const pluginView = make(editor.view)
  let before: EditorState = editor.state
  let attached = true
  const update = () => {
    const prev = before
    before = editor.state
    if (prev !== before) pluginView.update?.(editor.view, prev)
  }
  const detach = () => {
    if (!attached) return
    attached = false
    editor.off("transaction", update)
    editor.off("destroy", detach)
    pluginView.destroy?.()
  }
  editor.on("transaction", update)
  editor.on("destroy", detach)
  return detach
}
