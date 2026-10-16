"use client"

import type { Editor, JSONContent, Range } from "@tiptap/core"
import { registerAction, registerBlock, registerDialog } from "@/components/docEditor/registry/registry"
import { busFor } from "@/components/docEditor/registry/commandBus"
import type { ActionContext } from "@/components/docEditor/registry/types"
import { ArrowUpRight, CircleCheck, FileText, Kanban, ListTodo } from "@/lib/icons"
import { trackPos } from "../smart-paste/smartPaste"
import { ancestor } from "../../utils/ancestor"
import { openWhenDrawn } from "../subpage/opening"
import { pickPage, pickProject, PICK_PAGE, PICK_PROJECT, type Picked } from "./pick"

/**
 * What the chunk adds as it loads (chunk.ts), before a doc's editor is built:
 * the "/" entries for pages, a project's tasks and its board; the to-do's
 * "Make it a task" on the block menu and the phone's bar; and the pickers they
 * ask.
 */

/** "/" asks for something first, then its block goes where the "/" was. */
function placeAfter(editor: Editor, range: Range, choose: () => Promise<Picked | null>, block: (p: Picked) => JSONContent) {
  editor.chain().focus().deleteRange(range).run()
  const at = trackPos(editor, range.from)
  void choose()
    .then((p) => {
      const pos = at.pos()
      if (p && pos !== null && !editor.isDestroyed) editor.chain().focus().insertContentAt(pos, block(p)).run()
    })
    .finally(at.stop)
}

/** "/page": a new page under this one, its block here, and the page opened. A page that can't be made is said by the request layer. */
function newSubpage(editor: Editor, range: Range) {
  const docId = busFor(editor)?.docId
  editor.chain().focus().deleteRange(range).run()
  if (!docId) return
  const at = trackPos(editor, range.from)
  void import("@/services/docGraphService")
    .then(({ createDoc }) => createDoc({ parent_uuid: docId }))
    .then(
      (page) => {
        const pos = at.pos()
        if (pos === null || editor.isDestroyed) return
        openWhenDrawn(page.doc_uuid)
        editor.chain().focus().insertContentAt(pos, { type: "subpage", attrs: { docId: page.doc_uuid } }).run()
      },
      () => undefined,
    )
    .finally(at.stop)
}

registerBlock({
  id: "connectedSlash",
  editors: ["doc"],
  edition: "both",
  schema: [],
  slash: [
    {
      id: "page",
      title: "Page",
      description: "A new page inside this one",
      aliases: ["subpage", "new page", "child page"],
      icon: FileText,
      section: "Basic",
      order: 115,
      run: newSubpage,
    },
    {
      id: "linkToPage",
      title: "Link to page",
      description: "Another page, its title kept up to date",
      aliases: ["link page", "page link", "[["],
      icon: ArrowUpRight,
      section: "Basic",
      order: 116,
      run: (editor, range) =>
        // Its id only: the page's title is read live, as each reader may see it.
        placeAfter(editor, range, () => pickPage(busFor(editor)), (p) => ({ type: "subpage", attrs: { docId: p.id } })),
    },
    {
      id: "tasks",
      title: "Tasks",
      description: "A project's tasks, kept live",
      aliases: ["task list", "project tasks", "todos"],
      icon: ListTodo,
      section: "Media and embeds",
      order: 131,
      run: (editor, range) => placeAfter(editor, range, () => pickProject(busFor(editor), "tasks"), (p) => ({ type: "taskListEmbed", attrs: { projectId: p.id, show: "open" } })),
    },
    {
      id: "board",
      title: "Board",
      description: "A project's board, kept live",
      aliases: ["kanban", "project board"],
      icon: Kanban,
      section: "Media and embeds",
      order: 132,
      run: (editor, range) => placeAfter(editor, range, () => pickProject(busFor(editor), "board"), (p) => ({ type: "boardEmbed", attrs: { projectId: p.id } })),
    },
  ],
})

/** Whether an action is about a to-do that isn't a task yet: the block menu's block (B1), or the caret's. */
function isPlainTodo(ctx: ActionContext): boolean {
  const editor = ctx.editor
  if (!editor || editor.isDestroyed) return false
  const range = ctx.state?.range as { from: number } | undefined
  const todo = ancestor(editor, ["taskItem"], editor.state.doc.resolve(range ? range.from + 1 : editor.state.selection.from))
  return !!todo && !todo.node.attrs.taskId
}

// ⌘⇧Enter's counterpart on the block menu and, on a phone, the bar.
registerAction({
  id: "connected.todoToTask",
  label: "Make it a task",
  icon: CircleCheck,
  group: "block",
  surfaces: ["blockMenu", "phoneBar"],
  edition: "both",
  isVisible: (ctx) => ctx.canEdit && isPlainTodo(ctx),
  run: (ctx) => {
    const editor = ctx.editor
    if (!editor) return
    const range = ctx.state?.range as { from: number } | undefined
    if (range) editor.commands.setTextSelection(range.from + 2)
    return import("../task-item-link/turnIntoTask").then((m) => m.turnIntoTask(editor))
  },
})

registerDialog({ id: PICK_PROJECT, edition: "both", load: () => import("./ProjectPickerDialog") })
registerDialog({ id: PICK_PAGE, edition: "both", load: () => import("./PagePickerDialog") })
