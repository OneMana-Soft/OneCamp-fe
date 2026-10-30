import type { ActionContext } from "@/components/docEditor/registry/types"

/** The block an action runs on: the block menu's range (B1), else the selected node. */
export function actionBlock(ctx: ActionContext) {
  const editor = ctx.editor
  if (!editor || editor.isDestroyed) return null
  const range = ctx.state?.range as { from: number } | undefined
  const pos = range?.from ?? editor.state.selection.from
  const node = editor.state.doc.nodeAt(pos)
  return node ? { editor, pos, node } : null
}
