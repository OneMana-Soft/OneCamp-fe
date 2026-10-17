"use client"

/**
 * "Find action items" in the doc AI bar (docs programme B9, ai-search-io
 * P0-6; AI edition only): the doc's action items as tasks to make, each with
 * its owner, its due date and the line it came from. Made in a project the
 * person may add tasks to (the picker lists only those; the server refuses any
 * other, and records the refusal), each links back to its line, and the line
 * gets the task's chip, live as any "+" reference is.
 *
 * Notion makes rows only when a meeting-notes database is set up. These are
 * tasks in the projects people already work in.
 */

import * as React from "react"
import type { Editor } from "@tiptap/core"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { findBlock } from "@/components/docEditor/registry/commandBus"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils/helpers/cn"
import { shortDate } from "@/lib/utils/date/shortDate"
import { Calendar, Check, Loader2, User } from "@/lib/icons"
import { findDocTasks, makeDocTasks, type DocTask, type DocTasksMade } from "@/lib/ai/docAIApi"
import { apiErrorMessage } from "@/lib/utils/apiError"

interface ProjectOption {
  project_uuid: string
  project_name: string
  project_deleted_at?: string
}

const live = (s?: string) => !s || s.startsWith("0001-01-01") || s.startsWith("1970-01-01")

/** Each made task's chip at the end of its line, in one transaction. */
function insertTaskChips(editor: Editor, made: DocTasksMade["tasks"]) {
  if (editor.isDestroyed || !editor.isEditable) return
  const { state } = editor
  const mention = state.schema.nodes.entityMention
  if (!mention) return
  const places = made
    .map((t) => ({ t, at: t.block_id ? findBlock(editor, t.block_id) : null }))
    .filter((x): x is { t: DocTasksMade["tasks"][number]; at: { from: number; to: number } } => !!x.at)
    .sort((a, b) => b.at.to - a.at.to)
  if (!places.length) return
  const tr = state.tr
  for (const { t, at } of places) {
    const node = state.doc.nodeAt(at.from)
    if (!node?.isTextblock) continue
    tr.insert(at.to - 1, [state.schema.text(" "), mention.create({ id: `task:${t.task_uuid}`, label: t.title, mentionSuggestionChar: "+" })])
  }
  if (tr.docChanged) editor.view.dispatch(tr.scrollIntoView())
}

export function DocAiTasks({ editor, docId, onDone }: { editor: Editor; docId: string; onDone(): void }) {
  const [phase, setPhase] = React.useState<"finding" | "review" | "making" | "empty" | "error">("finding")
  const [tasks, setTasks] = React.useState<DocTask[]>([])
  const [chosen, setChosen] = React.useState<Set<number>>(new Set())
  const [note, setNote] = React.useState("")
  const [error, setError] = React.useState("")
  const [projectId, setProjectId] = React.useState("")
  const [docProject, setDocProject] = React.useState("")

  const { data } = useFetch<{ data: ProjectOption[] }>(GetEndpointUrl.projectListByAdminUID)
  const projects = React.useMemo(() => (data?.data ?? []).filter((p) => live(p.project_deleted_at)), [data])

  // The doc's own project first, when the person may add tasks to it,
  // whichever of the two answers comes first.
  React.useEffect(() => {
    if (!projectId && docProject && projects.some((p) => p.project_uuid === docProject)) setProjectId(docProject)
  }, [projects, projectId, docProject])

  React.useEffect(() => {
    let current = true
    findDocTasks(docId).then(
      (res) => {
        if (!current) return
        setDocProject(res.project?.uuid ?? "")
        const found = res.tasks ?? []
        setTasks(found)
        setChosen(new Set(found.map((_, i) => i)))
        setNote(res.note ?? "")
        setPhase(found.length ? "review" : "empty")
      },
      (e) => {
        if (!current) return
        setError(apiErrorMessage(e, "The doc couldn't be read just now. Try again in a moment."))
        setPhase("error")
      },
    )
    return () => {
      current = false
    }
  }, [docId])

  const toggle = (i: number) =>
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  const make = async () => {
    const picked = tasks.filter((_, i) => chosen.has(i))
    if (!projectId || picked.length === 0) return
    setPhase("making")
    setError("")
    try {
      const made = await makeDocTasks(docId, projectId, picked)
      insertTaskChips(editor, made.tasks)
      toast({
        title: `Made ${made.created} ${made.created === 1 ? "task" : "tasks"} in ${made.project.name}`,
        description: made.failed ? `${made.failed} couldn't be made.` : "Each one links back to its line.",
      })
      onDone()
    } catch (e) {
      setError(apiErrorMessage(e, "None of the tasks could be made just now. Try again in a moment."))
      setPhase("review")
    }
  }

  if (phase === "finding") {
    return (
      <p className="flex items-center gap-2 px-3 py-3 text-ui-sm text-ink-2" role="status">
        <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Finding action items
      </p>
    )
  }
  if (phase === "error" || phase === "empty") {
    return (
      <p className={cn("px-3 py-3 text-ui-sm", phase === "error" ? "text-danger-ink" : "text-ink-2")} role={phase === "error" ? "alert" : "status"}>
        {phase === "error" ? error : note || "No clear action items in this doc."}
      </p>
    )
  }

  const count = chosen.size
  return (
    <div className="flex flex-col">
      <ul className="max-h-[300px] overflow-y-auto p-1" aria-label="Action items">
        {tasks.map((t, i) => {
          const on = chosen.has(i)
          return (
            <li key={i}>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-hover">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(i)}
                  className="mt-0.5 size-4 shrink-0 accent-[var(--agent)] focus-visible:outline-2 focus-visible:outline-brand"
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-ui text-ink">{t.title}</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-meta text-ink-3">
                    <span className="inline-flex items-center gap-1">
                      <User className="size-3" aria-hidden="true" />
                      {t.assignee_name || "No owner"}
                    </span>
                    {t.due && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="size-3" aria-hidden="true" />
                        Due {shortDate(new Date(t.due))}
                      </span>
                    )}
                    {t.quote && <span className="min-w-0 truncate">“{t.quote}”</span>}
                  </span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
        <label className="sr-only" htmlFor="doc-ai-tasks-project">
          Project
        </label>
        <select
          id="doc-ai-tasks-project"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="h-8 min-w-0 max-w-[60%] flex-1 rounded-lg bg-raised px-2 text-ui-sm text-ink shadow-e1 outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <option value="">Pick a project</option>
          {projects.map((p) => (
            <option key={p.project_uuid} value={p.project_uuid}>
              {p.project_name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={make}
          disabled={!projectId || count === 0 || phase === "making"}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg bg-agent px-3 text-ui-sm font-[510] text-agent-foreground outline-none transition-opacity duration-[140ms] ease-[var(--ease-out)] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
        >
          {phase === "making" ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Check className="size-3.5" aria-hidden="true" />}
          {count === 1 ? "Make 1 task" : `Make ${count} tasks`}
        </button>
        {projects.length === 0 && data && <p className="basis-full text-meta text-ink-3">You aren&apos;t an admin of any project, so there&apos;s nowhere to make tasks.</p>}
        {error && (
          <p className="basis-full text-meta text-danger-ink" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
