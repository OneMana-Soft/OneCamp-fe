"use client"
import { shortDate } from "@/lib/utils/date/shortDate"

// A project shared with a client: its tasks by status (or on a timeline),
// how far along it is, and each task's description and (when the link
// allows) its comments. No account; the link opens this one project and
// nothing else. The board refreshes by polling, since a guest has no session
// for the live connection.

import { use, useCallback, useEffect, useMemo, useState } from "react"
import { ArrowLeft, X } from "@/lib/icons"
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
import {
  GUEST_POLL_MS,
  GuestComposer,
  GuestMessageView,
  GuestNameForm,
  GuestNotYet,
  GuestPanelPending,
  GuestTroubleNote,
  pollOutcome,
  useGuestName,
  useGuestPoll,
} from "@/components/guest/guestUi"
import { publicTrouble, sendFailedText, type PublicTrouble } from "@/services/publicApi"
import { MadeWithOneCamp } from "@/components/public/MadeWithOneCamp"
import { PublicGone } from "@/components/guest/publicStates"
import { ReviewBadge } from "@/components/guest/ReviewBadge"
import { GuestUpdates } from "@/components/guest/GuestUpdates"
import dynamic from "next/dynamic"
import { TabLoading } from "@/components/task/TabLoading"
import { useStoredState } from "@/hooks/useStoredState"
import { onEscape } from "@/lib/keys/onEscape"
import type { TimelineTask } from "@/lib/timeline"
import { Textarea } from "@/components/ui/textarea"
import { ProgressRing } from "@/components/ui/graphics/ProgressRing"
import { ProjectTile } from "@/components/ui/graphics/ProjectTile"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { useProjectHue } from "@/lib/projectHue"
import { relativeTime } from "@/lib/utils/relativeTime"
import { GuestCard, GuestStatusGlyph, awaitsReview } from "@/components/guest/GuestReview"
import { fieldLabel, fieldRow } from "@/lib/ui/fieldRow"

// The timeline is one tab of three, so it arrives when a guest opens it
// rather than with the board everyone sees first.
const ProjectTimeline = dynamic(() => import("@/components/project/timeline/ProjectTimeline").then((m) => m.ProjectTimeline), {
  loading: () => <TabLoading kind="timeline" className="min-h-0 px-0 pt-1" />,
})

// A board changes slower than a conversation.
const BOARD_POLL_MS = GUEST_POLL_MS * 3

