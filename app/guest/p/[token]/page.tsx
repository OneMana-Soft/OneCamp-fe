"use client"

// A project shared with a client: its tasks by status (or on a timeline),
// how far along it is, and each task's description and (when the link
// allows) its comments. No account; the link opens this one project and
// nothing else. The board refreshes by polling, since a guest has no session
// for the live connection.

import { use, useCallback, useEffect, useMemo, useState } from "react"
import { ArrowLeft, Calendar, FolderKanban, Loader2, MessageSquare, User } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import {
  reviewGuestTask,
  commentOnGuestTask,
  getGuestProject,
  getGuestProjectTask,
  type GuestProjectView,
  type GuestTaskCard,
  type GuestTaskView,
} from "@/services/guestService"
import { GUEST_POLL_MS, GuestComposer, GuestLinkGone, GuestMessageView, GuestNameForm, GuestNotYet, GuestTroubleNote, useGuestName } from "@/components/guest/guestUi"
import { publicTrouble, sendFailedText, type PublicTrouble } from "@/services/publicApi"
import { MadeWithOneCamp } from "@/components/public/MadeWithOneCamp"
import { ReviewBadge } from "@/components/guest/ReviewBadge"
import { GuestUpdates } from "@/components/guest/GuestUpdates"
import { ProjectTimeline } from "@/components/project/timeline/ProjectTimeline"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useStoredState } from "@/hooks/useStoredState"
import type { TimelineTask } from "@/lib/timeline"
import { Textarea } from "@/components/ui/textarea"

// A board changes slower than a conversation.
const BOARD_POLL_MS = GUEST_POLL_MS * 3

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" })

function isOverdue(t: GuestTaskCard) {
  return !!t.due_date && t.status !== "done" && new Date(t.due_date).getTime() < Date.now()
}

type GuestMode = "board" | "timeline"
const isMode = (v: unknown): v is GuestMode => v === "board" || v === "timeline"

/** The client's cards as the timeline draws them: read-only, the same tasks as the board. */
function timelineTasksOf(view: GuestProjectView | null): TimelineTask[] {
  return (view?.columns ?? []).flatMap((c) =>
    c.tasks.map((t) => ({
      task_uuid: t.id,
      task_name: t.name,
      task_status: t.status,
      task_start_date: t.start_date,
      task_due_date: t.due_date,
      task_assignee: t.assignee ? { user_uuid: t.assignee, user_name: t.assignee } : null,
    })),
  )
}

/** A phone-width window: the timeline lays itself out for one. */
function useNarrow() {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const m = window.matchMedia("(max-width: 639px)")
    const update = () => setNarrow(m.matches)
    update()
    m.addEventListener("change", update)
    return () => m.removeEventListener("change", update)
  }, [])
  return narrow
}

