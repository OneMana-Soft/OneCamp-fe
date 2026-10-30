"use client"

// The cards under a message that links to a task, a doc or a project
// (WorkLinkCards.tsx finds the links). This code loads with the first such
// message, so a conversation without one never carries it.

import { displayNameOf } from "@/lib/personName"
import { useState } from "react"
import { format, formatDistanceToNowStrict, isPast, parseISO } from "date-fns"

import { useFetch } from "@/hooks/useFetch"
import { IntentLink } from "@/components/navigationBar/desktop/IntentLink"
import { CardProgress, LinkCardBody, LinkCardSkeleton, hueTileClass, linkCardClass } from "@/components/message/LinkCard"
import { ChatFace } from "@/components/message/chatFace"
import { StatusGlyph, type StatusKind } from "@/components/ui/graphics/glyphs"
import { cn } from "@/lib/utils/helpers/cn"
import { hueFor, type CampHue } from "@/lib/campHue"
import { useProjectHue } from "@/lib/projectHue"
import { ProjectTile } from "@/components/ui/graphics/ProjectTile"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { CheckSquare, FileText } from "@/lib/icons"
import { GetEndpointUrl } from "@/services/endPoints"
import type { TaskInfoRawInterface } from "@/types/task"
import { taskStatusLabel } from "@/types/taskScale"
import type { DocInfoResponse } from "@/types/doc"
import type { ProjectInfoRawInterface } from "@/types/project"
import type { WorkLink } from "@/components/message/WorkLinkCards"

/** Read once and kept: a card should not refetch on every focus. */
const QUIET = { revalidateOnFocus: false, shouldRetryOnError: false }

/** A built-in task status as its glyph (design v3, §3.11); a custom one reads as to do. */
export function statusKindOf(status: string | undefined): StatusKind {
  switch (status) {
    case "backlog":
      return "backlog"
    case "inProgress":
      return "progress"
    case "inReview":
      return "review"
    case "done":
      return "done"
    case "canceled":
      return "cancelled"
    default:
      return "todo"
  }
}

/** A doc's checklist, from its stored body: how many items, how many ticked. Pure. */
export function checklistOf(body: string | undefined): { done: number; total: number } {
  if (!body || body.indexOf("taskItem") === -1) return { done: 0, total: 0 }
  const items = body.match(/<li\b[^>]*data-type="taskItem"[^>]*>/g) || []
  const done = items.filter((t) => /data-checked="true"/.test(t)).length
  return { done, total: items.length }
}

// The card fades in where its skeleton stood (160 ms), only when it had to
// wait, for its item or for this code; one already in the cache is simply there.
function useWaited(isLoading: boolean, codeWaited: boolean): boolean {
  const [waited] = useState(isLoading || codeWaited)
  return waited
}

// The tile is in the thing's own hue (its project's, for a task), the colour
// its mark has in the sidebar and on its page; a project is its own tile.
function CardShell({ href, icon, hue, waited, ...body }: { href: string; icon: React.ReactNode; hue?: CampHue | "own"; waited?: boolean } & Omit<React.ComponentProps<typeof LinkCardBody>, "icon" | "iconClassName">) {
  return (
    <IntentLink href={href} onClick={(e) => e.stopPropagation()} className={cn(linkCardClass, waited && "animate-fade-in")}>
      <LinkCardBody icon={icon} iconClassName={hue === "own" ? "" : hue ? hueTileClass(hue) : undefined} {...body} />
    </IntentLink>
  )
}

const join = (parts: React.ReactNode[]) => parts.filter(Boolean).flatMap((part, i) => (i ? [" · ", part] : [part]))

