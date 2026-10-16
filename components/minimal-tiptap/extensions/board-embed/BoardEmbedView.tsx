"use client"

import * as React from "react"
import { parseISO } from "date-fns"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { useRouter } from "next/navigation"
import { useGuestReader } from "@/components/minimal-tiptap/guestReader"
import { ChatFace } from "@/components/message/chatFace"
import { StatusGlyph } from "@/components/ui/graphics/glyphs"
import { DueLabel, dueDateOf } from "@/components/task/DueLabel"
import { followHref, openTask, useToday } from "@/lib/liveEntity"
import { CATEGORY_KIND, isClosedStatus, type StatusCategory } from "@/lib/taskStatus"
import { ArrowUpRight, Kanban } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { displayNameOf } from "@/lib/personName"
import type { TaskInfoInterface } from "@/types/task"
import { EmbedFrame, embedState } from "../task-list-embed/embedFrame"
import { COLUMNS, tasksIn, useProjectBoard } from "../task-list-embed/useProjectBoard"

/** Cards a column shows before "N more". */
const PER_COLUMN = 12

/**
 * A project's board in a doc (docs C1, "/board"): its status columns, read as
 * the board reads them and live as tasks move anywhere. Wider than the text,
 * and it scrolls sideways on a narrow screen. A card opens its task; moving
 * cards is the project's own board's job. Someone outside the project reads
 * that they can't see it, never its name.
 */
export function BoardEmbedView({ node, selected }: NodeViewProps) {
  const projectId: string = node.attrs.projectId || ""
  const guest = useGuestReader()
  const read = useProjectBoard(projectId, { enabled: !guest && !!projectId })
  const { project, board } = read
  const today = useToday()
  const router = useRouter()
  const name = project.data?.name || "Untitled project"
  const go = (href: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    followHref(href, e, router.push)
  }
  const open = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    openTask(id, e, router.push)
  }

  const head = (
    <>
      <Kanban className="size-4 text-ink-3" aria-hidden="true" />
      <span className="min-w-0 truncate font-[510] text-ink">{guest || project.state !== "ok" ? "Board" : `${name} · Board`}</span>
      <span className="flex-1" />
      {project.state === "ok" ? (
        <a href={`/app/project/${projectId}`} onClick={go(`/app/project/${projectId}`)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-meta text-ink-2 hover:bg-hover hover:text-ink">
          Open board
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </a>
      ) : null}
    </>
  )

  const body =
    embedState({
      guest,
      projectId,
      read,
      what: "board",
      skeleton: (
        <div aria-hidden="true" className="flex gap-3 overflow-hidden p-3">
          {COLUMNS.slice(0, 4).map((c) => (
            <span key={c.key} className="h-28 w-56 shrink-0 animate-pulse rounded-lg bg-sunken motion-reduce:animate-none" />
          ))}
        </div>
      ),
    }) ??
    (board && (
      <div className="flex gap-3 overflow-x-auto p-3" role="list" aria-label={`${name} board`}>
        {COLUMNS.map((c) => {
          const tasks = tasksIn(board, c.key)
          const count = c.status === "done" ? Math.max(board.project_tasks_done_count ?? 0, tasks.length) : tasks.length
          return (
            <section key={c.key} role="listitem" aria-label={`${c.label}, ${count}`} className="flex w-60 shrink-0 flex-col gap-1.5 rounded-lg bg-sunken p-2">
              <div className="flex items-center gap-1.5 px-1 text-meta font-[510] text-ink-2">
                <StatusGlyph status={CATEGORY_KIND[c.status as StatusCategory] ?? "todo"} size={14} />
                {c.label}
                <span className="font-normal text-ink-3 tabular-nums">{count}</span>
              </div>
              {tasks.slice(0, PER_COLUMN).map((t) => (
                <Card key={t.task_uuid} task={t} today={today} onOpen={(e) => open(e, t.task_uuid)} />
              ))}
              {count > Math.min(tasks.length, PER_COLUMN) ? (
                <a href={`/app/project/${projectId}`} onClick={go(`/app/project/${projectId}`)} className="px-1 text-meta text-ink-2 hover:text-ink">
                  {count - Math.min(tasks.length, PER_COLUMN)} more
                </a>
              ) : null}
            </section>
          )
        })}
      </div>
    ))

  return (
    <NodeViewWrapper data-board-embed="">
      <EmbedFrame selected={selected} head={head}>
        {body}
      </EmbedFrame>
    </NodeViewWrapper>
  )
}

/** A task as a card: its name, who has it and when it's due. */
function Card({ task, today, onOpen }: { task: TaskInfoInterface; today: string; onOpen(e: React.MouseEvent): void }) {
  const done = task.task_status === "done"
  const hasDue = !!dueDateOf(task.task_due_date)
  return (
    <a
      href={`/app/task/${task.task_uuid}`}
      onClick={onOpen}
      className="flex flex-col gap-1.5 rounded-lg bg-raised p-2 text-ui text-ink shadow-e1 transition-shadow duration-[140ms] hover:shadow-e2 focus-visible:outline-2 focus-visible:outline-brand motion-reduce:transition-none"
    >
      <span className={cn("line-clamp-2", done && "text-ink-3")}>{task.task_name || "Untitled task"}</span>
      {task.task_assignee?.user_uuid || hasDue ? (
        <span className="flex items-center gap-1.5">
          {task.task_assignee?.user_uuid ? (
            <ChatFace name={displayNameOf(task.task_assignee)} profileKey={task.task_assignee.user_profile_object_key} userUUID={task.task_assignee.user_uuid} size={18} />
          ) : null}
          <span className="flex-1" />
          <DueLabel date={task.task_due_date} done={isClosedStatus(task.task_status)} variant="card" now={parseISO(today)} />
        </span>
      ) : null}
    </a>
  )
}
