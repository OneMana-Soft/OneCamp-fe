import type { Editor } from "@tiptap/core"
import type { Node as PMNode, ResolvedPos } from "@tiptap/pm/model"
import { NodeSelection } from "@tiptap/pm/state"

/**
 * The innermost node with one of these names around a place in the doc, and
 * where it starts: the selected node itself, or the nearest of the
 * selection's ancestors; or, given $at, the nearest of that place's.
 */
export function ancestor(editor: Editor, names: readonly string[], $at?: ResolvedPos): { node: PMNode; pos: number } | null {
  const { selection } = editor.state
  if (!$at && selection instanceof NodeSelection && names.includes(selection.node.type.name)) return { node: selection.node, pos: selection.from }
  const $from = $at ?? selection.$from
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (names.includes(node.type.name)) return { node, pos: $from.before(d) }
  }
  return null
}
