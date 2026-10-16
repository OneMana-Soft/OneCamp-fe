"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { taskListShow } from "@/lib/codec/connectedValues"
import { lazyNodeView } from "../lazyNodeView"
import { blockLink, idAttr } from "../connected/attrs"

const TaskListEmbedView = lazyNodeView(() => import("./TaskListEmbedView").then((m) => m.TaskListEmbedView), 160)

/**
 * A project's tasks in a doc, live (docs C1, structure.md P2.3; "/tasks"):
 * open, mine or all, each ticked to complete it by whoever may. The doc keeps
 * only the project and what it shows; the tasks are read as the reader.
 */
export const TaskListEmbed = Node.create({
  name: "taskListEmbed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      projectId: idAttr("projectId", "data-project-id"),
      show: {
        default: "open",
        parseHTML: (el) => taskListShow(el.getAttribute("data-show")),
        renderHTML: (attrs) => ({ "data-show": taskListShow(attrs.show) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="task-list-embed"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-type": "task-list-embed" }, HTMLAttributes), ...blockLink(node)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(TaskListEmbedView)
  },
})
