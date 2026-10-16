"use client"

import type { Editor } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import { busFor } from "@/components/docEditor/registry/commandBus"
import { connectedId } from "@/lib/codec/connectedValues"
// The entry, so the kinds are there even before any chip is drawn.
import { readNow, type DocChipData } from "@/lib/liveEntity"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { toast } from "@/hooks/use-toast"
import { todoToTask } from "@/services/connectedService"
import { pickProject, type Picked } from "../connected/pick"
import { trackPos } from "../smart-paste/smartPaste"
import { ancestor } from "../../utils/ancestor"

/** A to-do's own words: its first line. */
const wordsOf = (todo: PMNode) => (todo.firstChild?.textContent ?? "").replace(/\s+/g, " ").trim()

/** The to-dos being made tasks in each editor, followed as the doc changes: a second ⌘⇧Enter on one makes no second task. */
const turning = new WeakMap<Editor, Set<{ pos: () => number | null }>>()

/** The project a doc lives in, when it lives in one. */
async function docsProject(docId: string): Promise<Picked | null> {
  const doc = await readNow("doc", docId)
  const d = doc.data as DocChipData | undefined
  if (doc.state !== "ok" || d?.space_kind !== "project" || !d.space_id) return null
  const project = await readNow("project", d.space_id)
  // A project space the person doesn't run can't take a task from them: they pick one.
  const p = project.data as { name?: string; can_edit?: boolean } | undefined
  return project.state === "ok" && p?.can_edit ? { id: d.space_id, name: p.name ?? "" } : null
}

/**
 * ⌘⇧Enter on a to-do (docs C1, editor.md P2-3): a task named as the to-do is
 * made in the doc's project (or one the person picks: only a project's admins
 * make its tasks), and the to-do becomes it. Its line holds the task's live
 * chip and its box follows the task (taskItemLink.ts). On a to-do that is a
 * task already, it opens the task.
 */
export async function turnIntoTask(editor: Editor) {
  // The to-do the caret is in (or the one selected): where it starts, and the node.
  const todo = ancestor(editor, ["taskItem"])
  if (!todo) return
  if (connectedId(todo.node.attrs.taskId)) {
    const dom = editor.view.nodeDOM(todo.pos)
    if (dom instanceof HTMLElement) dom.querySelector<HTMLElement>("[data-entity-chip]")?.click()
    return
  }
  const title = wordsOf(todo.node)
  if (!title) {
    toast({ title: "Write the to-do first, then make it a task." })
    return
  }
  const bus = busFor(editor)
  const docId = bus?.docId
  if (!docId) return
  const inFlight = turning.get(editor) ?? new Set()
  if ([...inFlight].some((t) => t.pos() === todo.pos)) return
  turning.set(editor, inFlight)
  // The to-do may move while the project is picked and the task made.
  const at = trackPos(editor, todo.pos)
  inFlight.add(at)
  let taskId: string
  let project: Picked | null
  try {
    project = (await docsProject(docId)) ?? (await pickProject(bus, "task"))
    if (!project) return
    taskId = await todoToTask(docId, project.id, title)
  } catch (e) {
    toast({ title: apiErrorMessage(e, "Couldn't make the task. Try again.") })
    return
  } finally {
    inFlight.delete(at)
    at.stop()
  }
  const pos = at.pos()
  const node = pos === null || editor.isDestroyed ? null : editor.state.doc.nodeAt(pos)
  if (pos === null || node?.type.name !== "taskItem") {
    toast({ title: `Made the task in ${project.name}`, description: "Its to-do was gone by then, so it isn't linked here." })
    return
  }
  const { schema, tr } = editor.state
  // The to-do's line becomes the task's chip; its box follows the task.
  const line = node.firstChild
  tr.setNodeMarkup(pos, undefined, { ...node.attrs, taskId })
  if (line && line.type.name === "paragraph" && schema.nodes.entityMention) {
    tr.replaceWith(pos + 2, pos + 2 + line.content.size, schema.nodes.entityMention.create({ id: `task:${taskId}`, label: title, mentionSuggestionChar: "+" }))
  }
  editor.view.dispatch(tr)
  toast({ title: `Made the task in ${project.name}` })
}
