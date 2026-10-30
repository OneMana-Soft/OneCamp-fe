"use client"

// Polls and Q&A in a call (calls package A, "Ask the room": meet-10, zoom-02),
// for everyone in it, guests included, in every kind of call and on every
// plan (Zoom and Meet keep polls and Q&A for paid plans). Whoever runs the
// call starts and ends polls, shares held-back results, opens Q&A and says
// who sees which questions, and marks, pins or dismisses questions; everyone
// votes, asks (anonymously, where allowed) and upvotes. The server checks
// every one of these (business/CallControl); this panel draws what it allows,
// from the view the server answers each reader (runs). Loaded when it opens.

import * as React from "react"
import type { Room } from "livekit-client"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils/helpers/cn"
import { ArrowBigUp, ArrowUp, BarChart3, Check, CircleHelp, Pin, PinOff, Plus, Trash2, X } from "@/lib/icons"
import { clockTime } from "@/lib/utils/date/clock"
import { isComposingKey } from "@/lib/keys/ime"
import { busyWith } from "@/lib/ui/busyWith"
import { Tile } from "@/components/ui/graphics/Tile"
import type { MarkHue } from "@/components/ui/graphics/hues"
import { PollChoices } from "@/components/poll/PollChoices"
import {
  MAX_OPTION,
  MAX_OPTIONS,
  MAX_POLL_QUESTION,
  MAX_QUESTION,
  pollProblem,
  questionGroups,
  questionProblem,
  type Activity,
  type CallActivities,
  type CallPollView,
  type CallQA,
  type CallQuestionView,
  type PollDraft,
} from "@/lib/calls/activities"
import { retryingText } from "@/services/publicApi"
import type { ActivityAnswer } from "@/services/callActivitiesService"
import type { Asker } from "./handsRunner"
import { activitiesKey, useCallActivities } from "./useCallActivities"
import { SegmentedControl, type SegmentOption } from "@/components/ui/segmentedControl"
import { ToolSwitch } from "./ToolSwitch"
import { CALL_PANEL_FOOT, CALL_PANEL_TOOL, CALL_SIDE_PANEL, useKeptDraft } from "./sidePanel"

type Tab = "polls" | "questions"

/** Which questions everyone who doesn't run the call sees. */
const SHOWN: readonly SegmentOption<CallQA["shown"]>[] = [
  { value: "all", label: "All questions" },
  { value: "answered", label: "Answered only" },
]
type Act = (a: Activity) => Promise<ActivityAnswer>

/** The side panels' pill; one waiting while another action of its card runs is dimmed. */
const TOOL = cn(CALL_PANEL_TOOL, "disabled:opacity-50")
/** The pill as a square icon: 32 px, 44 px under touch. */
const ICON_TOOL = "w-8 justify-center px-0 [@media(pointer:coarse)]:w-11"
const CARD = "rounded-[12px] border border-white/[0.06] bg-white/[0.03] p-3"
const CHIP = "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-meta font-medium"

/** The tab to open on: a poll still taking votes, else open Q&A, else polls. Pure. */
export function firstTab(a: CallActivities): Tab {
  if (a.polls.some((p) => !p.closed)) return "polls"
  return a.qa.open ? "questions" : "polls"
}

/**
 * Runs a card's activities one at a time, with the error line they share.
 * The control whose action runs is busy (it spins in its leading icon's
 * place, app/interaction.css, and keeps its colour); the card's others wait,
 * disabled. A second press while one runs does nothing.
 */
function useRun(act: Act) {
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const running = React.useRef(false)
  const run = React.useCallback(
    async (key: string, a: Activity): Promise<boolean> => {
      if (running.current) return false
      running.current = true
      setBusy(key)
      setError(null)
      try {
        const answer = await act(a)
        if (!answer.ok) setError(answer.msg)
        return answer.ok
      } finally {
        running.current = false
        setBusy(null)
      }
    },
    [act],
  )
  /** A control's busy and disabled, by the key it runs under (busyWith). */
  const control = React.useCallback((key: string) => {
    const b = busyWith(busy, key)
    return { "aria-busy": b.busy || undefined, disabled: b.disabled, "data-press": "control" }
  }, [busy])
  return { busy, error, run, control }
}