export default function GuestProjectPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading")
  // Why the board can't refresh just now; it keeps trying.
  const [trouble, setTrouble] = useState<PublicTrouble | null>(null)
  const [view, setView] = useState<GuestProjectView | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [mode, setMode] = useStoredState<GuestMode>(`oc_guest_view:${token}`, "board", isMode)
  const narrow = useNarrow()
  const timelineTasks = useMemo(() => timelineTasksOf(view), [view])

  const refresh = useCallback(async (poll: boolean) => {
    const res = await getGuestProject(token, poll)
    if (!res.ok) {
      // A dead link replaces what's shown; a busy or unreachable server keeps
      // it, says so, and the next poll tries again.
      const t = publicTrouble(res.status)
      if (t === "gone") setState("missing")
      else setTrouble(t)
      return
    }
    setTrouble(null)
    setView(res.data)
    setState("ready")
  }, [token])

  useEffect(() => {
    void refresh(false)
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void refresh(true)
    }, BOARD_POLL_MS)
    return () => clearInterval(t)
  }, [refresh])

  if (state === "loading") return <GuestNotYet trouble={trouble} />
  if (state === "missing" || !view) return <GuestLinkGone />

  const pct = view.total_tasks ? Math.round((view.done_tasks / view.total_tasks) * 100) : 0

  return (
    <main className="flex h-dvh flex-col bg-background">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
        <FolderKanban className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <h1 className="min-w-0 flex-1 truncate font-semibold sm:flex-none">{view.project}</h1>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground sm:order-last sm:ml-auto">You&apos;re a guest</span>
        <div className="flex w-full items-center gap-2 text-xs text-muted-foreground sm:w-auto" aria-label={`${view.done_tasks} of ${view.total_tasks} tasks done`}>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted sm:w-24 sm:flex-none" aria-hidden>
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <span className="tabular-nums">{view.done_tasks} of {view.total_tasks} done</span>
        </div>
      </header>
      <GuestTroubleNote trouble={trouble} />
      <div className="flex min-h-0 flex-1">
        <section className={`min-w-0 flex-1 overflow-auto p-4 ${open ? "hidden md:block" : ""}`}>
          <div className="max-w-3xl">
            <GuestUpdates updates={view.updates ?? []} />
          </div>
          {view.total_tasks > 0 && (
            <ToggleGroup
              type="single"
              size="sm"
              value={mode}
              onValueChange={(v) => isMode(v) && setMode(v)}
              aria-label="Show the tasks as"
              className="mb-4 w-fit rounded-md border p-0.5"
            >
              <ToggleGroupItem value="board" className="h-7 px-2.5 text-xs">Board</ToggleGroupItem>
              <ToggleGroupItem value="timeline" className="h-7 px-2.5 text-xs">Timeline</ToggleGroupItem>
            </ToggleGroup>
          )}
          {view.total_tasks === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">No tasks here yet.</p>
          ) : mode === "timeline" ? (
            <div className="h-[calc(100dvh-13rem)] min-h-[24rem]">
              <ProjectTimeline projectId="" viewKey={`guest:${token}`} tasks={timelineTasks} compact={narrow} onOpenTask={setOpen} />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-flow-col md:auto-cols-[minmax(14rem,1fr)]">
              {view.columns.map((col) => (
                <section key={col.status} aria-label={col.label} className="flex min-w-0 flex-col gap-2">
                  <h2 className="flex items-baseline gap-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {col.label}
                    <span className="tabular-nums">{col.tasks.length}</span>
                  </h2>
                  {col.tasks.length === 0 && <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">Nothing here</p>}
                  {col.tasks.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setOpen(t.id)}
                      aria-current={open === t.id ? "true" : undefined}
                      className={`rounded-md border bg-card p-3 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${open === t.id ? "border-primary/60" : ""}`}
                    >
                      <p className="break-words text-sm font-medium">{t.name}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {t.status_label !== col.label && <span className="rounded bg-muted px-1.5 py-0.5">{t.status_label}</span>}
                        {t.due_date && (
                          <span className={`flex items-center gap-1 ${isOverdue(t) ? "text-destructive" : ""}`}>
                            <Calendar className="h-3 w-3" aria-hidden />
                            {isOverdue(t) ? "Overdue · " : ""}{day(t.due_date)}
                          </span>
                        )}
                        {t.assignee && (
                          <span className="flex min-w-0 items-center gap-1">
                            <User className="h-3 w-3 shrink-0" aria-hidden />
                            <span className="truncate">{t.assignee}</span>
                          </span>
                        )}
                        {view.can_comment && t.comment_count > 0 && (
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" aria-hidden />
                            <span className="tabular-nums">{t.comment_count}</span>
                          </span>
                        )}
                      </div>
                      {t.review && <div className="mt-2"><ReviewBadge review={t.review} /></div>}
                    </button>
                  ))}
                </section>
              ))}
            </div>
          )}
          <MadeWithOneCamp surface="guest-project" className="mt-8" />
        </section>
        {open && <TaskPanel token={token} taskId={open} onClose={() => setOpen(null)} onCommented={() => void refresh(true)} />}
      </div>
    </main>
  )
}

