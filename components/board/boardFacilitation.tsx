"use client"

// Running a session on a board, the three things Miro's facilitators reach
// for:
//
//  - A timer everyone sees. Start it for a few minutes; it counts down on
//    every screen and chimes when it ends. Editors can pause, add a minute or
//    stop it.
//  - Dot voting. Each person gets a few votes, one per note, and votes stay
//    hidden until voting ends so nobody follows the crowd. Then every note
//    shows its count and the top ones are listed.
//  - Follow the presenter. Whoever presents broadcasts what they are looking
//    at; everyone else follows along until they move the board themselves.
//
// The timer and votes live in the board's Yjs document (map "facilitation",
// map "votes"), so they survive a reload and reach late joiners; the votes
// through components/board/useBoardVoting, which the notes bar's Vote shares.
// Presenting travels over awareness: it ends when the presenter leaves. The
// rules are in lib/board/facilitation, tested.

import * as React from "react"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { Ellipsis, Pause, Play, Plus, Presentation, Timer, Vote, X } from "@/lib/icons"
import { ProgressRing } from "@/components/ui/graphics/ProgressRing"
import { useSheetMode } from "@/components/ui/overlayMode"
import { celebrate } from "@/lib/celebrateSoon"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useBoardView } from "@/hooks/useBoardView"
import { useMedia } from "@/context/MediaQueryContext"
import { cn } from "@/lib/utils/helpers/cn"
import { BarPicker } from "@/components/board/barPicker"
import ResultsList from "@/components/board/boardResults"
import {
  BAR_MAX_COMPUTER,
  BAR_SURFACE,
  FacilitationDock,
  PRESENTING_FIELD,
  TIMER_KEY,
  facilitationOf,
  presentersIn,
  timerIn,
  type Presenter,
} from "@/components/board/facilitationDock"
import { useGiveWay } from "@/components/board/useGiveWay"
import { useBoardVoting } from "@/components/board/useBoardVoting"
import {
  barForms,
  formatClock,
  giveWaySteps,
  tally,
  timeLeft,
  votableNotes,
  type BoardTimer,
  type CompactBar,
  type Votable,
} from "@/lib/board/facilitation"
import { followView, sceneToLocal } from "@/lib/board/viewport"

interface Props {
  provider: HocuspocusProvider
  api: ExcalidrawImperativeAPI
  user: { id: string; name: string }
  editable: boolean
}

const TIMER_MINUTES = [1, 3, 5, 10, 15]
const VOTES_EACH = [1, 3, 5, 10]

/** A short two-note chime from Web Audio, so there is no sound file to ship. */
function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    ;[660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18)
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + i * 0.18 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.5)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.18)
      osc.stop(ctx.currentTime + i * 0.18 + 0.55)
    })
    setTimeout(() => void ctx.close(), 1200)
  } catch {
    /* no audio: the bar still says time is up */
  }
}

