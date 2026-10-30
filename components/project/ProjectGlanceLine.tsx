"use client"

import { useEffect, useRef } from "react"

import { CountTick } from "@/components/ui/CountTick"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { ProjectInfoRawInterface } from "@/types/project"
import { projectGlance, type ProjectGlance } from "@/lib/utils/projectGlance"
import { cn } from "@/lib/utils/helpers/cn"
import { openTotal } from "@/lib/board/columnTotals"
import { useProjectStatuses } from "@/hooks/useProjectStatuses"

/**
 * Where a project stands, in one meta row (design v3, work.md W16): "6 open ·
 * 1 overdue · 4 due this week · 11 done", each number at 510 in ink and
 * ticking when it changes, the words in ink-2, "overdue" in danger ink only
 * above zero, with 3 px dots between. It reads the same request as the
 * unfiltered board, so the two share a cache and the row moves as soon as a
 * card does.
 */
export type GlanceKind = "open" | "overdue" | "week" | "done"

export function ProjectGlanceLine({ projectId, className, onGlance, onPick }: { projectId: string; className?: string; onGlance?: (g: ProjectGlance) => void; /** Each count filters the list to what it counts (work.md W16). */ onPick?: (kind: GlanceKind) => void }) {
  // The board's address as projectTaskKanban sends it with nothing narrowing
  // it: no "?" at all. The empty query this added was a second cache entry.
  const { data } = useFetch<ProjectInfoRawInterface>(projectId ? `${GetEndpointUrl.GetProjectTaskListForKanban}/${projectId}` : "")
  const p = data?.data
  // The server's count of open tasks, column by column (PROJ-BUG-8), once the
  // project's statuses say which columns are open.
  const { options } = useProjectStatuses(projectId)
  const open = openTotal(p?.project_column_counts, options)
  const g = p
    ? projectGlance(
        [
          ...(p.project_tasks_backlog ?? []),
          ...(p.project_tasks_todo ?? []),
          ...(p.project_tasks_in_progress ?? []),
          ...(p.project_tasks_in_review ?? []),
          ...(p.project_tasks_done ?? []),
          ...(p.project_tasks_canceled ?? []),
        ],
        new Date(),
        p.project_tasks_done_count,
        open,
      )
    : null
  // A project bigger than the board loads: its dates' counts from the server,
  // exact, in the reader's day (PR1); one the board holds whole asks nothing.
  const exact = useFetch<{ data: { overdue: number; due_this_week: number } }>(
    g?.partial ? `/project/${projectId}/glance?tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}` : "",
  ).data?.data
  if (g && exact) {
    g.overdue = exact.overdue
    g.dueSoon = exact.due_this_week
    g.partial = false
  }
  const told = useRef("")
  useEffect(() => {
    if (!g || !onGlance) return
    const key = `${g.open}:${g.done}:${g.overdue}:${g.dueSoon}`
    if (key === told.current) return
    told.current = key
    onGlance(g)
  })
  // Its line held while it loads, so what's under it doesn't move when it arrives.
  if (!g) return <p aria-hidden className={cn("h-[18px] text-ui-sm", className)} />
  if (g.open === 0 && g.done === 0) return <p className={cn("text-ui-sm text-ink-2", className)}>No tasks yet</p>
  // With open tasks beyond those loaded, the date counts are at least what they say.
  const atLeast = (n: number) => (g.partial ? `${n}+` : n)
  const parts: { n: number | string; word: string; kind: GlanceKind; late?: boolean }[] = [{ n: g.open, word: "open", kind: "open" }]
  if (g.overdue > 0) parts.push({ n: atLeast(g.overdue), word: "overdue", kind: "overdue", late: true })
  if (g.dueSoon > 0) parts.push({ n: atLeast(g.dueSoon), word: "due this week", kind: "week" })
  if (g.done > 0) parts.push({ n: g.done, word: "done", kind: "done" })
  return (
    <p data-glance="" className={cn("flex min-w-0 items-center gap-[14px] whitespace-nowrap text-ui-sm text-ink-2", className)}>
      {parts.map((part, i) => (
        <span key={part.word} className="inline-flex items-center gap-[14px]">
          {i > 0 && <span aria-hidden="true" className="text-ink-4">·</span>}
          {onPick ? (
            <button
              type="button"
              data-glance-count={part.kind}
              onClick={() => onPick(part.kind)}
              title={`Show the ${part.word} tasks`}
              className={cn("-mx-1 rounded-sm px-1 underline-offset-[3px] hover:underline focus-visible:outline-2 focus-visible:outline-ring", part.late && "text-danger-ink")}
            >
              <CountTick value={part.n} className={cn("font-[510]", part.late ? "text-danger-ink" : "text-foreground")} /> {part.word}
            </button>
          ) : (
            <span className={cn(part.late && "text-danger-ink")}>
              <CountTick value={part.n} className={cn("font-[510]", part.late ? "text-danger-ink" : "text-foreground")} /> {part.word}
            </span>
          )}
        </span>
      ))}
    </p>
  )
}
