"use client"

/**
 * A menu that floats over the selection: Tiptap's BubbleMenu, with its props
 * and its view (BubbleMenuView), attached to the editor as a view
 * (attachPluginView) rather than as a plugin. Tiptap's own adds a plugin when
 * it mounts, and a plugin added to an open editor makes every plugin view
 * again (registry/factory.ts).
 *
 * Two more differences from Tiptap's: it asks the latest shouldShow it was
 * given, where Tiptap's keeps the one it mounted with; and its content is
 * drawn into an element of its own (a portal), which the view moves into its
 * floating layer, where Tiptap's moved an element React held in its parent,
 * and React then failed on the node it no longer held (NotFoundError).
 */

import * as React from "react"
import { createPortal } from "react-dom"
import type { Editor } from "@tiptap/core"
import { BubbleMenuView, type BubbleMenuPluginProps } from "@tiptap/extension-bubble-menu"
import { attachPluginView } from "../../utils/pluginView"

export interface BubbleMenuProps {
  editor: Editor | null
  /** When it shows. Without it, Tiptap's rule: a selection with text, in an editor that can be edited, with the focus. */
  shouldShow?: BubbleMenuPluginProps["shouldShow"]
  /** Waits this long after a change before it moves or shows (Tiptap's default: 250 ms). */
  updateDelay?: number
  tippyOptions?: BubbleMenuPluginProps["tippyOptions"]
  className?: string
  children: React.ReactNode
}

export function BubbleMenu({ editor, shouldShow, updateDelay, tippyOptions, className, children }: BubbleMenuProps) {
  const [element] = React.useState(() => (typeof document === "undefined" ? null : document.createElement("div")))
  const shouldShowRef = React.useRef(shouldShow)
  React.useLayoutEffect(() => {
    shouldShowRef.current = shouldShow
    if (element) element.className = className ?? ""
  })
  // Its delay and tippy's options are read once, when it is attached, as Tiptap's are.
  const options = React.useRef({ updateDelay, tippyOptions })
  React.useEffect(() => {
    if (!element || !editor || editor.isDestroyed) return
    return attachPluginView(editor, (view) => {
      // The view's own type asks for a plugin key; nothing reads it here.
      const menu = new BubbleMenuView({ editor, element, view, pluginKey: "bubbleMenuView", ...options.current })
      const tiptapRule = menu.shouldShow
      menu.shouldShow = (props) => !!(shouldShowRef.current ?? tiptapRule)?.(props)
      // A selection there already: a menu loaded with the first selection shows for it.
      if (!view.state.selection.empty) menu.update(view)
      return menu
    })
  }, [editor, element])
  return element ? createPortal(children, element) : null
}
