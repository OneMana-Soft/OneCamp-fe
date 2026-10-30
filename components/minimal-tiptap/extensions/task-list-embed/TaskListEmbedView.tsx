"use client"

import * as React from "react"
import { drawnSelected } from "@/components/minimal-tiptap/utils"
import { parseISO } from "date-fns"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { useAppRouter } from "@/lib/navigation/appRouter"
import { useGuestReader } from "@/components/minimal-tiptap/guestReader"
import { ChatFace } from "@/components/message/chatFace"
import { StatusGlyph } from "@/components/ui/graphics/glyphs"
import { DueLabel } from "@/components/task/DueLabel"
import { useMyId } from "@/hooks/useMyId"
import { RestrictedMark } from "@/components/task/BlockedBadge"
import { usePost } from "@/hooks/usePost"
import { useTaskUpdate } from "@/hooks/useTaskUpdate"
import { taskListShow, TASK_LIST_SHOWS, type TaskListShow } from "@/lib/codec/connectedValues"
import { followHref, openTask, useToday } from "@/lib/liveEntity"
import { CATEGORY_KIND, isClosedStatus, statusOptionOf, type StatusCategory } from "@/lib/taskStatus"
import { ArrowUpRight, ListTodo } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { displayNameOf } from "@/lib/personName"
import { canEditTask } from "@/lib/work/access"
import { PostEndpointUrl } from "@/services/endPoints"
import type { TaskInfoInterface } from "@/types/task"
import { COLUMNS, OPEN, tasksIn, useProjectBoard } from "./useProjectBoard"
import { EmbedFrame, EmbedNote, embedState } from "./embedFrame"

const SHOW_LABEL: Record<TaskListShow, string> = { open: "Open", mine: "Mine", all: "All" }
/** Rows shown before "Show all". */
const FIRST = 8
/** At most this many, then the project itself. */
const MOST = 50

/** The tasks a list shows, as a list reads them: in progress first, done last. */
function tasksFor(board: Parameters<typeof tasksIn>[0], show: TaskListShow): TaskInfoInterface[] {
  return COLUMNS.filter((c) => show === "all" || OPEN.has(c.status)).flatMap((c) => tasksIn(board, c.key))
}

/**
 * A project's tasks in a doc (docs C1, structure.md P2.3): open, mine (each
 * reader's own) or all, live as they change anywhere. Ticking one completes
 * it, for whoever may change that task (as on the project's own board); a
 * name opens the task. Whoever edits the doc picks
 * what it shows. Someone outside the project reads that they can't see it,
 * and never its name; a guest reads only that it is a project's tasks.
 */
