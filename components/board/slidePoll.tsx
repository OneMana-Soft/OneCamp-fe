"use client"

/**
 * A poll on a presented slide (miro-28 to_win 4, Miro's Slides with polls), a piece of its own: boardSlides loads it
 * once the slide's frame has a poll, the presenter opens Add a poll, or the board's polls couldn't be read. It reaches
 * no shared core: the votes, the close and the start go through the client the board page hands down, and chat's
 * choices (components/poll/PollChoices) through their pure module.
 *
 * The card is the same for the presenter and everyone following: the question, each option with its count and share as
 * the votes come in (the board's topic moves it, useSlidePolls), the reader's choice marked, and Close for whoever the
 * server's can_close names (the board's editors). A share link's guest reads the question and the tally and has no
 * control at all. A refusal reads as the server's words; offline, a vote or a start is refused with words and nothing is
 * kept to send; a read that fails once the list was read says the tally may be behind, with Try again.
 *
 * It never covers the slide. On a computer (`at` "side") it stands in a strip at the board's right, marked as a side of
 * the board (presentFrame's BOARD_SIDES), so the presented frame's fit leaves that strip while it shows. On a phone
 * (`at` "dock") it folds into a 44 px bar, the question and how it stands, which boardSlides puts in the slides' dock
 * above the slide bar (so the fit's foot takes it, as it takes the slide bar), and which opens the card in a drawer,
 * Close poll in its pinned foot. A screen reader hears, politely, when a poll starts and when it closes.
 *
 * The composer is the presenter's, from Add a poll in the slide bar: a popover on a computer, a drawer on a phone with
 * Cancel and Start poll in its pinned footer. Its checks are a call's polls' (lib/calls/activities pollProblem). Once a
 * poll starts, the focus goes to its card (its Close poll); once it's closed, boardSlides gives it to the Add a poll
 * that comes back (onClosed).
 */

import * as React from "react"
import { BarPicker } from "@/components/board/barPicker"
import { BAR_SURFACE } from "@/components/board/facilitationDock"
import { footButton } from "@/components/board/slideNotes"
import { PollChoices } from "@/components/poll/PollChoices"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { useSheetMode } from "@/components/ui/overlayMode"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { startBoardPoll, type BoardPoll } from "@/lib/board/boardPolls"
import { MAX_OPTION, MAX_OPTIONS, MAX_POLL_QUESTION, pollOptions, pollProblem } from "@/lib/calls/activities"
import { isAppOffline } from "@/lib/connectivity"
import { BarChart3, Plus, Trash2 } from "@/lib/icons"
import { sendClose, sendVote, type PollClient } from "@/lib/polls/poll"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import type { SlidePollsRead } from "@/components/board/useSlidePolls"

export interface SlidePollProps {
  /** The slide's poll (its frame's newest), if any. */
  poll: BoardPoll | undefined
  board: string
  frame: string
  frameName: string
  /** The client votes, closes and starts go through; none for a share link's guest, who only reads. */
  http?: PollClient
  read: Pick<SlidePollsRead, "state" | "reason" | "retry">
  put: (poll: BoardPoll) => void
  /** The presenter's composer is open (Add a poll), anchored to `anchor` on a computer. */
  composing: boolean
  onComposing: (open: boolean) => void
  anchor?: React.RefObject<HTMLElement | null>
  /**
   * Where the card shows: "side", a strip at the board's right (a computer); "dock", a bar in the slides' dock that
   * opens it in a drawer (a phone); "none", nowhere (a phone's outline sheet is up: only the composer). By the screen
   * when not given.
   */
  at?: "side" | "dock" | "none"
  /** This screen closed the poll from its card (boardSlides gives the focus to the Add a poll that comes back). */
  onClosed?: () => void
}

/** A bar's width on a phone: the slides' dock's, within the screen's gutters. */
const BAR_WIDTH = "w-[min(22rem,calc(100vw-1.5rem))]"