/**
 * A change shown at once while it's sent: the last read with the change laid
 * over it, until the next read (a new object) answers, or the change fails.
 * A switch or an upvote moves under the finger, not a read later.
 */
function useAtOnce<T>(read: T) {
  const [ahead, setAhead] = React.useState<{ over: T; next: T } | null>(null)
  const shown = ahead && ahead.over === read ? ahead.next : read
  const show = (next: T) => setAhead({ over: read, next })
  const drop = () => setAhead(null)
  return { shown, show, drop }
}

export default function CallActivitiesPanel({ who, room, onClose }: { who: Asker; room: Room; onClose: () => void }) {
  const { activities, status, trouble, act, retry } = useCallActivities(who, room)
  const [tab, setTab] = React.useState<Tab | null>(null)
  const titleId = React.useId()
  const headingRef = React.useRef<HTMLHeadingElement>(null)
  // The tab to open on is chosen once, from the first read: the last poll
  // ending later never moves someone off the tab they're reading.
  if (tab === null && activities) setTab(firstTab(activities))
  const shown: Tab = tab ?? "polls"
  const draftKey = activitiesKey(who)

  // Opened, the panel takes focus, as Chat and People do.
  React.useEffect(() => headingRef.current?.focus({ preventScroll: true }), [])

  const openPolls = activities?.polls.filter((p) => !p.closed) ?? []
  const openQuestions = activities?.questions.filter((q) => q.state !== "answered") ?? []
  // What's open is a neutral count; brand is for what waits on you: a poll you
  // haven't voted in, and for whoever runs the call, a question nobody has taken up.
  const polls = { open: openPolls.length, waits: openPolls.some((p) => p.mine.length === 0) }
  const questions = { open: openQuestions.length, waits: !!activities?.runs && openQuestions.some((q) => q.state === "open") }

  return (
    <aside aria-labelledby={titleId} data-call-activities="" className={CALL_SIDE_PANEL}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
        <h2 ref={headingRef} tabIndex={-1} id={titleId} className="text-heading leading-tight outline-none">
          Polls and Q&amp;A
        </h2>
        <Button data-tone="light" aria-label="Close polls and Q&A" variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-lg text-ink-3 hover:text-foreground [@media(pointer:coarse)]:size-11">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Tabs shown={shown} onTab={setTab} polls={polls} questions={questions} />

      {trouble ? (
        <div role="status" className="mx-3 mt-3 flex items-center justify-between gap-2 rounded-[10px] bg-warning/10 px-3 py-2 text-ui-sm text-warning-ink" data-activities-trouble="">
          <span>{retryingText[trouble]}</span>
          <button type="button" className={TOOL} onClick={retry}>
            Try again
          </button>
        </div>
      ) : null}

      {status === "loading" ? (
        <div role="status" aria-label="Loading polls and questions" className="flex-1 space-y-2 px-3 py-3">
          {/* A poll card's frame, its mark and a title bar, not a blank box (DESIGN-BUILD-19). */}
          {[0, 1, 2].map((i) => (
            <div key={i} className={cn(CARD, "animate-pulse motion-reduce:animate-none")}>
              <div className="flex items-center gap-2">
                <Tile hue="sun" size="sm">
                  <BarChart3 />
                </Tile>
                <div className="h-3 w-2/3 rounded-sm bg-white/[0.08]" />
              </div>
              <div className="mt-3 h-8 rounded-lg bg-white/[0.05]" />
            </div>
          ))}
        </div>
      ) : status === "refused" || !activities ? (
        <p role="status" className="px-4 py-4 text-ui-sm text-ink-2" data-activities-refused="">
          Polls and questions are for the people in this call. Join it again to see them.
        </p>
      ) : shown === "polls" ? (
        <PollsTab activities={activities} act={act} draftKey={draftKey} />
      ) : (
        <QuestionsTab activities={activities} act={act} draftKey={draftKey} />
      )}
    </aside>
  )
}

/** How many of a tab's are still open, and whether one waits on you. */
interface TabCount {
  open: number
  waits: boolean
}

