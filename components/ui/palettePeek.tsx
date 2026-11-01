"use client"

// ⌘K's Space preview (linear-28 P3; V-db63-1 S2), part of the palette's own
// lazy chunk. It shows what the highlighted row can't: a task's status,
// priority, assignee, due date and label, and the first line a task, doc or
// board says (lib/search/peekFacts). The preview rides on the row's data
// attributes, so moving the selection never re-renders the palette.

import type { DueState } from "@/components/task/DueLabel"
import { Chip, LabelChip } from "@/components/ui/chip"
import { PriorityGlyph, StatusGlyph } from "@/components/ui/graphics/glyphs"
import { useDebounce } from "@/hooks/useDebounce"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/http/ownErrors"
import { Calendar, User } from "@/lib/icons"
import { taskFacts, taskFieldsOfRead, type PeekFact, type TaskPeekFields } from "@/lib/search/peekFacts"
import type { ChipTone } from "@/lib/ui/chipTone"
import { cn } from "@/lib/utils/helpers/cn"
import { GetEndpointUrl } from "@/services/endPoints"
import type { TaskInfoRawInterface } from "@/types/task"

/** What a row's preview shows: its kind, title and where it's from, and what the row can't show. */
export interface PeekInfo {
  title: string
  kind: string
  meta?: string
  task?: TaskPeekFields
  line?: string
}

/** A row's data attributes for its preview. */
export function peekAttrs(peek: PeekInfo | undefined): Record<string, string | undefined> {
  return {
    "data-peek-title": peek?.title,
    "data-peek-kind": peek?.kind,
    "data-peek-meta": peek?.meta,
    "data-peek-task": peek?.task ? JSON.stringify(peek.task) : undefined,
    "data-peek-line": peek?.line,
  }
}

function taskOf(json: string | null): TaskPeekFields | undefined {
  if (!json) return undefined
  try {
    const task = JSON.parse(json) as TaskPeekFields | null
    return typeof task?.id === "string" && task.id ? task : undefined
  } catch {
    return undefined
  }
}

/** The preview a row's data attributes describe, or null for a row without one. */
export function readPeek(row: HTMLElement | null): PeekInfo | null {
  const title = row?.getAttribute("data-peek-title")
  if (!row || !title) return null
  return {
    title,
    kind: row.getAttribute("data-peek-kind") ?? "",
    meta: row.getAttribute("data-peek-meta") || undefined,
    task: taskOf(row.getAttribute("data-peek-task")),
    line: row.getAttribute("data-peek-line") || undefined,
  }
}

/** Read once and kept, as the link cards read a task (components/message/workLinkCardsBody). */
const KEPT = { revalidateOnFocus: false, shouldRetryOnError: false }

/** How long the selection rests on a task before its preview reads it: arrowing past a row reads nothing. */
export const PEEK_READ_REST_MS = 150

// A task's properties: the hit's at once, then the task's own read, which adds
// its due date and a project's own status. It is the task panel's read under
// the panel's key, so opening the task next draws at once. A task that can't
// be read keeps the hit's properties. `rested` is the task the selection has
// rested on (PalettePeek's), so only that one is read.
function TaskFacts({ task, rested }: { task: TaskPeekFields; rested: string | undefined }) {
  const key = rested === task.id ? `${GetEndpointUrl.GetTaskInfo}/${task.id}` : ""
  const { data } = useFetch<TaskInfoRawInterface>(key, undefined, KEPT, OWN_ERRORS)
  const read = key && data?.data?.task_name ? taskFieldsOfRead(task.id, data.data) : undefined
  return <Facts facts={taskFacts(read ?? task, new Date())} />
}

const FACT_NAME: Record<PeekFact["kind"], string> = { status: "Status", priority: "Priority", assignee: "Assignee", due: "Due date", label: "Label" }

/** A due date's tone, as the task row draws it (DueLabel): today in sun, overdue in danger, a finished task's date in ink-3. */
const DUE_TONE: Partial<Record<DueState, ChipTone>> = { today: "sun", overdue: "danger" }

// Each property is the design system's chip (components/ui/chip, design v3
// §3.10), as the task card draws its own: the glyph inside it, a due date's
// meaning as the chip's tone, and each label a LabelChip in its own hue.
function Fact({ fact }: { fact: Exclude<PeekFact, { kind: "label" }> }) {
  const due = fact.kind === "due" ? fact.state : undefined
  return (
    <Chip tone={due && DUE_TONE[due]} className={cn("max-w-full", due === "done" && "text-ink-3")} title={fact.text}>
      <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
        {fact.kind === "status" && <StatusGlyph status={fact.glyph} size={12} className="shrink-0" />}
        {fact.kind === "priority" && <PriorityGlyph level={fact.level} size={12} className="shrink-0" />}
        {fact.kind === "assignee" && <User className="size-3 shrink-0" aria-hidden="true" />}
        {fact.kind === "due" && <Calendar className="size-3 shrink-0" aria-hidden="true" />}
        <span className="truncate">
          <span className="sr-only">{FACT_NAME[fact.kind]}: </span>
          {fact.text}
        </span>
      </span>
    </Chip>
  )
}

function Facts({ facts }: { facts: PeekFact[] }) {
  if (facts.length === 0) return null
  return (
    <ul aria-label="Properties" className="mt-3 flex flex-wrap gap-1.5">
      {facts.map((f, i) => (
        <li key={`${f.kind}-${i}`} data-peek-fact={f.kind} data-due={f.kind === "due" ? f.state : undefined} className="flex min-w-0 max-w-full">
          {f.kind === "label" ? (
            <>
              <span className="sr-only">{FACT_NAME.label}: </span>
              <LabelChip label={f.text} />
            </>
          ) : (
            <Fact fact={f} />
          )}
        </li>
      ))}
    </ul>
  )
}

/** The preview card. The CSS (.palette-peek) sets it beside the palette where the window has room, and under the list where it hasn't. */
export function PalettePeek({ peek }: { peek: PeekInfo }) {
  // The selection's rest is the card's, which stays while the preview is open.
  // Arrowing through a doc's row and back onto a task keeps waiting, where the
  // facts' own wait would start again as they mount and read that task at once.
  const rested = useDebounce(peek.task?.id, PEEK_READ_REST_MS)
  return (
    <div className="palette-peek" role="note" aria-label={`Preview of ${peek.title}`}>
      <div className="text-2xs font-medium text-ink-3">{peek.kind}</div>
      <div className="mt-1 text-heading font-semibold text-ink">{peek.title}</div>
      {peek.meta && <div className="mt-2 text-xs text-ink-2">{peek.meta}</div>}
      {peek.task && <TaskFacts task={peek.task} rested={rested} />}
      {peek.line && <p data-peek-body="" className="mt-3 line-clamp-3 text-xs text-ink-2">{peek.line}</p>}
      <div className="mt-4 flex items-center gap-3 text-2xs text-ink-3">
        <span><kbd className="kbd">⏎</kbd> open</span>
        <span><kbd className="kbd">Space</kbd> close preview</span>
      </div>
    </div>
  )
}