export default function SlidePoll(props: SlidePollProps) {
  const { poll, read, http, composing } = props
  // The bar opens a drawer, so it's chosen where a phone's sheets are (the one sheet rule: a phone held sideways too).
  const sheet = useSheetMode()
  const at = props.at ?? (sheet ? "dock" : "side")
  const failed = !poll && read.state === "failed"
  // The poll this screen just started: its card takes the focus once it's drawn (its Close poll, or the card itself).
  const started = React.useRef("")
  const landing = React.useRef<HTMLElement | null>(null)
  React.useEffect(() => {
    if (!poll || !started.current || poll.id !== started.current) return
    started.current = ""
    const to = landing.current
    ;(to?.querySelector<HTMLElement>("[data-poll-close]") ?? to)?.focus()
  }, [poll])
  const acts = usePollActs(poll, http, props.put, props.onClosed)
  return (
    <>
      <p data-slide-poll-said="" role="status" aria-live="polite" className="sr-only">
        {useSaid(poll)}
      </p>
      {at === "side" && (poll || failed) && (
        <section
          ref={landing}
          tabIndex={-1}
          aria-label="Poll on this slide"
          data-slide-poll=""
          data-board-chrome=""
          // A side of the board: the presented frame's fit leaves this strip (presentFrame's BOARD_SIDES).
          data-board-side=""
          className="content-float pointer-events-auto absolute right-3 top-16 z-20 max-h-[min(60vh,32rem)] w-[300px] overflow-y-auto rounded-[18px] border border-line-2 bg-sheet p-3 shadow-e3 outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {poll ? (
            <PollCard poll={poll} acts={acts} read={read} foot={false}>
              {acts.mayClose && (
                <Button size="sm" variant="ghost" data-poll-close="" disabled={!!acts.busy} onClick={acts.close}>
                  Close poll
                </Button>
              )}
            </PollCard>
          ) : (
            <ReadFailed read={read} />
          )}
        </section>
      )}
      {at === "dock" && poll && <PollBar poll={poll} acts={acts} read={read} landing={landing} />}
      {at === "dock" && failed && <ReadFailedBar read={read} />}
      {http && composing && <PollComposer {...props} http={http} onStarted={(id) => void (started.current = id)} />}
    </>
  )
}

/** What a screen reader hears: "Poll started: <question>" when a poll comes up open, "Poll closed" when it closes. */
function useSaid(poll: BoardPoll | undefined): string {
  const [said, setSaid] = React.useState("")
  const seen = React.useRef<{ id: string; closed: boolean } | null>(null)
  const [id, closed, question] = [poll?.id ?? "", !!poll?.closed, poll?.question ?? ""]
  React.useEffect(() => {
    const was = seen.current
    seen.current = id ? { id, closed } : null
    if (!id) return
    // Said after the region is drawn, so a reader that only hears changes hears it.
    if (was?.id !== id) {
      if (!closed) setSaid(`Poll started: ${question}`)
    } else if (!was.closed && closed) setSaid("Poll closed")
  }, [id, closed, question])
  return said
}

type PollActs = ReturnType<typeof usePollActs>

/** A vote and a close, each refused with words offline (never kept to send), a refusal in the server's words. */
function usePollActs(poll: BoardPoll | undefined, http: PollClient | undefined, put: (p: BoardPoll) => void, onClosed?: () => void) {
  const [busy, setBusy] = React.useState<string | null>(null)
  const [problem, setProblem] = React.useState("")
  const act = async (key: string, offlineWords: string, run: (http: PollClient) => Promise<BoardPoll>) => {
    if (busy || !http) return
    // Offline the press is refused, never kept to send later.
    if (isAppOffline()) return setProblem(offlineWords)
    setBusy(key)
    setProblem("")
    try {
      put(await run(http))
    } catch (e) {
      setProblem(apiErrorMessage(e, "The poll didn't update. Try again."))
    } finally {
      setBusy(null)
    }
  }
  const id = poll?.id ?? ""
  return {
    busy,
    problem,
    vote: http && poll ? (next: string[], option: string) => void act(option, "You're offline: your vote wasn't sent.", (c) => sendVote<BoardPoll>(c, id, next)) : undefined,
    close: () =>
      void act("close", "You're offline: the poll wasn't closed.", async (c) => {
        const closedPoll = await sendClose<BoardPoll>(c, id)
        onClosed?.()
        return closedPoll
      }),
    mayClose: !!http && !!poll?.can_close && !poll.closed,
  }
}

function ReadFailed({ read }: { read: SlidePollProps["read"] }) {
  return (
    <div className="grid gap-1.5">
      <p className="text-ui-sm font-medium text-ink">Couldn&apos;t load this slide&apos;s poll</p>
      {read.reason ? <p className="text-meta text-ink-3">{read.reason}</p> : null}
      <Button size="sm" variant="secondary" className="justify-self-start" onClick={read.retry}>
        Try again
      </Button>
    </div>
  )
}