/** Polls | Questions, each with how many are still open: a tab list, by pointer or arrow keys. */
function Tabs({ shown, onTab, polls, questions }: { shown: Tab; onTab: (t: Tab) => void; polls: TabCount; questions: TabCount }) {
  const tabs: { id: Tab; label: string; count: TabCount; waits: string; icon: React.ReactNode }[] = [
    { id: "polls", label: "Polls", count: polls, waits: "one waits for your vote", icon: <BarChart3 className="h-4 w-4" /> },
    { id: "questions", label: "Questions", count: questions, waits: "one waits for an answer", icon: <CircleHelp className="h-4 w-4" /> },
  ]
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
    e.preventDefault()
    const next = shown === "polls" ? "questions" : "polls"
    onTab(next)
    ;(e.currentTarget.querySelector(`[data-tab="${next}"]`) as HTMLButtonElement | null)?.focus()
  }
  return (
    <div role="tablist" aria-label="Polls and questions" onKeyDown={onKey} className="mx-3 mt-3 grid shrink-0 grid-cols-2 gap-1 rounded-[10px] bg-white/[0.04] p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          data-tab={t.id}
          aria-selected={shown === t.id}
          tabIndex={shown === t.id ? 0 : -1}
          onClick={() => onTab(t.id)}
          className={cn(
            "flex h-8 items-center justify-center gap-1.5 rounded-[8px] text-ui-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand [@media(pointer:coarse)]:h-11",
            shown === t.id ? "bg-white/[0.10] text-foreground shadow-e1" : "text-ink-3 hover:text-foreground",
          )}
        >
          {t.icon}
          {t.label}
          {t.count.open > 0 ? (
            <span className={cn("grid h-[18px] min-w-[18px] place-items-center rounded-[9px] px-1 text-3xs font-semibold leading-none tabular-nums", t.count.waits ? "bg-brand text-brand-foreground" : "bg-[#3A3B41] text-[#EEEEF0]")}>
              {t.count.open}
              {t.count.waits ? <span className="sr-only">, {t.waits}</span> : null}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

// ---- Polls ----

function PollsTab({ activities, act, draftKey }: { activities: CallActivities; act: Act; draftKey: string }) {
  // A poll half written is kept while the panel is shut, and its form comes back open with it.
  const [draft, setDraft] = useKeptDraft(`poll ${draftKey}`, NEW_POLL)
  const [drafting, setDrafting] = React.useState(draft !== NEW_POLL)
  const start = useRun(act)
  const formId = React.useId()
  const done = () => {
    setDraft(NEW_POLL)
    setDrafting(false)
  }
  // The newest first: the poll just started is the one people look for.
  const polls = React.useMemo(() => [...activities.polls].reverse(), [activities.polls])
  return (
    <div role="tabpanel" aria-label="Polls" className="flex min-h-0 flex-1 flex-col" data-activities-polls="">
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {activities.runs ? (
          drafting ? (
            <PollForm id={formId} start={start} draft={draft} onDraft={setDraft} onDone={done} />
          ) : (
            <button type="button" className={cn(TOOL, "w-full justify-center bg-brand/90 text-brand-foreground hover:bg-brand")} onClick={() => setDrafting(true)} data-new-poll="">
              <Plus className="h-4 w-4" />
              New poll
            </button>
          )
        ) : null}
        {polls.length === 0 && !drafting ? (
          <Empty
            hue="sun"
            icon={<BarChart3 />}
            title={activities.runs ? "Ask the room" : "No polls yet"}
            detail={activities.runs ? "Start a poll and watch the answers come in live, from everyone in the call." : "When the people running the call start one, it shows up here."}
          />
        ) : (
          polls.map((p) => <PollCard key={p.id} poll={p} runs={activities.runs} act={act} />)
        )}
      </div>
      {activities.runs && drafting ? (
        // In the composer's place, not at the end of what scrolls: with more options and a phone's keyboard up, they stayed in reach (DESIGN-BUILD-19).
        <div className={cn(CALL_PANEL_FOOT, "flex justify-end gap-1.5")}>
          <button type="button" className={TOOL} onClick={done}>
            Cancel
          </button>
          <button type="submit" form={formId} className={cn(TOOL, "bg-brand/90 text-brand-foreground hover:bg-brand")} {...start.control("start")} data-start-poll="">
            Start poll
          </button>
        </div>
      ) : null}
    </div>
  )
}

function PollCard({ poll, runs, act }: { poll: CallPollView; runs: boolean; act: Act }) {
  const { busy, error, run, control } = useRun(act)
  // Held back from you, a poll shows only your own choice until it's shared.
  const counts = !poll.results_hidden || runs
  // Its rules in one quiet line beside its state. Held-back results are said
  // once: under the options to everyone else, here to whoever runs it.
  const said = [poll.anonymous && "anonymous", poll.multiple && "choose any", poll.results_hidden && runs && "results held back until you share them"].filter(Boolean).join(" · ")
  const rules = said && said[0].toUpperCase() + said.slice(1)
  return (
    <section className={CARD} aria-label={`Poll: ${poll.question}`} data-call-poll={poll.id}>
      <div className="flex items-start gap-2">
        <Tile hue="sun" size="sm" className="mt-0.5">
          <BarChart3 />
        </Tile>
        <h3 className="min-w-0 flex-1 break-words text-ui font-medium text-foreground">{poll.question}</h3>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-8">
        {poll.closed ? <span className={cn(CHIP, "bg-white/[0.06] text-ink-2")}>Ended</span> : <span className={cn(CHIP, "bg-success/15 text-success-ink")}>Open</span>}
        {rules ? <span className="text-meta text-ink-3">{rules}</span> : null}
      </div>
      <div className="mt-2">
        <PollChoices poll={poll} busy={busy} counts={counts} onChoose={(next, optionId) => void run(optionId, { op: "vote", id: poll.id, options: next })} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-meta text-ink-3">
        <span>{counts ? `${poll.voters} ${poll.voters === 1 ? "person" : "people"} voted` : "The people running the call share the results when the poll is done."}</span>
        {runs ? (
          <span className="flex gap-1.5">
            {poll.results_hidden ? (
              <button type="button" className={TOOL} {...control("share")} onClick={() => void run("share", { op: "share_results", id: poll.id })}>
                Share results
              </button>
            ) : null}
            {!poll.closed ? (
              <button type="button" className={TOOL} {...control("close")} onClick={() => void run("close", { op: "close_poll", id: poll.id })}>
                End poll
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 text-meta text-danger-ink">
          {error}
        </p>
      ) : null}
    </section>
  )
}

const NEW_POLL: PollDraft = { question: "", options: ["", ""], multiple: false, anonymous: false, hide_results: false }

/** A new poll's fields. Its Cancel and Start poll are the tab's foot (PollsTab), so start is the tab's one run. */
function PollForm({ id, start, draft, onDraft, onDone }: { id: string; start: ReturnType<typeof useRun>; draft: PollDraft; onDraft: (d: PollDraft) => void; onDone: () => void }) {
  const [tried, setTried] = React.useState(false)
  const { error, run } = start
  const problem = pollProblem(draft)
  const set = (patch: Partial<PollDraft>) => onDraft({ ...draft, ...patch })
  const setOption = (i: number, text: string) => set({ options: draft.options.map((o, j) => (j === i ? text : o)) })
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (problem) return
    if (await run("start", { op: "poll", poll: draft })) onDone()
  }
  return (
    <form id={id} onSubmit={submit} className={cn(CARD, "space-y-2")} aria-label="New poll" data-poll-form="">
      <label className="block">
        <span className="text-meta font-medium text-ink-2">Question</span>
        <textarea
          value={draft.question}
          onChange={(e) => set({ question: e.target.value })}
          maxLength={MAX_POLL_QUESTION}
          rows={2}
          autoFocus
          placeholder="What should we ask?"
          className="mt-1 w-full resize-none rounded-[8px] bg-white/[0.05] px-2.5 py-2 text-ui text-foreground placeholder:text-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        />
      </label>
      <fieldset className="space-y-1.5">
        <legend className="text-meta font-medium text-ink-2">Options</legend>
        {draft.options.map((o, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              value={o}
              onChange={(e) => setOption(i, e.target.value)}
              maxLength={MAX_OPTION}
              aria-label={`Option ${i + 1}`}
              placeholder={`Option ${i + 1}`}
              className="h-9 min-w-0 flex-1 rounded-[8px] bg-white/[0.05] px-2.5 text-ui text-foreground placeholder:text-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand [@media(pointer:coarse)]:h-11"
            />
            {draft.options.length > 2 ? (
              <button type="button" aria-label={`Remove option ${i + 1}`} className={cn(TOOL, "px-2")} onClick={() => set({ options: draft.options.filter((_, j) => j !== i) })}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ))}
        {draft.options.length < MAX_OPTIONS ? (
          <button type="button" className={TOOL} onClick={() => set({ options: [...draft.options, ""] })}>
            <Plus className="h-3.5 w-3.5" />
            Add option
          </button>
        ) : null}
      </fieldset>
      <ToolSwitch label="People can choose more than one" checked={draft.multiple} onChange={(on) => set({ multiple: on })} />
      <ToolSwitch label="Anonymous votes" help="Nobody, you included, can see who voted for what." checked={draft.anonymous} onChange={(on) => set({ anonymous: on })} />
      <ToolSwitch label="Show results when I share them" help="Until then only the people running the call see the counts." checked={draft.hide_results} onChange={(on) => set({ hide_results: on })} />
      {(tried && problem) || error ? (
        <p role="alert" className="text-meta text-danger-ink">
          {(tried && problem) || error}
        </p>
      ) : null}
    </form>
  )
}

// ---- Questions ----

function QuestionsTab({ activities, act, draftKey }: { activities: CallActivities; act: Act; draftKey: string }) {
  const { qa, runs } = activities
  const groups = questionGroups(activities.questions)
  const [dismissed, setDismissed] = React.useState<string | null>(null)
  const undo = useRun(act)
  return (
    <div role="tabpanel" aria-label="Questions" className="flex min-h-0 flex-1 flex-col" data-activities-questions="">
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {runs ? <QASettings qa={qa} act={act} /> : null}
        {!qa.open && !runs ? <Note>The people running the call haven&apos;t opened questions yet. When they do, ask here.</Note> : null}
        {qa.open && qa.shown === "answered" && !runs ? <Note>The people running the call are showing answered questions. Yours show here too, until they&apos;re answered.</Note> : null}
        {dismissed ? (
          <div className="flex items-center justify-between gap-2 rounded-[10px] bg-white/[0.04] px-3 py-2 text-ui-sm text-ink-2" data-question-dismissed="">
            <span>Question dismissed for everyone.</span>
            <button
              type="button"
              className={TOOL}
              {...undo.control("undo")}
              onClick={async () => {
                if (await undo.run("undo", { op: "question", id: dismissed, state: "open" })) setDismissed(null)
              }}
            >
              Undo
            </button>
          </div>
        ) : null}
        {groups.open.length === 0 && groups.answered.length === 0 ? (
          qa.open ? <Empty hue="lake" icon={<CircleHelp />} title="No questions yet" detail="Ask the first one. Upvote the ones you want answered." /> : null
        ) : (
          <>
            {groups.open.map((q) => (
              <QuestionCard key={q.id} question={q} runs={runs} act={act} onDismissed={setDismissed} />
            ))}
            {groups.answered.length > 0 ? (
              <h3 className="px-1 pt-2 text-meta font-medium uppercase tracking-wide text-ink-3">Answered · {groups.answered.length}</h3>
            ) : null}
            {groups.answered.map((q) => (
              <QuestionCard key={q.id} question={q} runs={runs} act={act} onDismissed={setDismissed} />
            ))}
          </>
        )}
      </div>
      {qa.open ? <AskBox qa={qa} act={act} draftKey={draftKey} /> : null}
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-[10px] bg-white/[0.04] px-3 py-2 text-ui-sm text-ink-2">{children}</p>
}

/** Nothing here yet, as the call's chat says it: the icon on its hue's tile, a title and one line. */
function Empty({ hue, icon, title, detail }: { hue: MarkHue; icon: React.ReactNode; title: string; detail: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-8 text-center" data-activities-empty="">
      <Tile hue={hue} size="lg" className="rounded-[12px]">
        {icon}
      </Tile>
      <p className="text-ui-sm font-medium text-[#EEEEF0]">{title}</p>
      <p className="text-meta text-pretty text-ink-3">{detail}</p>
    </div>
  )
}

/** How the call's Q&A works, for whoever runs it: open or not, anonymous asks, and which questions people see. */
function QASettings({ qa: read, act }: { qa: CallQA; act: Act }) {
  const { busy, error, run } = useRun(act)
  const now = useAtOnce(read)
  const qa = now.shown
  const shownId = React.useId()
  // One change at a time: a tap while one is sent does nothing. The whole setting goes, as the
  // server's op takes it, so two people running the call who switch different settings at the same
  // moment keep the later one; its packet has every screen read where it landed (CODE-REVIEWER-53).
  const set = async (patch: Partial<CallQA>) => {
    if (busy) return
    const next = { ...qa, ...patch }
    now.show(next)
    if (!(await run("qa", { op: "qa", qa: next }))) now.drop()
  }
  return (
    <section className={CARD} aria-label="How questions work" data-qa-settings="">
      <ToolSwitch label="Questions open" help={qa.open ? "Everyone in the call can ask and upvote." : "Open them so people can ask."} checked={qa.open} onChange={(on) => void set({ open: on })} />
      <ToolSwitch label="Allow anonymous questions" checked={qa.anonymous} onChange={(on) => void set({ anonymous: on })} />
      {/* Its own row, in halves: beside the label, in a 320px column, every word of it wrapped (DESIGN-BUILD-19). */}
      <div className="mt-3">
        <span className="text-ui-sm text-ink-2" id={shownId}>
          People see
        </span>
        <SegmentedControl aria-labelledby={shownId} value={qa.shown} onValueChange={(shown) => void set({ shown })} options={SHOWN} className="mt-1.5 w-full flex-nowrap" itemClassName="flex-1" />
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 text-meta text-danger-ink">
          {error}
        </p>
      ) : null}
    </section>
  )
}

function QuestionCard({ question, runs, act, onDismissed }: { question: CallQuestionView; runs: boolean; act: Act; onDismissed: (id: string) => void }) {
  const { busy, error, run, control } = useRun(act)
  const now = useAtOnce(question)
  const q = now.shown
  const answered = q.state === "answered"
  const upvote = async () => {
    if (busy) return
    const on = !q.voted
    now.show({ ...q, voted: on, votes: Math.max(0, q.votes + (on ? 1 : -1)) })
    if (!(await run("upvote", { op: "upvote", id: q.id, on }))) now.drop()
  }
  return (
    <section className={cn(CARD, q.pinned && "border-warning/30 bg-warning/[0.05]")} aria-label={`Question: ${q.text}`} data-call-question={q.id}>
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-ui text-foreground">{q.text}</p>
        <button
          type="button"
          aria-pressed={!!q.voted}
          aria-label={`Upvote, ${q.votes} ${q.votes === 1 ? "upvote" : "upvotes"}`}
          disabled={!!busy && busy !== "upvote"}
          onClick={() => void upvote()}
          className={cn(
            "flex h-11 w-10 shrink-0 flex-col items-center justify-center rounded-[10px] text-meta font-semibold tabular-nums transition-[transform,background-color,color] active:scale-95 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
            q.voted ? "bg-brand/20 text-brand-text" : "bg-white/[0.05] text-ink-2 hover:bg-white/[0.09] hover:text-foreground",
          )}
          data-upvote=""
        >
          <ArrowBigUp className={cn("h-4 w-4", q.voted && "fill-current")} />
          {q.votes}
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-meta text-ink-3">
        <span>{q.anonymous ? "Anonymous" : q.asker}</span>
        <span aria-hidden>·</span>
        <time dateTime={q.at}>{clockTime(q.at)}</time>
        {q.yours ? <span className={cn(CHIP, "bg-brand/15 text-brand-text")}>Yours</span> : null}
        {q.pinned ? (
          <span className={cn(CHIP, "bg-warning/15 text-warning-ink")}>
            <Pin className="h-3 w-3" />
            Pinned
          </span>
        ) : null}
        {answered ? (
          <span className={cn(CHIP, "bg-success/15 text-success-ink")}>
            <Check className="h-3 w-3" />
            Answered
          </span>
        ) : null}
      </div>
      {runs ? (
        // One row in a 320px column: the answer named, pin and dismiss as named icons (DESIGN-BUILD-19).
        <div className="mt-2 flex items-center gap-1.5">
          <button type="button" className={TOOL} {...control("state")} onClick={() => void run("state", { op: "question", id: q.id, state: answered ? "open" : "answered" })}>
            <Check className="h-3.5 w-3.5" />
            {answered ? "Not answered" : "Answered"}
          </button>
          <button type="button" aria-label={q.pinned ? "Unpin" : "Pin"} title={q.pinned ? "Unpin" : "Pin"} className={cn(TOOL, ICON_TOOL)} {...control("pin")} onClick={() => void run("pin", { op: "question", id: q.id, pinned: !q.pinned })}>
            {q.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            aria-label="Dismiss"
            title="Dismiss"
            className={cn(TOOL, ICON_TOOL, "ml-auto text-danger-ink")}
            {...control("dismiss")}
            onClick={async () => {
              if (await run("dismiss", { op: "question", id: q.id, state: "dismissed" })) onDismissed(q.id)
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-1.5 text-meta text-danger-ink">
          {error}
        </p>
      ) : null}
    </section>
  )
}

/** The ask box, pinned to the panel's foot: a question of up to 300 characters, anonymous where the call allows it. */
function AskBox({ qa, act, draftKey }: { qa: CallQA; act: Act; draftKey: string }) {
  // A question half written is kept while the panel is shut, as the call's chat keeps a message.
  const [text, setText] = useKeptDraft(`ask ${draftKey}`, "")
  const [anonymous, setAnonymous] = React.useState(false)
  const [tried, setTried] = React.useState(false)
  const { busy, error, run } = useRun(act)
  const problem = questionProblem(text)
  const length = [...text.trim()].length
  const anonymousId = React.useId()
  const send = async () => {
    setTried(true)
    if (problem) return
    // The choice goes as it stands (CODE-REVIEWER-53's MF1): turned off anonymous asks while the
    // switch was on are the server's to refuse, in its words, never a named ask. The switch then
    // starts off, so the next ask is chosen again.
    if (await run("ask", { op: "ask", text: text.trim(), anonymous })) {
      setText("")
      setTried(false)
    } else if (anonymous && !qa.anonymous) {
      setAnonymous(false)
    }
  }
  return (
    <form
      className={CALL_PANEL_FOOT}
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
      data-ask-box=""
    >
      <div className="flex items-end gap-2 rounded-[12px] bg-white/[0.05] p-1.5 focus-within:ring-2 focus-within:ring-brand">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !isComposingKey(e.nativeEvent)) {
              e.preventDefault()
              void send()
            }
          }}
          rows={1}
          aria-label="Ask a question"
          placeholder="Ask a question…"
          className="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-1.5 py-2 text-ui text-foreground placeholder:text-ink-3 focus-visible:outline-none"
        />
        <button
          type="submit"
          aria-label="Ask"
          aria-busy={!!busy || undefined}
          data-press="icon"
          disabled={!busy && !text.trim()}
          className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-brand text-brand-foreground transition-opacity disabled:bg-white/[0.08] disabled:text-ink-3 [@media(pointer:coarse)]:size-11 [&_svg]:size-4"
        >
          <ArrowUp aria-hidden />
        </button>
      </div>
      <div className="mt-1.5 flex min-h-6 items-center justify-between gap-2 [@media(pointer:coarse)]:min-h-11">
        {qa.anonymous ? (
          <label htmlFor={anonymousId} className="flex cursor-pointer items-center gap-2 self-stretch text-meta text-ink-2">
            <Switch id={anonymousId} checked={anonymous} onCheckedChange={setAnonymous} />
            Ask anonymously
          </label>
        ) : (
          <span />
        )}
        {length > MAX_QUESTION - 50 ? <span className={cn("text-meta tabular-nums", length > MAX_QUESTION ? "text-danger-ink" : "text-ink-3")}>{MAX_QUESTION - length}</span> : null}
      </div>
      {(tried && problem) || error ? (
        <p role="alert" className="mt-1 text-meta text-danger-ink">
          {(tried && problem) || error}
        </p>
      ) : null}
    </form>
  )
}
