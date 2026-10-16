"use client"

// WorkLinkCards: a link to a task, doc or project in this workspace, pasted into
// a message, shows as a live card under it (Slack's Work Objects, Linear's and
// Notion's unfurls). The card reads the item as the person looking at it, through
// the same endpoints the app already uses, so it shows only what they may see:
// a link they cannot open renders no card and stays a plain link.
//
// Additive, like AgentResultCards: it never changes the message's own text, and
// renders nothing when a message links to nothing of ours.

import { displayNameOf } from "@/lib/personName"
import Link from "next/link"
import { useState } from "react"
import { format, formatDistanceToNowStrict, isPast, parseISO } from "date-fns"

import { useFetch } from "@/hooks/useFetch"
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
import { taskStatusLabel, type TaskInfoRawInterface } from "@/types/task"
import type { DocInfoResponse } from "@/types/doc"
import type { ProjectInfoRawInterface } from "@/types/project"

export type WorkLinkKind = "task" | "doc" | "project"
export interface WorkLink {
  kind: WorkLinkKind
  id: string
}

const LINK = /(https?:\/\/[^\s"'<>/]+)?\/app\/(task|doc|project)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi

/**
 * The links to this workspace's tasks, docs and projects in a message, in
 * order, once each, at most `max`. A link to another host is another
 * workspace's, and is left alone. Pure, for its test.
 */
export function workLinksIn(raw: string, host: string, max = 3): WorkLink[] {
  if (!raw || raw.indexOf("/app/") === -1) return []
  const out: WorkLink[] = []
  const seen = new Set<string>()
  for (const m of raw.matchAll(LINK)) {
    const origin = m[1]
    if (origin) {
      try {
        if (new URL(origin).host !== host) continue
      } catch {
        continue
      }
    }
    const kind = m[2].toLowerCase() as WorkLinkKind
    const id = m[3].toLowerCase()
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ kind, id })
    if (out.length >= max) break
  }
  return out
}

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
// wait; one already in the cache is simply there.
function useWaited(isLoading: boolean): boolean {
  const [waited] = useState(isLoading)
  return waited
}

// The tile is in the thing's own hue (its project's, for a task), the colour
// its mark has in the sidebar and on its page; a project is its own tile.
function CardShell({ href, icon, hue, waited, ...body }: { href: string; icon: React.ReactNode; hue?: CampHue | "own"; waited?: boolean } & Omit<React.ComponentProps<typeof LinkCardBody>, "icon" | "iconClassName">) {
  return (
    <Link href={href} onClick={(e) => e.stopPropagation()} className={cn(linkCardClass, waited && "animate-fade-in")}>
      <LinkCardBody icon={icon} iconClassName={hue === "own" ? "" : hue ? hueTileClass(hue) : undefined} {...body} />
    </Link>
  )
}

const join = (parts: React.ReactNode[]) => parts.filter(Boolean).flatMap((part, i) => (i ? [" · ", part] : [part]))

function TaskCard({ id }: { id: string }) {
  const { data, isLoading } = useFetch<TaskInfoRawInterface>(`${GetEndpointUrl.GetTaskInfo}/${id}`, undefined, QUIET, OWN_ERRORS)
  const waited = useWaited(isLoading)
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

function DocCard({ id }: { id: string }) {
  const { data, isLoading } = useFetch<DocInfoResponse>(`${GetEndpointUrl.GetDocInfo}/${id}`, undefined, QUIET, OWN_ERRORS)
  const waited = useWaited(isLoading)
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

function ProjectCard({ id }: { id: string }) {
  const { data, isLoading } = useFetch<ProjectInfoRawInterface>(`${GetEndpointUrl.GetProjectInfo}/${id}`, undefined, QUIET, OWN_ERRORS)
  const waited = useWaited(isLoading)
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

export function WorkLinkCards({ text }: { text: string }) {
  const host = typeof window === "undefined" ? "" : window.location.host
  const links = workLinksIn(text || "", host)
  if (links.length === 0) return null
  // 8px under the body, 6px between cards (C07's rhythm).
  return (
    // /collapse hides link cards with the pictures (app/globals.css).
    <div data-work-cards="" data-message-media="" className="mt-2 flex flex-col gap-1.5">
      {links.map((l) =>
        l.kind === "task" ? <TaskCard key={l.id} id={l.id} /> : l.kind === "doc" ? <DocCard key={l.id} id={l.id} /> : <ProjectCard key={l.id} id={l.id} />,
      )}
    </div>
  )
}