export default function BoardFacilitation({ provider, api, user, editable }: Props) {
  const yDoc = provider.document
  const yFac = React.useMemo(() => facilitationOf(yDoc), [yDoc])
  const awareness = provider.awareness
  const { isMobile, isTablet } = useMedia()

  const [timer, setTimer] = React.useState<BoardTimer | null>(null)
  const { voting, votes, myVotes, votesLeft, vote, startVoting, endVoting, clearVoting } = useBoardVoting(provider, user, editable)
  const [now, setNow] = React.useState(() => Date.now())

  // ---- Shared state ------------------------------------------------------
  React.useEffect(() => {
    const sync = () => {
      setTimer(timerIn(yFac))
    }
    sync()
    yFac.observe(sync)
    return () => yFac.unobserve(sync)
  }, [yFac])


  // ---- Timer -------------------------------------------------------------
  const left = timer ? timeLeft(timer, now) : 0
  const running = !!timer && timer.pausedLeftMs === undefined && left > 0
  React.useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [running])

  // Chime once per timer, on every screen that saw it run out.
  const chimedFor = React.useRef<number | null>(null)
  React.useEffect(() => {
    if (!timer || timer.pausedLeftMs !== undefined || left > 0 || chimedFor.current === timer.endsAt) return
    chimedFor.current = timer.endsAt
    if (now - timer.endsAt < 5_000) chime()
  }, [timer, left, now])

  const setShared = (key: string, value: unknown | null) =>
    yDoc.transact(() => (value === null ? yFac.delete(key) : yFac.set(key, value)))

  const startTimer = (minutes: number) => {
    setNow(Date.now())
    setShared(TIMER_KEY, { endsAt: Date.now() + minutes * 60_000, durationMs: minutes * 60_000, byName: user.name } satisfies BoardTimer)
  }
  const pauseTimer = () => timer && setShared(TIMER_KEY, { endsAt: timer.endsAt, durationMs: timer.durationMs, byName: timer.byName, pausedLeftMs: left })
  const resumeTimer = () => {
    if (!timer) return
    setNow(Date.now())
    setShared(TIMER_KEY, { endsAt: Date.now() + left, durationMs: timer.durationMs, byName: timer.byName })
  }
  const addMinute = () => {
    if (!timer) return
    setNow(Date.now())
    const base = { durationMs: timer.durationMs + 60_000, byName: timer.byName }
    setShared(
      TIMER_KEY,
      timer.pausedLeftMs !== undefined
        ? { ...base, endsAt: timer.endsAt, pausedLeftMs: timer.pausedLeftMs + 60_000 }
        : { ...base, endsAt: Math.max(Date.now(), timer.endsAt) + 60_000 },
    )
  }

  // ---- Voting ------------------------------------------------------------
  const [notes, setNotes] = React.useState<Votable[]>([])
  React.useEffect(() => {
    if (!voting) return
    const read = (els: readonly unknown[]) => setNotes(votableNotes(els as never))
    read(api.getSceneElements())
    return api.onChange((els) => read(els))
  }, [api, voting])

  const results = React.useMemo(
    () => (voting?.closedAt ? tally(votes, voting.id, new Set(notes.map((n) => n.id))) : []),
    [voting, votes, notes],
  )
  const counts = React.useMemo(() => new Map(results.map((r) => [r.id, r.count])), [results])

  const goTo = (noteId: string) => {
    const el = api.getSceneElements().find((e) => e.id === noteId)
    if (el) api.scrollToContent(el, { fitToContent: false, animate: true })
  }

  // ---- Presenting --------------------------------------------------------
  const [presenters, setPresenters] = React.useState<Presenter[]>([])
  const [presenting, setPresenting] = React.useState(false)
  const [following, setFollowing] = React.useState<number | null>(null)
  // Where the board is looking: for vote dots, and for presenting and
  // following. Off the rest of the time, so a pan costs this panel nothing.
  const view = useBoardView(api, !!voting || presenting || following !== null)
  const declined = React.useRef<Set<number>>(new Set())

  React.useEffect(() => {
    const read = () => setPresenters(presentersIn(awareness))
    read()
    awareness?.on("change", read)
    return () => awareness?.off("change", read)
  }, [awareness])

  // Broadcast what we show while presenting; stop when we stop or leave.
  React.useEffect(() => {
    if (!awareness) return
    if (!presenting || !view) {
      awareness.setLocalStateField(PRESENTING_FIELD, null)
      return
    }
    const t = setTimeout(() => {
      awareness.setLocalStateField(PRESENTING_FIELD, {
        userId: user.id,
        name: user.name,
        view: { scrollX: view.scrollX, scrollY: view.scrollY, zoom: view.zoom, width: view.width, height: view.height },
      })
    }, 80)
    return () => clearTimeout(t)
  }, [awareness, presenting, view, user.id, user.name])
  React.useEffect(() => () => awareness?.setLocalStateField(PRESENTING_FIELD, null), [awareness])

  // Someone starts presenting: follow them, unless we already said no to them.
  const presenter = presenters.find((p) => p.clientId === following) ?? null
  React.useEffect(() => {
    if (presenting) return
    if (following !== null && !presenters.some((p) => p.clientId === following)) setFollowing(null)
    if (following === null) {
      const next = presenters.find((p) => !declined.current.has(p.clientId))
      if (next) setFollowing(next.clientId)
    }
  }, [presenters, following, presenting])

  // Follow: show what they show, fitted to this screen.
  React.useEffect(() => {
    if (!presenter || !view) return
    const f = followView(presenter.view, { width: view.width, height: view.height })
    if (Math.abs(f.scrollX - view.scrollX) < 0.5 && Math.abs(f.scrollY - view.scrollY) < 0.5 && Math.abs(f.zoom - view.zoom) < 0.001) return
    api.updateScene({ appState: { scrollX: f.scrollX, scrollY: f.scrollY, zoom: { value: f.zoom as never } } })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- view changes because of this very update
  }, [presenter, api])

  // Moving the board yourself stops following, as in Miro.
  const stopFollowing = React.useCallback(() => {
    if (following !== null) declined.current.add(following)
    setFollowing(null)
  }, [following])
  React.useEffect(() => {
    if (following === null) return
    const canvas = document.querySelector(".excalidraw") as HTMLElement | null
    if (!canvas) return
    const stop = () => stopFollowing()
    canvas.addEventListener("wheel", stop, { passive: true })
    canvas.addEventListener("pointerdown", stop)
    return () => {
      canvas.removeEventListener("wheel", stop)
      canvas.removeEventListener("pointerdown", stop)
    }
  }, [following, stopFollowing])

  // ---- Render ------------------------------------------------------------
  const timeUp = !!timer && left === 0 && timer.pausedLeftMs === undefined
  const lastTen = !!timer && !timeUp && left <= 10_000
  const idle = !timer && !voting && !presenting && presenters.length === 0
  const top3 = new Set(results.slice(0, 3).filter((r) => r.count > 0).map((r) => r.id))

  // Revealing the results: one spark burst from the winning note's badge,
  // once per vote, and never under reduced motion (celebrate checks).
  const celebrated = React.useRef<string | null>(null)
  const winner = results[0] && (results.length === 1 || results[0].count > results[1].count) ? results[0].id : null
  React.useEffect(() => {
    if (!voting?.closedAt || !winner || celebrated.current === voting.id) return
    celebrated.current = voting.id
    // A late joiner who opens a board with old results gets no burst.
    if (Date.now() - voting.closedAt > 10_000) return
    const raf = requestAnimationFrame(() => celebrate(document.querySelector(`[data-vote-badge="${winner}"]`), { count: 8 }))
    return () => cancelAnimationFrame(raf)
  }, [voting, winner])

  const sheet = useSheetMode()
  // The round whose results are open, so a new round's are closed until asked for.
  const [resultsOf, setResultsOf] = React.useState<string | null>(null)

  // Below 1024 px, once anything is on, each segment says only its state and every action is in one
  // menu, a sheet on a phone. In one row with their actions (End voting, the timer's four, Present)
  // the bar ran to ~440 px at 390 and scrolled, cutting "Present" at "Pre" (design review, 29 Oct).
  // Idle, the three ways to start fit, and stay in the bar.
  const compact = !idle && (isMobile || isTablet)
  // Short of room, the compact bar's names give way first, then its segments' words, in one order
  // (lib/board/facilitation's giveWaySteps), measured before paint and only as far as the row needs:
  // a tablet keeps every word that a phone at 390 can't (design review, 29 Oct).
  const compactBar: CompactBar = {
    presenter: presenting ? "you" : presenter ? "following" : presenters.length > 0 ? "someone" : null,
    voting: voting && !voting.closedAt ? (editable ? "count" : "named") : null,
  }
  const barRef = React.useRef<HTMLDivElement>(null)
  const [room, setRoom] = React.useState<HTMLDivElement | null>(null)
  const barWords = [compact, compactBar.presenter, (presenter ?? presenters[0])?.name, compactBar.voting, voting?.byName, votesLeft, !!voting?.closedAt, timer ? timeUp : null, editable]
  const given = useGiveWay(barRef, room, compact ? giveWaySteps(compactBar).length : 0, barWords.join("|"))
  const forms = barForms(compactBar, given)

  if (idle && !editable) return null
  const segments: React.ReactNode[] = []
  const follow = (p: Presenter) => {
    declined.current.delete(p.clientId)
    setFollowing(p.clientId)
  }
  const present = () => {
    setFollowing(null)
    setPresenting(true)
  }
  const stopTimer = () => setShared(TIMER_KEY, null)
  const paused = timer?.pausedLeftMs !== undefined
  const timerChoices = TIMER_MINUTES.map((m) => ({ label: `${m} min`, onPick: () => startTimer(m) }))
  const voteChoices = VOTES_EACH.map((n) => ({ label: `${n} ${n === 1 ? "vote" : "votes"}`, onPick: () => startVoting(n) }))
  const textOf = (id: string) => notes.find((n) => n.id === id)?.text ?? ""

  if (presenting) {
    segments.push(
      <Segment key="presenting" tone="about-you" fit={compact}>
        <Presentation className="size-4 shrink-0" aria-hidden />
        <span className="shrink-0">{compact ? "Presenting" : "You're presenting"}</span>
        {!compact && <SegmentButton onClick={() => setPresenting(false)}>Stop</SegmentButton>}
      </Segment>,
    )
  } else if (presenters.length > 0) {
    const name = (presenter ?? presenters[0]).name
    segments.push(
      <Segment key="presenter" tone="about-you" fit={compact}>
        <Presentation className="size-4 shrink-0" aria-hidden />
        {forms.presenter === "icon" ? (
          // Following, the frame's label names the presenter.
          <span className="sr-only">{presenter ? `Following ${name}` : `${name} is presenting`}</span>
        ) : forms.presenter === "name" ? (
          <>
            <BarName name={name} />
            <span className="sr-only">{" is presenting"}</span>
          </>
        ) : presenter ? (
          <NamedState before="Following" name={name} />
        ) : (
          <NamedState name={name} after="is presenting" />
        )}
        {!compact &&
          (presenter ? (
            <SegmentButton onClick={stopFollowing}>Stop</SegmentButton>
          ) : (
            <SegmentButton onClick={() => follow(presenters[0])}>Follow</SegmentButton>
          ))}
      </Segment>,
    )
  }

  if (voting && !voting.closedAt) {
    segments.push(
      <Segment key="voting" fit={compact}>
        {compact && <Vote className="size-4 shrink-0 text-ink-3" aria-hidden />}
        {!editable ? (
          forms.voting === "full" ? (
            <NamedState name={voting.byName} after="started voting" className="text-ink-2" />
          ) : (
            <>
              {forms.voting === "word" && (
                <span aria-hidden="true" className="shrink-0 text-ink-2">
                  Voting
                </span>
              )}
              <span className="sr-only">{`${voting.byName} started voting`}</span>
            </>
          )
        ) : (
          <span className="shrink-0 text-ink-2">
            {compact ? (
              <>
                <span className="sr-only">Voting · </span>
                {votesLeft > 0 ? `${votesLeft} left` : "All used"}
              </>
            ) : votesLeft > 0 ? (
              `Voting · ${votesLeft} left`
            ) : (
              "Voting · all used"
            )}
          </span>
        )}
        {!compact && editable && voting.perPerson <= 10 ? (
          <span className="flex items-center gap-1" aria-hidden="true">
            {Array.from({ length: voting.perPerson }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "size-2 rounded-[4px] transition-colors",
                  i < votesLeft ? "bg-brand" : "ring-[1.5px] ring-inset ring-brand",
                )}
              />
            ))}
          </span>
        ) : null}
        {!compact && editable && <SegmentButton onClick={endVoting}>End voting</SegmentButton>}
      </Segment>,
    )
  }
  // The leader's words truncate, so a long note never widens the bar. Cut short, they are a box
  // of their own, and a name read from boxes gets a space at each of their edges ("Results: “ Book
  // the venue ” leads"), so the button carries its words whole as its name.
  const tie = results.length > 1 && results[0].count === results[1].count
  const leader = !compact && !tie && results.length > 0 ? textOf(results[0].id) : null
  const resultsLabel = compact ? (
    "Results"
  ) : tie ? (
    "Results: a tie at the top"
  ) : leader !== null ? (
    <>
      Results: “<BarName name={leader} className="max-w-[12rem]" />” leads
    </>
  ) : (
    "Results"
  )
  if (voting?.closedAt) {
    const closed = voting.id
    segments.push(
      <Segment key="results" quiet={compact}>
        <BarPicker
          title="Results"
          open={resultsOf === closed}
          onOpenChange={(open) => setResultsOf(open ? closed : null)}
          trigger={
            <SegmentButton aria-label={leader !== null ? `Results: “${leader}” leads` : undefined}>
              {/* On a phone the word alone: beside a presenter's chip and the clock, the icon cut "Presenting" short (DB-34). */}
              {!compact && <Vote className="size-3.5" aria-hidden />}
              <span className="flex min-w-0 items-center">{resultsLabel}</span>
            </SegmentButton>
          }
        >
          <ResultsList
            results={results}
            textOf={textOf}
            onGo={(id) => {
              goTo(id)
              // On a phone the sheet steps aside, so the note shows.
              if (sheet) setResultsOf(null)
            }}
          />
        </BarPicker>
        {!compact && editable && (
          <SegmentIcon label="Clear the results" onClick={clearVoting}>
            <X />
          </SegmentIcon>
        )}
      </Segment>,
    )
  }

  if (timer) {
    const pct = timer.durationMs > 0 ? (left / timer.durationMs) * 100 : 0
    segments.push(
      <Segment key="timer" tone={timeUp ? "sun" : undefined}>
        {timeUp ? (
          <span className="board-ring-pulse inline-flex">
            <Timer className="size-4 text-camp-sun-ink" aria-hidden />
          </span>
        ) : (
          <span className={cn("inline-flex", lastTen && "board-timer-sun")}>
            <ProgressRing value={pct} size={28} weight={2.5} label={`Timer, ${formatClock(left)} left`} />
          </span>
        )}
        <span
          className={cn("min-w-[3.25rem] text-heading tabular-nums", timeUp ? "text-ui-sm font-medium text-camp-sun-ink" : lastTen ? "text-camp-sun-ink" : "text-ink")}
          role="timer"
          aria-live={timeUp ? "assertive" : "off"}
        >
          {timeUp ? "Time's up" : formatClock(left)}
        </span>
        {!compact && editable && !timeUp && (
          <>
            {paused ? (
              <SegmentIcon label="Resume" onClick={resumeTimer}>
                <Play />
              </SegmentIcon>
            ) : (
              <SegmentIcon label="Pause" onClick={pauseTimer}>
                <Pause />
              </SegmentIcon>
            )}
            <SegmentButton onClick={addMinute}>+1 min</SegmentButton>
          </>
        )}
        {!compact && editable && (
          <SegmentIcon label={timeUp ? "Dismiss the timer" : "Stop the timer"} onClick={stopTimer}>
            <X />
          </SegmentIcon>
        )}
      </Segment>,
    )
  }

  // Starting things (editors): in the bar, or in its menu while it is compact.
  if (editable && !compact && (!timer || !voting || !presenting)) {
    segments.push(
      <Segment key="start" quiet>
        {!timer && <Choice icon={<Timer className="size-3.5" />} label="Timer" options={timerChoices} />}
        {!voting && <Choice icon={<Vote className="size-3.5" />} label="Vote" heading="Votes for each person" options={voteChoices} />}
        {!presenting && (
          <SegmentButton onClick={present}>
            <Presentation className="size-3.5" aria-hidden />
            Present
          </SegmentButton>
        )}
      </Segment>,
    )
  }

  // Compact, every action, in the bar's order: presenting, voting, the timer.
  if (compact) {
    const groups: React.ReactNode[][] = [[], [], []]
    const [presentingRows, votingRows, timerRows] = groups
    if (presenting) {
      presentingRows.push(
        <DropdownMenuItem key="stop" onSelect={() => setPresenting(false)}>
          <Presentation />
          Stop presenting
        </DropdownMenuItem>,
      )
    } else if (presenter) {
      presentingRows.push(
        <DropdownMenuItem key="unfollow" onSelect={stopFollowing}>
          <Presentation />
          Stop following
        </DropdownMenuItem>,
      )
    } else if (presenters.length > 0) {
      presentingRows.push(
        <DropdownMenuItem key="follow" onSelect={() => follow(presenters[0])}>
          <Presentation />
          Follow {presenters[0].name}
        </DropdownMenuItem>,
      )
    }
    if (editable && !presenting) {
      presentingRows.push(
        <DropdownMenuItem key="present" onSelect={present}>
          <Presentation />
          Present
        </DropdownMenuItem>,
      )
    }
    if (editable && voting && !voting.closedAt) {
      votingRows.push(
        <DropdownMenuItem key="end" onSelect={endVoting}>
          <Vote />
          End voting
        </DropdownMenuItem>,
      )
    }
    if (editable && voting?.closedAt) {
      votingRows.push(
        <DropdownMenuItem key="clear" onSelect={clearVoting}>
          <X />
          Clear the results
        </DropdownMenuItem>,
      )
    }
    if (editable && !voting) votingRows.push(<ChoiceStep key="vote" icon={<Vote />} label="Vote" heading="Votes for each person" options={voteChoices} />)
    if (editable && timer && !timeUp) {
      timerRows.push(
        <DropdownMenuItem key="pause" onSelect={paused ? resumeTimer : pauseTimer}>
          {paused ? <Play /> : <Pause />}
          {paused ? "Resume" : "Pause"}
        </DropdownMenuItem>,
        <DropdownMenuItem key="minute" onSelect={addMinute}>
          <Plus />
          +1 min
        </DropdownMenuItem>,
      )
    }
    if (editable && timer) {
      timerRows.push(
        <DropdownMenuItem key="stop-timer" onSelect={stopTimer}>
          <X />
          {timeUp ? "Dismiss the timer" : "Stop the timer"}
        </DropdownMenuItem>,
      )
    }
    if (editable && !timer) timerRows.push(<ChoiceStep key="timer" icon={<Timer />} label="Timer" options={timerChoices} />)
    const shown = groups.filter((g) => g.length > 0)
    if (shown.length > 0) {
      segments.push(
        <Segment key="actions" quiet>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SegmentIcon label="Facilitation options" className="max-sm:size-9">
                <Ellipsis />
              </SegmentIcon>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" sideOffset={10} className="w-56">
              {shown.map((rows, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <DropdownMenuSeparator />}
                  {rows}
                </React.Fragment>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </Segment>,
      )
    }
  }

  return (
    <>
      {/* Following someone: the sheet gets a 2 px brand frame and a label. */}
      {presenter && !presenting && (
        <div className="pointer-events-none absolute inset-0 z-[15] rounded-[inherit] ring-2 ring-inset ring-brand" data-following="">
          <span className="content-float absolute left-1/2 top-3 -translate-x-1/2 rounded-lg bg-brand px-2.5 py-1 text-meta font-medium text-brand-foreground shadow-e3">
            Following {presenter.name}
          </span>
        </div>
      )}

      {/* Vote dots, anchored to each note's top-right corner. */}
      {voting && view && (
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden={!!voting.closedAt}>
          {notes.map((n) => {
            const pos = sceneToLocal(view, n.x + n.width, n.y)
            const mine = myVotes.includes(n.id)
            const count = counts.get(n.id) ?? 0
            if (voting.closedAt && count === 0) return null
            return voting.closedAt ? (
              <span
                key={n.id}
                data-vote-badge={n.id}
                style={{ left: pos.left, top: pos.top }}
                className={cn(
                  "content-pop-in absolute flex h-[22px] min-w-[22px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[11px] bg-ink px-1.5 text-micro font-semibold text-sheet shadow-e2",
                  top3.has(n.id) && "ring-2 ring-camp-moss ring-offset-2 ring-offset-sheet",
                )}
              >
                {count}
              </span>
            ) : editable ? (
              <button
                key={n.id}
                type="button"
                style={{ left: pos.left, top: pos.top }}
                onClick={() => vote([n.id])}
                aria-pressed={mine}
                aria-label={`${mine ? "Take back your vote for" : "Vote for"} ${n.text}`}
                title={mine ? "Take your vote back" : "Vote"}
                className={cn(
                  "pointer-events-auto absolute flex size-[22px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[11px] shadow-e2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                  mine ? "content-pop-in bg-brand text-brand-foreground" : "bg-pop text-ink-3 hover:text-brand-text",
                )}
              >
                {mine ? <span className="text-micro font-semibold">1</span> : <Plus className="size-3" />}
              </button>
            ) : null
          })}
        </div>
      )}

      {/* As wide as the bar may be: the compact bar counts its give-way steps again when this changes. */}
      <div ref={setRoom} aria-hidden="true" className={cn("pointer-events-none invisible absolute inset-x-3 bottom-0 h-0", !isMobile && BAR_MAX_COMPUTER)} />

      {segments.length > 0 && (
        <FacilitationDock>
          <div
            ref={barRef}
            role="toolbar"
            aria-label="Facilitation"
            data-board-chrome=""
            data-facilitation=""
            className={cn(BAR_SURFACE, "h-11 overflow-x-auto text-ui-sm")}
          >
            {segments.map((seg, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-line-2" />}
                {seg}
              </React.Fragment>
            ))}
          </div>
        </FacilitationDock>
      )}
    </>
  )
}

/**
 * One part of the facilitation cluster (data-bar-segment: the e2e holds each of its words inside it).
 * A part that may `fit` gives way first when the bar is short of room: its names truncate, never below
 * their first letter (BarName), and its words never do. A row still short of room would scroll, so the
 * compact bar's priority shortens a part instead (useGiveWay).
 */
function Segment({ children, tone, quiet, fit }: { children: React.ReactNode; tone?: "about-you" | "sun"; quiet?: boolean; fit?: boolean }) {
  return (
    <div
      data-bar-segment=""
      className={cn(
        "flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[16px] px-2",
        fit ? "shrink" : "shrink-0",
        tone === "about-you" && "bg-brand-muted text-brand-text",
        tone === "sun" && "bg-camp-sun-tint text-camp-sun-ink",
        quiet && "gap-0.5 px-0.5",
      )}
    >
      {children}
    </div>
  )
}

const SegmentButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(function SegmentButton(
  { className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-[14px] px-2.5 text-ui-sm font-medium text-ink-2 outline-none transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand [&_svg]:shrink-0",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
})

/** An icon's button in the cluster, named by `label`; a menu's trigger too (it takes the menu's ref and props). */
const SegmentIcon = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(function SegmentIcon(
  { label, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-[14px] text-ink-3 outline-none transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand [&_svg]:size-3.5",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
})

/**
 * A person's name and the words of their state, as one part: "Following ann", "ann is presenting",
 * "Lee started voting". The words stay whole, and the name gives way first (BarName).
 */
function NamedState({ name, before, after, className }: { name: string; before?: string; after?: string; className?: string }) {
  return (
    <span className={cn("flex items-center gap-1", className)}>
      {/* The spaces are the words' own, so the part reads as one line ("Following ann"); a line's end drops them. */}
      {before && <span className="shrink-0">{`${before} `}</span>}
      <BarName name={name} />
      {after && <span className="shrink-0">{` ${after}`}</span>}
    </span>
  )
}

/**
 * A name on the bar, which gives way to the words beside it down to its first letter and "…", and no
 * further: at 390 names were cut to nothing (design review, 29 Oct). An unseen copy of those two (the
 * grid's ::after, so it is no part of the bar's text) holds the name's least width; past it the row
 * scrolls, and the compact bar's priority takes a step instead. A name of four letters or fewer is its
 * own least: cut, it would hardly be shorter, and "Al" in the room of "A…" would leave a gap after it.
 */
function BarName({ name, className }: { name: string; className?: string }) {
  const letters = Array.from(name)
  return (
    <span
      data-least={letters.length <= 4 ? name : `${letters[0]}…`}
      className={cn(
        "grid after:invisible after:col-start-1 after:row-start-1 after:whitespace-nowrap after:content-[attr(data-least)]",
        className,
      )}
    >
      <span data-bar-name="" className="col-start-1 row-start-1 truncate">
        {name}
      </span>
    </span>
  )
}

interface ChoiceProps {
  icon: React.ReactNode
  label: string
  heading?: string
  options: { label: string; onPick: () => void }[]
}

/** A way to start something, picked from a short list: a menu above the bar, an action sheet on a phone. */
function Choice({ icon, label, heading, options }: ChoiceProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SegmentButton>
          {icon}
          {label}
        </SegmentButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" sideOffset={10} className="w-44">
        {heading && <DropdownMenuLabel>{heading}</DropdownMenuLabel>}
        <ChoiceRows options={options} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The same list as a step in the compact bar's menu; on a phone the step's head says the heading. */
function ChoiceStep({ icon, label, heading, options }: ChoiceProps) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger textValue={heading ?? label}>
        {icon}
        {label}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-44">
        <ChoiceRows options={options} />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function ChoiceRows({ options }: Pick<ChoiceProps, "options">) {
  return options.map((o) => (
    <DropdownMenuItem key={o.label} onSelect={o.onPick}>
      {o.label}
    </DropdownMenuItem>
  ))
}