export function TaskListEmbedView({ node, editor, updateAttributes, selected }: NodeViewProps) {
  const projectId: string = node.attrs.projectId || ""
  const show = taskListShow(node.attrs.show)
  const guest = useGuestReader()
  const read = useProjectBoard(projectId, { mine: show === "mine", enabled: !guest && !!projectId })
  const { project, board } = read
  const [all, setAll] = React.useState(false)
  const today = useToday()
  const router = useAppRouter()
  const { optimisticUpdateTask, revalidateTaskKeys } = useTaskUpdate()
  const name = project.data?.name || "Untitled project"
  const me = useMyId(!guest)
  // Each task by its own right, as on the project's own board (lib/work/access):
  // where members change only their own tasks, the others' boxes don't tick.
  // The project's can_edit is any task's.
  const mayTick = project.state === "ok" && !!project.data?.can_edit && editor.isEditable

  const go = (href: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    followHref(href, e, router.push)
  }
  const open = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    openTask(id, e, router.push)
  }

  // A status changes as on the project's own list: the same request, through the shared poster.
  const post = usePost()
  const tick = async (t: TaskInfoInterface) => {
    const next = t.task_status === "done" ? "todo" : "done"
    await post.makeRequest({ apiEndpoint: PostEndpointUrl.UpdateTaskStatus, payload: { task_status: next, task_uuid: t.task_uuid, task_project_uuid: projectId } })
    optimisticUpdateTask({ task_uuid: t.task_uuid, task_status: next }, projectId)
    revalidateTaskKeys(projectId)
  }

  const head = (
    <>
      <ListTodo className="size-4 text-ink-3" aria-hidden="true" />
      <span className="min-w-0 truncate font-[510] text-ink">{guest || project.state !== "ok" ? "Tasks" : `${name} · Tasks`}</span>
      <span className="flex-1" />
      {project.state === "ok" ? (
        editor.isEditable ? (
          <span role="group" aria-label="Which tasks" className="flex rounded-md bg-hover p-0.5">
            {TASK_LIST_SHOWS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={show === s}
                onClick={() => updateAttributes({ show: s })}
                className={cn(
                  "h-6 rounded-[5px] px-2 text-meta font-[510] text-ink-2 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-brand",
                  show === s && "bg-raised text-ink shadow-e1",
                )}
              >
                {SHOW_LABEL[s]}
              </button>
            ))}
          </span>
        ) : (
          <span className="text-meta">{SHOW_LABEL[show]}</span>
        )
      ) : null}
      {project.state === "ok" ? (
        <a href={`/app/project/${projectId}`} onClick={go(`/app/project/${projectId}`)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-meta text-ink-2 hover:bg-hover hover:text-ink">
          {/* On a phone the arrow alone, so the head keeps the project's name. */}
          <span className="max-sm:sr-only">Open project</span>
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </a>
      ) : null}
    </>
  )

  let body = embedState({
    guest,
    projectId,
    read,
    what: "tasks",
    skeleton: (
      <div aria-hidden="true" className="flex flex-col gap-2 px-3 py-3">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-4 w-2/3 animate-pulse rounded-sm bg-press motion-reduce:animate-none" />
        ))}
      </div>
    ),
  })
  if (!body && board) {
    const tasks = tasksFor(board, show)
    const shown = tasks.slice(0, all ? MOST : FIRST)
    body = tasks.length ? (
      <>
        {/* Not ul/li: inside the doc, the editor's list styles would bullet and indent the rows. */}
        <div role="list" aria-label={`${name}: ${SHOW_LABEL[show].toLowerCase()} tasks`}>
          {shown.map((t) => (
            // A refused tick is said by the request layer, as on the project's list.
            <TaskRow key={t.task_uuid} task={t} today={today} canTick={mayTick && canEditTask(t, me, board)} onTick={() => void tick(t).catch(() => undefined)} onOpen={(e) => open(e, t.task_uuid)} />
          ))}
        </div>
        {tasks.length > shown.length ? (
          <div className="border-t border-line px-3 py-1.5">
            {all ? (
              <a href={`/app/project/${projectId}`} onClick={go(`/app/project/${projectId}`)} className="text-meta text-ink-2 hover:text-ink">
                {tasks.length - shown.length} more in the project
              </a>
            ) : (
              <button type="button" onClick={() => setAll(true)} className="text-meta text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand">
                Show all {tasks.length}
              </button>
            )}
          </div>
        ) : null}
      </>
    ) : (
      <EmbedNote>{show === "mine" ? `Nothing in ${name} is assigned to you.` : show === "open" ? `No open tasks in ${name}.` : `No tasks in ${name} yet.`}</EmbedNote>
    )
  }

  return (
    <NodeViewWrapper data-task-list-embed={show}>
      <EmbedFrame selected={drawnSelected(editor, selected)} head={head}>
        {body}
      </EmbedFrame>
    </NodeViewWrapper>
  )
}

/** One task: its status (a tick for whoever may), its name, who has it and when it's due. */
function TaskRow({ task, today, canTick, onTick, onOpen }: { task: TaskInfoInterface; today: string; canTick: boolean; onTick(): void; onOpen(e: React.MouseEvent): void }) {
  const status = (task.task_status || "todo") as StatusCategory
  const done = status === "done"
  const statusName = statusOptionOf(task)?.label ?? "To do"
  const glyph = <StatusGlyph status={CATEGORY_KIND[status] ?? "todo"} size={16} label={statusName} />
  return (
    <div role="listitem" className="flex min-h-9 items-center gap-2 border-b border-line px-3 last:border-b-0">
      {canTick ? (
        <button
          type="button"
          onClick={onTick}
          aria-label={done ? `Mark “${task.task_name}” not done` : `Mark “${task.task_name}” done`}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md hover:bg-hover focus-visible:outline-2 focus-visible:outline-brand"
        >
          {glyph}
        </button>
      ) : (
        <span className="inline-flex size-6 shrink-0 items-center justify-center">{glyph}</span>
      )}
      <a
        href={`/app/task/${task.task_uuid}`}
        onClick={onOpen}
        className={cn("min-w-0 flex-1 truncate text-ui text-ink hover:underline", done && "text-ink-3 line-through")}
      >
        {task.task_name || "Untitled task"}
      </a>
      {/* Each reader reads the embed as themselves: a restricted task shows
          only to its people, with its lock, so they know others don't (WA2b). */}
      <RestrictedMark restricted={task.task_restricted} />
      {task.task_assignee?.user_uuid ? (
        <ChatFace name={displayNameOf(task.task_assignee)} profileKey={task.task_assignee.user_profile_object_key} userUUID={task.task_assignee.user_uuid} size={20} />
      ) : null}
      <DueLabel date={task.task_due_date} done={isClosedStatus(task.task_status)} now={parseISO(today)} />
    </div>
  )
}
