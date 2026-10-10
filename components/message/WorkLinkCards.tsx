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
import { format, isPast, parseISO } from "date-fns"

import { useFetch } from "@/hooks/useFetch"
import { LinkCardBody, hueTileClass, linkCardClass } from "@/components/message/LinkCard"
import { hueFor } from "@/lib/campHue"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { CheckSquare, FileText, FolderKanban } from "@/lib/icons"
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

// The tile is in the thing's own hue (its project's, for a task), the colour
// its mark has in the sidebar and on its page; it was grey for all three.
function CardShell({ href, icon, title, detail, hueId }: { href: string; icon: React.ReactNode; title: string; detail?: React.ReactNode; hueId?: string }) {
  return (
    <Link href={href} onClick={(e) => e.stopPropagation()} className={linkCardClass}>
      <LinkCardBody icon={icon} iconClassName={hueId ? hueTileClass(hueFor(hueId)) : undefined} title={title} detail={detail} />
    </Link>
  )
}

function TaskCard({ id }: { id: string }) {
  const { data } = useFetch<TaskInfoRawInterface>(`${GetEndpointUrl.GetTaskInfo}/${id}`, undefined, QUIET, OWN_ERRORS)
  const t = data?.data
  if (!t?.task_name) return null
  const due = t.task_due_date ? parseISO(t.task_due_date) : null
  const dueOk = due && !Number.isNaN(due.getTime()) && due.getFullYear() > 1970
  const overdue = dueOk && isPast(due) && t.task_status !== "done" && t.task_status !== "canceled"
  // Only the date turns red when it has passed; the rest of the line is not late.
  const parts: React.ReactNode[] = [
    t.task_custom_status_name || taskStatusLabel(t.task_status),
    displayNameOf(t.task_assignee),
    dueOk ? <span key="due" className={overdue ? "text-danger-ink" : undefined}>due {format(due, "d MMM")}</span> : null,
    t.task_project?.project_name,
  ].filter(Boolean)
  return (
    <CardShell
      href={`/app/task/${id}`}
      hueId={t.task_project?.project_uuid}
      icon={<CheckSquare className="h-4 w-4" />}
      title={t.task_name}
      detail={parts.flatMap((part, i) => (i ? [" · ", part] : [part]))}
    />
  )
}

function DocCard({ id }: { id: string }) {
  const { data } = useFetch<DocInfoResponse>(`${GetEndpointUrl.GetDocInfo}/${id}`, undefined, QUIET, OWN_ERRORS)
  const d = data?.data
  if (!d?.doc_title) return null
  return <CardShell href={`/app/doc/${id}`} hueId={id} icon={<FileText className="h-4 w-4" />} title={d.doc_title} detail={d.doc_snippet || "Doc"} />
}

function ProjectCard({ id }: { id: string }) {
  const { data } = useFetch<ProjectInfoRawInterface>(`${GetEndpointUrl.GetProjectInfo}/${id}`, undefined, QUIET, OWN_ERRORS)
  const p = data?.data
  if (!p?.project_name) return null
  return (
    <CardShell
      href={`/app/project/${id}`}
      hueId={id}
      icon={<FolderKanban className="h-4 w-4" />}
      title={p.project_name}
      detail={p.project_team?.team_name ? `Project · ${p.project_team.team_name}` : "Project"}
    />
  )
}

export function WorkLinkCards({ text }: { text: string }) {
  const host = typeof window === "undefined" ? "" : window.location.host
  const links = workLinksIn(text || "", host)
  if (links.length === 0) return null
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {links.map((l) =>
        l.kind === "task" ? <TaskCard key={l.id} id={l.id} /> : l.kind === "doc" ? <DocCard key={l.id} id={l.id} /> : <ProjectCard key={l.id} id={l.id} />,
      )}
    </div>
  )
}
