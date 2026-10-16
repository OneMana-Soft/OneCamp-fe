/**
 * The bubble menu as tests draw it (components/minimal-tiptap/components/
 * bubble-menu/bubble-menu.tsx): in place, without tippy's floating layer
 * (jsdom lays nothing out), shown when its shouldShow says so after each of
 * the editor's transactions, as the real one asks. A test opts in:
 *
 *   vi.mock("@/components/minimal-tiptap/components/bubble-menu/bubble-menu", () => import("@/lib/testing/bubbleMenu"))
 */

import * as React from "react"
import type { BubbleMenuProps } from "@/components/minimal-tiptap/components/bubble-menu/bubble-menu"

export function BubbleMenu({ editor, shouldShow, className, children }: BubbleMenuProps) {
  const [, rerender] = React.useReducer((n: number) => n + 1, 0)
  const element = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!editor) return
    editor.on("transaction", rerender)
    return () => {
      editor.off("transaction", rerender)
    }
  }, [editor])
  if (!editor || editor.isDestroyed) return null
  const { from, to } = editor.state.selection
  const show = shouldShow
    ? shouldShow({ editor, element: element.current ?? document.createElement("div"), view: editor.view, state: editor.state, from, to })
    : from !== to && editor.isEditable
  return show ? (
    <div ref={element} data-bubble-menu="" className={className}>
      {children}
    </div>
  ) : null
}