/** How a poll stands, in a few words: closed, how many voted, and whether the tally may be behind. */
function standing(poll: BoardPoll, read: SlidePollProps["read"]): string {
  const n = poll.voters
  const behind = read.state === "failed" || read.state === "offline"
  return [poll.closed && "Closed", n === 0 ? "No votes yet" : `${n} voted`, behind && "may be behind"].filter(Boolean).join(" · ")
}

/** A phone's poll at rest: a 44 px bar in the slides' dock, the question and how it stands, opening the card in a drawer. */
function PollBar({ poll, acts, read, landing }: { poll: BoardPoll; acts: PollActs; read: SlidePollProps["read"]; landing: React.RefObject<HTMLElement | null> }) {
  const [open, setOpen] = React.useState(false)
  const stands = standing(poll, read)
  return (
    <>
      <button
        ref={(el) => void (landing.current = el)}
        type="button"
        data-slide-poll-bar=""
        data-touch-target
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Poll on this slide: ${poll.question}, ${stands}`}
        onClick={() => setOpen(true)}
        className={cn(BAR_SURFACE, BAR_WIDTH, "h-11 gap-2 px-3.5 text-ui-sm outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand")}
      >
        <BarChart3 aria-hidden className="size-4 shrink-0 text-brand-text" />
        <span className="min-w-0 flex-1 truncate text-left font-medium">{poll.question}</span>
        <span className="shrink-0 text-meta tabular-nums text-ink-3">{stands}</span>
      </button>
      <Drawer open={open} onOpenChange={setOpen} detent="medium">
        <DrawerContent
          header={<p className="text-heading text-ink">Poll on this slide</p>}
          footer={
            acts.mayClose ? (
              <Button type="button" variant="secondary" data-poll-close="" {...footButton(true)} disabled={!!acts.busy} onClick={acts.close}>
                Close poll
              </Button>
            ) : undefined
          }
        >
          <section aria-label="Poll on this slide" data-slide-poll="" className="px-4 pb-6">
            <PollCard poll={poll} acts={acts} read={read} foot />
          </section>
        </DrawerContent>
      </Drawer>
    </>
  )
}

/** A phone's failed read, before any list: a bar of its own in the slides' dock, saying so, with Try again. */
function ReadFailedBar({ read }: { read: SlidePollProps["read"] }) {
  return (
    <section aria-label="Poll on this slide" data-slide-poll-bar="" className={cn(BAR_SURFACE, BAR_WIDTH, "h-11 gap-2 pl-3.5 pr-1 text-ui-sm")}>
      <BarChart3 aria-hidden className="size-4 shrink-0 text-ink-3" />
      <p className="min-w-0 flex-1 truncate font-medium" title={read.reason}>
        Couldn&apos;t load this slide&apos;s poll
      </p>
      {read.reason ? <span className="sr-only">{read.reason}</span> : null}
      <Button size="sm" variant="ghost" className="h-11 shrink-0" onClick={read.retry}>
        Try again
      </Button>
    </section>
  )
}

/**
 * The card: the question, the choices, how many voted, and its lines (a guest's, the tally behind, a refusal).
 * `children` sits beside the count (a computer's Close poll); `foot`, a drawer's body, gives its controls a finger's
 * size (Close poll is then the drawer's own foot).
 */
function PollCard({ poll, acts, read, foot, children }: { poll: BoardPoll; acts: PollActs; read: SlidePollProps["read"]; foot: boolean; children?: React.ReactNode }) {
  const n = poll.voters
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-1.5 text-meta font-medium text-ink-3">
        <BarChart3 aria-hidden className="size-4 text-brand-text" />
        Poll
        {poll.closed && <span className="ml-auto rounded-md bg-sunken px-1.5 py-0.5 text-micro font-semibold text-ink-2">Closed</span>}
      </div>
      <p className="break-words text-ui font-medium text-ink">{poll.question}</p>
      <PollChoices poll={poll} busy={acts.busy} onChoose={acts.vote} />
      <div className="flex min-h-8 items-center justify-between gap-2 text-meta text-ink-3">
        <span>
          {n === 0 ? "No votes yet" : `${n} ${n === 1 ? "person" : "people"} voted`}
          {poll.multiple ? " · choose any" : ""}
        </span>
        {children}
      </div>
      {!acts.vote && <p className="text-meta text-ink-3">Members of the workspace vote; you see the tally.</p>}
      {read.state === "offline" && <p className="text-meta text-ink-3">You&apos;re offline: the tally may be behind.</p>}
      {read.state === "failed" && (
        <div className="flex items-center justify-between gap-2 text-meta text-ink-3">
          <div className="grid gap-0.5">
            <p>Couldn&apos;t refresh the poll: the tally may be behind.</p>
            {read.reason ? <p>{read.reason}</p> : null}
          </div>
          <Button size="sm" variant="ghost" className={cn("shrink-0", foot && "h-11")} onClick={read.retry}>
            Try again
          </Button>
        </div>
      )}
      {acts.problem && (
        <p role="alert" className="text-meta text-danger-ink">
          {acts.problem}
        </p>
      )}
    </div>
  )
}

const NEW = { question: "", options: ["", ""], multiple: false }

function PollComposer({ board, frame, frameName, http, put, composing, onComposing, anchor, onStarted }: SlidePollProps & { http: PollClient; onStarted: (id: string) => void }) {
  const sheet = useSheetMode()
  const id = React.useId()
  const [draft, setDraft] = React.useState(NEW)
  const [problem, setProblem] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const set = (patch: Partial<typeof NEW>) => setDraft((d) => ({ ...d, ...patch }))
  const setOption = (i: number, text: string) => set({ options: draft.options.map((o, j) => (j === i ? text : o)) })
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (sending) return
    const wrong = pollProblem(draft)
    if (wrong) return setProblem(wrong)
    if (isAppOffline()) return setProblem("You're offline: the poll wasn't started.")
    setSending(true)
    setProblem("")
    try {
      const started = await startBoardPoll(http, { board_uuid: board, frame_id: frame, question: draft.question.trim(), options: pollOptions(draft.options), multiple: draft.multiple })
      onStarted(started.id)
      put(started)
      setDraft(NEW)
      onComposing(false)
    } catch (err) {
      // 403 not an editor, 404 the board gone, 409 a frame drawn in the last half minute: the server's own words.
      setProblem(apiErrorMessage(err, "Couldn't start the poll. Try again."))
    } finally {
      setSending(false)
    }
  }
  const foot = footButton(sheet)
  const actions = (
    <div className={cn("flex gap-2", !sheet && "justify-end")}>
      <Button type="button" variant="secondary" {...foot} onClick={() => onComposing(false)}>
        Cancel
      </Button>
      <Button type="submit" form={id} {...foot} busy={sending}>
        Start poll
      </Button>
    </div>
  )
  return (
    <BarPicker title={`New poll on ${frameName}`} open={composing} onOpenChange={onComposing} anchor={anchor} footer={actions}>
      <form id={id} aria-label="New poll" onSubmit={submit} className="grid w-full gap-2.5 sm:w-[288px]" data-slide-poll-form="">
        <Textarea aria-label="Question" value={draft.question} maxLength={MAX_POLL_QUESTION} rows={2} autoFocus={!sheet} placeholder="What should we ask?" onChange={(e) => set({ question: e.target.value })} />
        <fieldset className="grid gap-1.5">
          <legend className="mb-1 text-meta font-medium text-ink-3">Options</legend>
          {draft.options.map((o, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input aria-label={`Option ${i + 1}`} value={o} maxLength={MAX_OPTION} placeholder={`Option ${i + 1}`} onChange={(e) => setOption(i, e.target.value)} />
              {draft.options.length > 2 && (
                <Button type="button" size="icon" variant="ghost" aria-label={`Remove option ${i + 1}`} onClick={() => set({ options: draft.options.filter((_, j) => j !== i) })}>
                  <Trash2 aria-hidden />
                </Button>
              )}
            </div>
          ))}
          {draft.options.length < MAX_OPTIONS && (
            <Button type="button" size={sheet ? "default" : "sm"} variant="ghost" className={cn("justify-self-start", sheet && "h-11")} onClick={() => set({ options: [...draft.options, ""] })}>
              <Plus aria-hidden />
              Add option
            </Button>
          )}
        </fieldset>
        <label className="flex min-h-11 items-center justify-between gap-3 text-ui-sm text-ink sm:min-h-8">
          People can choose more than one
          <Switch aria-label="People can choose more than one" checked={draft.multiple} onCheckedChange={(on) => set({ multiple: on })} />
        </label>
        {problem && (
          <p role="alert" className="text-meta text-danger-ink">
            {problem}
          </p>
        )}
      </form>
    </BarPicker>
  )
}
