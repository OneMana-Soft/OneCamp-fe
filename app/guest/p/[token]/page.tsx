"use client"

// A project shared with a client: its tasks by status, how far along it is,
// and each task's description and (when the link allows) its comments. No
// account; the link opens this one project and nothing else. The board
// refreshes by polling, since a guest has no session for the live connection.

import { use, useCallback, useEffect, useState } from "react"
import { ArrowLeft, Calendar, FolderKanban, Loader2, MessageSquare, User } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import {
  commentOnGuestTask,
  getGuestProject,
  getGuestProjectTask,
  type GuestProjectView,
  type GuestTaskCard,
  type GuestTaskView,
} from "@/services/guestService"
import { GUEST_POLL_MS, GuestComposer, GuestLinkGone, GuestLoading, GuestMessageView, GuestNameForm, useGuestName } from "@/components/guest/guestUi"
import { MadeWithOneCamp } from "@/components/public/MadeWithOneCamp"

// A board changes slower than a conversation.
const BOARD_POLL_MS = GUEST_POLL_MS * 3

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" })

function isOverdue(t: GuestTaskCard) {
  return !!t.due_date && t.status !== "done" && new Date(t.due_date).getTime() < Date.now()
}

export default function GuestProjectPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading")
  const [view, setView] = useState<GuestProjectView | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const refresh = useCallback(async (poll: boolean) => {
    const res = await getGuestProject(token, poll)
    if (!res.ok) {
      // A dropped connection keeps what's shown; a dead link replaces it.
      setState((s) => (s === "ready" && res.status === 0 ? s : "missing"))
      return
    }
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

  if (state === "loading") return <GuestLoading />
  if (state === "missing" || !view) return <GuestLinkGone />

  const pct = view.total_tasks ? Math.round((view.done_tasks / view.total_tasks) * 100) : 0

  return (
    <main className="flex h-dvh flex-col bg-background">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
        <FolderKanban className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <h1 className="min-w-0 truncate font-semibold">{view.project}</h1>
        <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-label={`${view.done_tasks} of ${view.total_tasks} tasks done`}>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <span className="tabular-nums">{view.done_tasks} of {view.total_tasks} done</span>
        </div>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">You&apos;re a guest</span>
      </header>
      <div className="flex min-h-0 flex-1">
        <section className={`min-w-0 flex-1 overflow-auto p-4 ${open ? "hidden md:block" : ""}`}>
          {view.total_tasks === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">No tasks here yet.</p>
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
    } else if (res.status !== 0) setMissing(true)
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
              return res.ok ? null : res.msg
            }}
          />
        ) : (
          <GuestNameForm onName={setName} />
        )
      )}
    </aside>
  )
}
