"use client"

import { Extension, type Editor } from "@tiptap/core"
import { NodeSelection, Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state"
import { connectedId } from "@/lib/codec/connectedValues"
import { refreshEntity, snapshot, type TaskChipData } from "@/lib/liveEntity"
import { toast } from "@/hooks/use-toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { checkTodo } from "@/services/connectedService"
import { busFor } from "@/components/docEditor/registry/commandBus"
import { changedRanges, isRemoteTransaction } from "../offload-embedded-images/offloadEmbeddedImages"
import { idAttr } from "../connected/attrs"
import { ancestor } from "../../utils/ancestor"

/**
 * A to-do that became a task (docs C1, editor.md P2-3): its task's id on the
 * to-do (taskId), and from then on the two move together.
 *
 * - ⌘⇧Enter on a to-do makes it a task (turnIntoTask.ts).
 * - A tick here changes the task, through the API's one path for it
 *   (business/Task/taskDocSync.go SetTodoDone), which holds the task view's
 *   rule: someone who couldn't change the task from its panel can't from a
 *   doc either. A tick the server refuses is taken back, and said.
 * - A task done or opened again elsewhere ticks or clears the box here,
 *   through the live doc: a change from Yjs, which this leaves alone (I6).
 * - ⌘Enter on a chip (a task, a page, a project) opens it.
 */

/** A change this file makes itself, to put a refused tick back: never a tick of its own. */
const REVERT = "taskItemLinkRevert"

interface Tick {
  taskId: string
  done: boolean
  seq: number
}

interface Boxes {
  /** Each linked to-do's box as last seen: a change to it made here is a tick. */
  boxes: Map<string, boolean>
  /** The ticks made here, newest last; the view sends each once. */
  ticks: Tick[]
}

const taskItemChecksKey = new PluginKey<Boxes>("taskItemChecks")

let seq = 0
const KEPT_TICKS = 20

/** The linked to-dos a transaction touched, with their boxes now. */
function touched(tr: Transaction): Array<{ id: string; checked: boolean }> {
  const out: Array<{ id: string; checked: boolean }> = []
  for (const [from, to] of changedRanges(tr)) {
    tr.doc.nodesBetween(from, to, (node) => {
      if (node.type.name !== "taskItem") return
      const id = connectedId(node.attrs.taskId)
      if (id) out.push({ id, checked: !!node.attrs.checked })
    })
  }
  return out
}

/** Whether the reader may change a task, as far as its chip has read: unknown is yes (the server decides). */
function mayChange(taskId: string): boolean {
  const e = snapshot("task", taskId)
  return !(e.state === "ok" && (e.data as TaskChipData | undefined)?.can_edit === false)
}

/** Sends a tick to the task; one the server refuses is taken back, and said. */
async function sendTick(editor: Editor, taskId: string, done: boolean) {
  const docId = busFor(editor)?.docId
  if (!docId) return
  try {
    await checkTodo(docId, taskId, done)
    refreshEntity("task", taskId)
  } catch (e) {
    revert(editor, taskId, !done)
    toast({ title: apiErrorMessage(e, "Couldn't change the task. Try again.") })
  }
}

/** Puts boxes back as they were: a tick the task couldn't take. */
function revert(editor: Editor, taskId: string, checked: boolean) {
  const { state } = editor
  const tr = state.tr.setMeta(REVERT, true).setMeta("addToHistory", false)
  state.doc.descendants((node, pos) => {
    if (node.type.name === "taskItem" && connectedId(node.attrs.taskId) === taskId && !!node.attrs.checked !== checked) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked })
    }
  })
  if (tr.docChanged) editor.view.dispatch(tr)
}

/** Shows a refused box as the doc has it: a click has already ticked it on screen. */
function showAsIs(editor: Editor, state: EditorState, taskId: string) {
  state.doc.descendants((node, pos) => {
    if (node.type.name !== "taskItem" || connectedId(node.attrs.taskId) !== taskId) return
    const label = Array.from((editor.view.nodeDOM(pos) as HTMLElement | null)?.children ?? []).find((c) => c.tagName === "LABEL")
    const box = label?.querySelector<HTMLInputElement>("input[type=checkbox]")
    if (box) box.checked = !!node.attrs.checked
  })
}

function checksPlugin(editor: Editor) {
  let sent = 0
  return new Plugin<Boxes>({
    key: taskItemChecksKey,
    state: {
      init: () => ({ boxes: new Map(), ticks: [] }),
      apply(tr, prev) {
        if (!tr.docChanged) return prev
        const theirs = isRemoteTransaction(tr) || !!tr.getMeta(REVERT)
        let { boxes, ticks } = prev
        for (const { id, checked } of touched(tr)) {
          const was = boxes.get(id)
          if (was === checked) continue
          boxes = new Map(boxes).set(id, checked)
          // A to-do seen for the first time (it came in, or just became a task) is no tick.
          if (!theirs && was !== undefined) ticks = [...ticks, { taskId: id, done: checked, seq: ++seq }].slice(-KEPT_TICKS)
        }
        return boxes === prev.boxes && ticks === prev.ticks ? prev : { boxes, ticks }
      },
    },
    // A tick on a task the reader can't change is refused before it lands.
    filterTransaction(tr: Transaction, state: EditorState) {
      if (!tr.docChanged || isRemoteTransaction(tr) || tr.getMeta(REVERT)) return true
      const boxes = taskItemChecksKey.getState(state)?.boxes
      for (const { id, checked } of touched(tr)) {
        const was = boxes?.get(id)
        if (was !== undefined && was !== checked && !mayChange(id)) {
          showAsIs(editor, state, id)
          toast({ title: "Only the project's admins can change this task.", description: "Ask one of them to change it." })
          return false
        }
      }
      return true
    },
    view: () => ({
      update(view) {
        const ticks = taskItemChecksKey.getState(view.state)?.ticks ?? []
        for (const t of ticks) {
          if (t.seq <= sent) continue
          sent = t.seq
          void sendTick(editor, t.taskId, t.done)
        }
      },
    }),
  })
}

/** The chip a selection is on (a task, a page, a project), if it's on one: what ⌘Enter opens. */
function chipAt(editor: Editor): HTMLElement | null {
  const { selection } = editor.state
  if (!(selection instanceof NodeSelection)) return null
  const name = selection.node.type.name
  if (name !== "entityMention" && name !== "subpage") return null
  const dom = editor.view.nodeDOM(selection.from) as HTMLElement | null
  return dom?.querySelector<HTMLElement>("[data-entity-chip], [data-subpage-open]") ?? null
}

/** Whether the caret is in a to-do (or one is selected). */
const inTodo = (editor: Editor) => !!ancestor(editor, ["taskItem"])

export const TaskItemLink = Extension.create({
  name: "taskItemLink",
  // Ahead of the doc's keys (docKeymap, 150), whose ⌘↩ takes every press.
  priority: 170,

  addGlobalAttributes() {
    return [{ types: ["taskItem"], attributes: { taskId: { ...idAttr("taskId", "data-task-id"), keepOnSplit: false } } }]
  },

  addKeyboardShortcuts() {
    const editor = this.editor
    return {
      "Mod-Shift-Enter": () => {
        if (!inTodo(editor) || !editor.isEditable) return false
        void import("./turnIntoTask").then((m) => m.turnIntoTask(editor))
        return true
      },
      "Mod-Enter": () => {
        const chip = chipAt(editor)
        if (!chip) return false
        chip.click()
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    return [checksPlugin(this.editor)]
  },
})
