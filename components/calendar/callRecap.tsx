"use client"

import { useEffect, useId, useRef, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ListTodo, Sparkles } from "@/lib/icons"
import { app_task_path } from "@/types/paths"
import type { ActionItem } from "@/lib/calls/callArtefacts"

/**
 * A call's recap on its event (gcal-new-event-notes, head B): its words, as the model wrote them, and its action
 * items, each with who and by when, and Make task (into a project the person picks) or its task once made. Drawn
 * under its call in an event's "Recordings & notes" (eventRecordings), for whoever the calendar lets read the call's
 * transcript; Make task only with the panel's means (whoever may change the event). It only presents: the panel
 * reads the projects and makes the task, as this lazy chunk takes none of the shared core. Inline, with no overlay,
 * so a phone's finger picks the project in its own picker.
 */

/** What the panel lends the recap to make an item's task. */
export interface RecapMeans {
  /** Makes item index of call key a task in project; rejects when refused (the panel's toast says why). */
  makeTask: (key: string, index: number, project: string) => Promise<unknown>
  /** The projects a task may go in, read when Make task opens. */
  projects: () => Promise<{ uuid: string; name: string }[]>
}

const plain = (l: string) => l.replace(/\*\*/g, "").trim()

/** A recap's words as sections: each heading (its emoji and markers left out) with its points. Pure. */
export function recapSections(recap: string): { heading?: string; points: string[] }[] {
  const out: { heading?: string; points: string[] }[] = []
  for (const raw of recap.split("\n")) {
    const l = raw.trim()
    if (!l) continue
    if (l.startsWith("#") || (l.length > 4 && l.startsWith("**") && l.endsWith("**"))) {
      out.push({ heading: plain(l).replace(/^[#\s]+/, "").replace(/^[^\p{L}\p{N}]+/u, "").replace(/:$/, ""), points: [] })
      continue
    }
    if (out.length === 0) out.push({ points: [] })
    out[out.length - 1].points.push(plain(l.replace(/^(?:[-*•+]|\d{1,2}[.)])\s+/, "")))
  }
  return out.filter((s) => s.points.length > 0)
}

/** "14 Nov" for 2026-11-14, as the calendar writes a day. Pure. */
function dueDay(due?: string): string | null {
  const d = due ? new Date(`${due}T00:00:00`) : null
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null
}

type Step = "idle" | "loading" | "error" | "pick" | "making"
/** The control the keys' focus goes to once its step is drawn (look F1): each step removes the one that had it. */
type Spot = "make" | "select" | "retry" | "close" | "task"

function Item({ item, index, callKey, means }: { item: ActionItem; index: number; callKey: string; means?: RecapMeans }) {
  const [step, setStep] = useState<Step>("idle")
  const [list, setList] = useState<{ uuid: string; name: string }[]>([])
  const [project, setProject] = useState("")
  const due = dueDay(item.due)
  const makeRef = useRef<HTMLButtonElement>(null)
  const selectRef = useRef<HTMLSelectElement>(null)
  const retryRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const taskRef = useRef<HTMLAnchorElement>(null)
  const spot = useRef<Spot | null>(null)
  // Only an action of this item sets a spot, so focus moves only where the person was. A made task's link
  // comes with the list's next read: until then Make task holds it.
  useEffect(() => {
    const to = spot.current
    if (!to) return
    const refs = { make: makeRef, select: selectRef, retry: retryRef, close: closeRef, task: taskRef }
    const el = refs[to].current ?? (to === "task" ? makeRef.current : null)
    el?.focus()
    if (to !== "task" || taskRef.current) spot.current = null
  }, [step, list, item.task])
  const go = (to: Spot, next: Step) => {
    spot.current = to
    setStep(next)
  }
  const open = async () => {
    if (!means) return
    go("make", "loading")
    try {
      const l = await means.projects()
      setList(l)
      setProject(l[0]?.uuid ?? "")
      go(l.length > 0 ? "select" : "close", "pick")
    } catch {
      go("retry", "error")
    }
  }
  const make = async () => {
    if (!means || !project) return
    setStep("making")
    try {
      await means.makeTask(callKey, index, project)
      go("task", "idle")
    } catch {
      setStep("pick")
    }
  }
  return (
    <li data-action-item="" className="flex flex-col gap-2 rounded-md bg-background/80 px-2.5 py-2 text-sm shadow-e1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="min-w-0 flex-1 basis-40 text-foreground">{item.text}</span>
        {item.owner && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{item.owner}</span>}
        {due && <span className="text-xs text-muted-foreground">{`Due ${due}`}</span>}
        {item.task ? (
          <Button asChild size="sm" variant="ghost" className="max-sm:min-h-10">
            <Link ref={taskRef} href={`${app_task_path}/${item.task}`} aria-label={`Open task: ${item.text}`}>
              <ListTodo className="size-4" aria-hidden />
              Task
            </Link>
          </Button>
        ) : means && (step === "idle" || step === "loading") ? (
          <Button
            ref={makeRef}
            type="button"
            size="sm"
            variant="secondary"
            className="max-sm:min-h-10"
            aria-label={`Make task: ${item.text}`}
            busy={step === "loading"}
            onClick={() => void open()}
          >
            <ListTodo className="size-4" aria-hidden />
            Make task
          </Button>
        ) : null}
      </div>
      {step === "loading" && (
        <p role="status" className="text-xs text-muted-foreground">
          Reading your projects…
        </p>
      )}
      {step === "error" && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-danger-ink">
          {typeof navigator !== "undefined" && navigator.onLine === false ? "You're offline. Couldn't load your projects." : "Couldn't load your projects."}
          <Button ref={retryRef} type="button" size="sm" variant="ghost" className="max-sm:min-h-10" onClick={() => void open()}>
            Try again
          </Button>
        </div>
      )}
      {(step === "pick" || step === "making") &&
        (list.length === 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            You&apos;re in no project to add it to.
            <Button ref={closeRef} type="button" size="sm" variant="ghost" className="max-sm:min-h-10" onClick={() => go("make", "idle")}>
              Close
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              ref={selectRef}
              aria-label="Project for the task"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className="h-11 min-w-0 flex-1 basis-40 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9"
            >
              {list.map((p) => (
                <option key={p.uuid} value={p.uuid}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button type="button" size="sm" className="max-sm:min-h-10" busy={step === "making"} onClick={() => void make()}>
              Make
            </Button>
            <Button type="button" size="sm" variant="ghost" className="max-sm:min-h-10" onClick={() => go("make", "idle")}>
              Cancel
            </Button>
          </div>
        ))}
    </li>
  )
}

export function CallRecap({ callKey, recap, items, means }: { callKey: string; recap?: string; items?: ActionItem[]; means?: RecapMeans }) {
  const titleId = useId()
  const sections = recap ? recapSections(recap) : []
  const has = items?.some((it) => it.text)
  if (sections.length === 0 && !has) return null
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2 rounded-lg bg-primary/5 px-3 py-2.5">
      <h4 id={titleId} className="flex items-center gap-1.5 text-xs font-semibold text-primary">
        <Sparkles className="size-3.5" aria-hidden />
        Recap
      </h4>
      {sections.map((s, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          {s.heading && <h5 className="text-xs font-medium text-muted-foreground">{s.heading}</h5>}
          <ul className="list-disc space-y-0.5 pl-4 text-sm text-foreground">
            {s.points.map((p, j) => (
              <li key={j}>{p}</li>
            ))}
          </ul>
        </div>
      ))}
      {has && (
        <div className="flex flex-col gap-1">
          <h5 className="text-xs font-medium text-muted-foreground">Action items</h5>
          <ul className="flex flex-col gap-1.5">
            {items!.map((it, i) => (it.text ? <Item key={i} item={it} index={i} callKey={callKey} means={means} /> : null))}
          </ul>
        </div>
      )}
    </section>
  )
}
