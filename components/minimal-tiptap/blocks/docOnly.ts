"use client"

/**
 * The extensions only a doc's editor carries (the doc page, the guest's
 * page), in one chunk that loads when a doc's editor is first built
 * (blocks/doc.ts load). The chat composer and a task's description never
 * fetch it (I20): callouts, toggles, to-do lists, table embeds, the block
 * handle, a click below the text, and the doc's keys.
 */

import { TaskList as TiptapTaskList } from "@tiptap/extension-task-list"
import { TaskItem as TiptapTaskItem } from "@tiptap/extension-task-item"

export { Callout } from "../extensions/callout/callout"
export { Collapsible } from "../extensions/collapsible/collapsible"
export { TableEmbed } from "../extensions/table-embed/table-embed"
export { BlockHandle } from "../extensions/block-handle"
export { ClickToCreateBlock } from "../extensions/click-to-create-block"
export { DocKeymap } from "../extensions/doc-keymap/docKeymap"

export const TaskList = TiptapTaskList.configure({ HTMLAttributes: { class: "task-list" } })

/**
 * A to-do whose own markup (its box, the label round it, the item) is left to
 * it: an attribute something else sets there (a style a screenshot or a
 * browser extension adds, say) is no change to the doc. Tiptap's item has no
 * ignoreMutation, so ProseMirror drew the whole item again, and a chip in its
 * line was built again too (an open hover card closed). Changes in its text
 * are read as always.
 */
export const TaskItem = TiptapTaskItem.extend({
  addNodeView() {
    // Tiptap's item always draws its own (the box is part of it).
    const draw = this.parent!()
    return (props) => {
      const view = draw(props)
      const text = view.contentDOM
      return { ...view, ignoreMutation: (m) => m.type === "attributes" && !!text && !text.contains(m.target) }
    }
  },
}).configure({ HTMLAttributes: { class: "task-item" }, nested: true })