const day = (iso: string) => shortDate(new Date(iso))

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
  const [reviewOnly, setReviewOnly] = useState(false)
  // The guest's name, given in a task's panel; verdicts on cards go under it.
  const [guestName] = useGuestName(token)
  // The project's own hue and tile, keyed on its id as in the app; by name
  // from a server that sends no id.
  const projectKey = view?.project_uuid || view?.project || token
  const projectHue = useProjectHue(projectKey)
  const narrow = useNarrow()
  const timelineTasks = useMemo(() => timelineTasksOf(view), [view])

  const refresh = useCallback(async (poll: boolean) => {
    const res = await getGuestProject(token, poll)
    if (!res.ok) {
      // A dead link replaces what's shown; a busy or unreachable server keeps
      // it, says so, and the poll tries again, waiting longer each time.
      const t = publicTrouble(res.status)
      if (t === "gone") setState("missing")
      else setTrouble(t)
      return pollOutcome(res)
    }
    setTrouble(null)
    setView(res.data)
    setState("ready")
    return pollOutcome(res)
  }, [token])

  useGuestPoll(token, BOARD_POLL_MS, (first) => refresh(!first))

  const gone = <PublicGone surface="guest-project" noun="shared project" detail="The link may have expired or been turned off. Ask the person who shared it for a new one." />
  if (state === "loading") return <GuestNotYet trouble={trouble} gone={gone} shape="board" label="Opening the project…" />
  if (state === "missing" || !view) return gone

  const pct = view.total_tasks ? Math.round((view.done_tasks / view.total_tasks) * 100) : 0
  const reviewing = view.columns.flatMap((c) => c.tasks.filter(awaitsReview))
  const tabs: { value: GuestTab; label: string; count?: number }[] = [
    { value: "board", label: "Board" },
    { value: "timeline", label: "Timeline" },
    ...(view.can_comment ? [{ value: "review" as const, label: "Needs your review", count: reviewing.length }] : []),
  ]
  const tab: GuestTab = mode === "timeline" ? "timeline" : reviewOnly && view.can_comment ? "review" : "board"
  const pick = (t: GuestTab) => {
    setReviewOnly(t === "review")
    setMode(t === "timeline" ? "timeline" : "board")
  }
  const columns = tab === "review" ? [{ status: "inReview", label: "Needs your review", tasks: reviewing }] : view.columns
  const approve = async (taskId: string) => {
    const res = await reviewGuestTask(token, taskId, { display_name: guestName, decision: "approved", note: "" })
    if (res.ok) void refresh(true)
    return res.ok ? null : sendFailedText(res)
  }

  return (
    // The client view (design v3, work.md W51): the project's light on the
    // frame, a sheet inset from the window, the project's tile and a ring of
    // how far along it is, the latest update as the feature card, then the
    // board in the app's card anatomy.
    <main data-guest-project="" className={`${HUE_CLASS[projectHue]} relative isolate flex min-h-dvh flex-col bg-frame`}>
      <div aria-hidden="true" data-project-band="" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[280px] [background:radial-gradient(640px_280px_at_120px_0px,color-mix(in_oklab,var(--hue)_10%,transparent),transparent)]" />
      {/* 1280px: the board's four 280px columns, their gaps and the sheet's
          padding are 1212px, and at 1120 the Done column was cut through its
          cards on a 1440 window with room to spare (critic, 11 Oct). */}
      <div data-guest-project-frame="" className="mx-auto flex w-full max-w-[1280px] min-h-0 flex-1 flex-col p-0 sm:p-4">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-sheet shadow-sheet sm:rounded-2xl">
          <header className="flex items-start gap-3.5 px-4 pb-4 pt-5 sm:px-7 sm:pt-6">
            <ProjectTile id={projectKey} size={36} />
            <div className="min-w-0 flex-1">
              {/* Two lines on a phone before it is cut: beside the ring and the
                  Guest tag one line kept only "Acme website r…". */}
              <h1 className="line-clamp-2 text-title-1 font-semibold text-foreground sm:truncate">{view.project}</h1>
              <p className="mt-0.5 text-ui-sm text-ink-2">Shared with you · updated {relativeTime(view.generated_at)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
              <ProgressRing value={pct} size={40} weight={3} label={`${view.done_tasks} of ${view.total_tasks} tasks done`}>
                <span className="text-micro font-semibold">{view.done_tasks}/{view.total_tasks}</span>
              </ProgressRing>
              <span className="tag bg-camp-sun-tint text-camp-sun-ink">Guest</span>
            </div>
          </header>
          <GuestTroubleNote trouble={trouble} />
          <div className="flex min-h-0 flex-1">
            <section className={`min-w-0 flex-1 overflow-auto pb-6 ${open ? "hidden md:block" : ""}`}>
              {(view.updates?.length ?? 0) > 0 && (
                <div className="px-4 pb-4 sm:px-7">
                  <GuestUpdates updates={view.updates ?? []} />
                </div>
              )}
              <GuestTabs tabs={tabs} value={tab} onChange={pick} />
              {view.total_tasks === 0 ? (
                <p className="py-16 text-center text-sm text-ink-2">No tasks here yet.</p>
              ) : tab === "timeline" ? (
                <div className="h-[calc(100dvh-15rem)] min-h-[24rem] px-4 pt-3 sm:px-7">
                  <ProjectTimeline projectId="" hue={projectHue} viewKey={`guest:${token}`} tasks={timelineTasks} compact={narrow} onOpenTask={setOpen} />
                </div>
              ) : tab === "review" && reviewing.length === 0 ? (
                <p className="py-16 text-center text-sm text-ink-2">Nothing waits on you. Thank you.</p>
              ) : (
                <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pt-4 sm:snap-none sm:px-7">
                  {columns.map((col) => (
                    <section key={col.status} aria-label={col.label} className="flex w-[calc(100vw-48px)] shrink-0 snap-center flex-col rounded-xl bg-sunken p-2 dark:bg-white/[0.02] sm:w-[280px]">
                      <h2 className="flex h-8 items-center gap-2 px-1.5 text-ui-sm font-medium text-foreground">
                        <GuestStatusGlyph status={col.status} />
                        {col.label}
                        <span className="text-ui-sm font-normal tabular-nums text-ink-3">{col.tasks.length}</span>
                      </h2>
                      <div className="flex flex-col gap-2 pt-1">
                        {col.tasks.length === 0 && <p className="rounded-[10px] px-3 py-4 text-center text-xs text-ink-3">Nothing here</p>}
                        {col.tasks.map((t) => (
                          <GuestCard
                            key={t.id}
                            task={t}
                            opened={open === t.id}
                            showComments={view.can_comment}
                            canReview={view.can_comment && !!guestName}
                            onOpen={() => setOpen(t.id)}
                            onReview={() => approve(t.id)}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </section>
            {open && <TaskPanel token={token} taskId={open} onClose={() => setOpen(null)} onCommented={() => void refresh(true)} />}
          </div>
        </div>
        <MadeWithOneCamp surface="guest-project" className="py-5" />
      </div>
    </main>
  )
}

type GuestTab = "board" | "timeline" | "review"

/** The client view's tabs, in the app's tab language (work.md W17): one underline that slides. */
function GuestTabs({ tabs, value, onChange }: { tabs: { value: GuestTab; label: string; count?: number }[]; value: GuestTab; onChange: (t: GuestTab) => void }) {
  const i = Math.max(0, tabs.findIndex((t) => t.value === value))
  return (
    <div role="tablist" aria-label="Show the tasks as" className="relative flex h-10 items-stretch border-b border-line px-2 sm:px-5">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={t.value === value}
          data-guest-tab={t.value}
          onClick={() => onChange(t.value)}
          className={`relative flex items-center gap-1.5 px-3 text-ui outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${t.value === value ? "font-medium text-foreground" : "text-ink-2 hover:text-foreground"}`}
        >
          {t.label}
          {t.count != null && t.count > 0 && <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] bg-camp-sun-tint px-1 text-micro font-medium text-camp-sun-ink">{t.count}</span>}
          {t.value === value && <span aria-hidden="true" data-tab-underline="" data-index={i} className="absolute inset-x-2 -bottom-px h-0.5 rounded-[2px] bg-foreground [animation:work-fade-in_180ms_var(--ease-out)_both]" />}
        </button>
      ))}
    </div>
  )
}

function TaskPanel({ token, taskId, onClose, onCommented }: { token: string; taskId: string; onClose: () => void; onCommented: () => void }) {
  const [task, setTask] = useState<GuestTaskView | null>(null)
  const [missing, setMissing] = useState(false)
  // Why the task can't load or refresh just now; it keeps trying.
  const [trouble, setTrouble] = useState<PublicTrouble | null>(null)
  const [name, setName] = useGuestName(token)

  const load = useCallback(async () => {
    const res = await getGuestProjectTask(token, taskId)
    if (res.ok) {
      setTask(res.data)
      setMissing(false)
      setTrouble(null)
    } else {
      const t = publicTrouble(res.status)
      if (t === "gone") setMissing(true)
      else setTrouble(t)
    }
    return pollOutcome(res)
  }, [token, taskId])

  useEffect(() => {
    setTask(null)
    setTrouble(null)
  }, [taskId])
  useGuestPoll(`${token}:${taskId}`, GUEST_POLL_MS * 2, load)

  // The first Escape leaves a field (a half-written comment stays in it), the
  // next closes the panel, as Escape does across the app.
  useEffect(
    () =>
      onEscape("panel", (e) => {
        const target = e.target as HTMLElement | null
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) target.blur()
        else onClose()
      }),
    [onClose],
  )

  return (
    <aside aria-label="Task" className="flex w-full min-w-0 flex-col border-l md:w-[28rem]">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        {/* Back to the board where the panel covers it, a cross where it sits beside it. */}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close the task">
          <ArrowLeft className="h-4 w-4 md:hidden" aria-hidden="true" />
          <X className="hidden h-4 w-4 md:block" aria-hidden="true" />
        </Button>
        <span className="truncate text-sm font-medium">{task?.name ?? "Task"}</span>
      </div>
      {task && !missing && <GuestTroubleNote trouble={trouble} />}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {missing ? (
          <p className="text-sm text-muted-foreground">That task isn&apos;t here any more.</p>
        ) : !task ? (
          <GuestPanelPending trouble={trouble} />
        ) : (
          <div className="grid gap-5">
            <div className="grid gap-2">
              <h2 className="break-words text-lg font-semibold">{task.name}</h2>
              {/* As the team's task panel lays it out: a quiet label column, the
                  values starting at one x, in ink, on one line each. */}
              <dl className="grid gap-2">
                <div className={fieldRow("center", "mb-0")}>
                  <dt className={fieldLabel}>Status</dt>
                  <dd className="text-sm text-foreground">{task.status_label}</dd>
                </div>
                {task.assignee && (
                  <div className={fieldRow("center", "mb-0")}>
                    <dt className={fieldLabel}>Assignee</dt>
                    <dd className="truncate text-sm text-foreground">{task.assignee}</dd>
                  </div>
                )}
                {task.start_date && (
                  <div className={fieldRow("center", "mb-0")}>
                    <dt className={fieldLabel}>Starts</dt>
                    <dd className="text-sm text-foreground">{day(task.start_date)}</dd>
                  </div>
                )}
                {task.due_date && (
                  <div className={fieldRow("center", "mb-0")}>
                    <dt className={fieldLabel}>Due</dt>
                    <dd className={`text-sm ${isOverdue(task) ? "text-danger-ink" : "text-foreground"}`}>
                      {day(task.due_date)}
                      {isOverdue(task) ? " (overdue)" : ""}
                    </dd>
                  </div>
                )}
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
                <h3 className="text-sm font-medium text-foreground">Comments</h3>
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
            // The verdict above is the panel's one filled button.
            quiet
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
      {error && <p role="alert" className="text-xs text-danger-ink">{error}</p>}
    </section>
  )
}