function TaskPanel({ token, taskId, onClose, onCommented }: { token: string; taskId: string; onClose: () => void; onCommented: () => void }) {
  const [task, setTask] = useState<GuestTaskView | null>(null)
  const [missing, setMissing] = useState(false)
  const [name, setName] = useGuestName(token)

  const load = useCallback(async () => {
    const res = await getGuestProjectTask(token, taskId)
    if (res.ok) {
      setTask(res.data)
      setMissing(false)
    } else if (publicTrouble(res.status) === "gone") setMissing(true)
  }, [token, taskId])

  useEffect(() => {
    setTask(null)
    void load()
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load()
    }, GUEST_POLL_MS * 2)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <aside aria-label="Task" className="flex w-full min-w-0 flex-col border-l md:w-[28rem]">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Back to the board">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="truncate text-sm font-medium">{task?.name ?? "Task"}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {missing ? (
          <p className="text-sm text-muted-foreground">That task isn&apos;t here any more.</p>
        ) : !task ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : (
          <div className="grid gap-5">
            <div className="grid gap-2">
              <h2 className="break-words text-lg font-semibold">{task.name}</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Status</dt>
                <dd>{task.status_label}</dd>
                {task.assignee && (<><dt className="text-muted-foreground">Assignee</dt><dd className="truncate">{task.assignee}</dd></>)}
                {task.start_date && (<><dt className="text-muted-foreground">Starts</dt><dd>{day(task.start_date)}</dd></>)}
                {task.due_date && (<><dt className="text-muted-foreground">Due</dt><dd className={isOverdue(task) ? "text-destructive" : ""}>{day(task.due_date)}{isOverdue(task) ? " (overdue)" : ""}</dd></>)}
              </dl>
            </div>
            {task.description && <p className="whitespace-pre-wrap break-words text-sm">{task.description}</p>}
            {task.review && <ReviewBadge review={task.review} withNote />}
            {task.can_comment && (
              <ReviewControls
                name={name}
                onReview={async (decision, note) => {
                  const res = await reviewGuestTask(token, taskId, { display_name: name, decision, note })
                  if (res.ok) {
                    void load()
                    onCommented()
                  }
                  return res.ok ? null : sendFailedText(res)
                }}
              />
            )}
            {task.can_comment && (
              <section aria-label="Comments" className="grid gap-3">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Comments</h3>
                {task.comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
                <ol className="grid gap-3">
                  {task.comments.map((c) => <li key={c.id}><GuestMessageView m={c} /></li>)}
                </ol>
              </section>
            )}
          </div>
        )}
      </div>
      {task?.can_comment && !missing && (
        name ? (
          <GuestComposer
            placeholder="Write a comment"
            name={name}
            onRename={() => setName("")}
            onSend={async (text) => {
              const res = await commentOnGuestTask(token, taskId, { display_name: name, text })
              if (res.ok) {
                void load()
                onCommented()
              }
              return res.ok ? null : sendFailedText(res)
            }}
          />
        ) : (
          <GuestNameForm onName={setName} />
        )
      )}
    </aside>
  )
}

/** Approve a task, or ask for changes with a note. Needs the guest's name first. */
function ReviewControls({ name, onReview }: { name: string; onReview: (decision: "approved" | "changes", note: string) => Promise<string | null> }) {
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const send = async (decision: "approved" | "changes") => {
    setBusy(true)
    setError("")
    const err = await onReview(decision, decision === "changes" ? note : "")
    setBusy(false)
    if (err) setError(err)
    else {
      setAsking(false)
      setNote("")
    }
  }
  if (!name) return <p className="text-xs text-muted-foreground">Enter your name below to approve this or ask for changes.</p>
  return (
    <section aria-label="Your verdict" className="grid gap-2 rounded-md border p-3">
      {!asking ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => send("approved")} disabled={busy}>Approve</Button>
          <Button size="sm" variant="outline" onClick={() => setAsking(true)} disabled={busy}>Request changes</Button>
        </div>
      ) : (
        <div className="grid gap-2">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should change?" aria-label="What should change?" rows={3} maxLength={2000} autoFocus />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => send("changes")} disabled={busy || !note.trim()}>Send</Button>
            <Button size="sm" variant="ghost" onClick={() => setAsking(false)} disabled={busy}>Cancel</Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </section>
  )
}