function TaskCard({ id, codeWaited }: { id: string; codeWaited: boolean }) {
  const { data, isLoading } = useFetch<TaskInfoRawInterface>(`${GetEndpointUrl.GetTaskInfo}/${id}`, undefined, QUIET, OWN_ERRORS)
  const waited = useWaited(isLoading, codeWaited)
  const t = data?.data
  const taskProjectHue = useProjectHue(t?.task_project?.project_uuid)
  if (!t?.task_name) return isLoading ? <LinkCardSkeleton /> : null
  const due = t.task_due_date ? parseISO(t.task_due_date) : null
  const dueOk = due && !Number.isNaN(due.getTime()) && due.getFullYear() > 1970
  const overdue = dueOk && isPast(due) && t.task_status !== "done" && t.task_status !== "canceled"
  const assignee = t.task_assignee && displayNameOf(t.task_assignee)
  // Only the date turns danger when it has passed; the rest of the line is not late.
  return (
    <CardShell
      href={`/app/task/${id}`}
      hue={t.task_project?.project_uuid ? taskProjectHue : undefined}
      waited={waited}
      icon={<CheckSquare />}
      lead={<StatusGlyph status={statusKindOf(t.task_status)} size={14} label={t.task_custom_status_name || taskStatusLabel(t.task_status)} className="shrink-0" />}
      title={t.task_name}
      detail={join([
        "Task",
        t.task_project?.project_name,
        dueOk ? <span key="due" className={overdue ? "text-danger-ink" : undefined}>due {format(due, "d MMM")}</span> : null,
      ])}
      trailing={
        assignee ? (
          <ChatFace name={assignee} profileKey={t.task_assignee?.user_profile_object_key} userUUID={t.task_assignee?.user_uuid} size={20} className="shrink-0" />
        ) : undefined
      }
    />
  )
}

function DocCard({ id, codeWaited }: { id: string; codeWaited: boolean }) {
  const { data, isLoading } = useFetch<DocInfoResponse>(`${GetEndpointUrl.GetDocInfo}/${id}`, undefined, QUIET, OWN_ERRORS)
  const waited = useWaited(isLoading, codeWaited)
  const d = data?.data
  if (!d?.doc_title) return isLoading ? <LinkCardSkeleton /> : null
  const list = checklistOf(d.doc_body)
  const edited = d.doc_updated_at ? parseISO(d.doc_updated_at) : null
  const editedOk = edited && !Number.isNaN(edited.getTime()) && edited.getFullYear() > 1970
  return (
    <CardShell
      href={`/app/doc/${id}`}
      hue={hueFor(id)}
      waited={waited}
      icon={<FileText />}
      title={d.doc_title}
      detail={join(["Doc", editedOk ? `edited ${formatDistanceToNowStrict(edited, { addSuffix: true })}` : null, list.total ? `${list.total} checklist ${list.total === 1 ? "item" : "items"}` : null])}
      footer={list.total > 1 ? <CardProgress done={list.done} total={list.total} /> : undefined}
    />
  )
}

function ProjectCard({ id, codeWaited }: { id: string; codeWaited: boolean }) {
  const { data, isLoading } = useFetch<ProjectInfoRawInterface>(`${GetEndpointUrl.GetProjectInfo}/${id}`, undefined, QUIET, OWN_ERRORS)
  const waited = useWaited(isLoading, codeWaited)
  const p = data?.data
  if (!p?.project_name) return isLoading ? <LinkCardSkeleton /> : null
  return (
    <CardShell
      href={`/app/project/${id}`}
      hue="own"
      waited={waited}
      icon={<ProjectTile id={id} size={36} />}
      title={p.project_name}
      detail={p.project_team?.team_name ? `Project · ${p.project_team.team_name}` : "Project"}
    />
  )
}

/** A message's cards, in its links' order. `codeWaited`: this code had to load first, so each fades in. */
export default function WorkLinkCardList({ links, codeWaited }: { links: WorkLink[]; codeWaited: boolean }) {
  return links.map((l) =>
    l.kind === "task" ? (
      <TaskCard key={l.id} id={l.id} codeWaited={codeWaited} />
    ) : l.kind === "doc" ? (
      <DocCard key={l.id} id={l.id} codeWaited={codeWaited} />
    ) : (
      <ProjectCard key={l.id} id={l.id} codeWaited={codeWaited} />
    ),
  )
}
