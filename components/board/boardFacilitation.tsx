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
// map "votes"), so they survive a reload and reach late joiners. Presenting
// travels over awareness: it ends when the presenter leaves. The rules are in
// lib/board/facilitation, tested.

import * as React from "react"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { Pause, Play, Plus, Presentation, Timer, Vote, X } from "@/lib/icons"
import { ProgressRing } from "@/components/ui/graphics/ProgressRing"
import { celebrate } from "@/lib/celebrate"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/hooks/use-toast"
import { useBoardView } from "@/hooks/useBoardView"
import { useMedia } from "@/context/MediaQueryContext"
import { cn } from "@/lib/utils/helpers/cn"
import {
  formatClock,
  tally,
  timeLeft,
  toggleVote,
  votableNotes,
  voteKey,
  type BoardTimer,
  type BoardVoting,
  type Votable,
} from "@/lib/board/facilitation"
import { followView, sceneToLocal, type BoardView } from "@/lib/board/viewport"
import { ix } from "@/lib/ui/interactive"

interface Props {
  provider: HocuspocusProvider
  api: ExcalidrawImperativeAPI
  user: { id: string; name: string }
  editable: boolean
}

interface Presenter {
  clientId: number
  userId: string
  name: string
  view: Pick<BoardView, "scrollX" | "scrollY" | "zoom" | "width" | "height">
}

const TIMER_MINUTES = [1, 3, 5, 10, 15]
const VOTES_EACH = [1, 3, 5, 10]
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

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
  const yFac = React.useMemo(() => yDoc.getMap<unknown>("facilitation"), [yDoc])
  const yVotes = React.useMemo(() => yDoc.getMap<unknown>("votes"), [yDoc])
  const awareness = provider.awareness
  const { isMobile } = useMedia()
  const { toast } = useToast()

  const [timer, setTimer] = React.useState<BoardTimer | null>(null)
  const [voting, setVoting] = React.useState<BoardVoting | null>(null)
  const [votes, setVotes] = React.useState<[string, unknown][]>([])
  const [now, setNow] = React.useState(() => Date.now())

  // ---- Shared state ------------------------------------------------------
  React.useEffect(() => {
    const sync = () => {
      setTimer((yFac.get("timer") as BoardTimer | undefined) ?? null)
      setVoting((yFac.get("voting") as BoardVoting | undefined) ?? null)
    }
    sync()
    yFac.observe(sync)
    return () => yFac.unobserve(sync)
  }, [yFac])

  React.useEffect(() => {
    const sync = () => setVotes(Array.from(yVotes.entries()))
    sync()
    yVotes.observe(sync)
    return () => yVotes.unobserve(sync)
  }, [yVotes])

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
    setShared("timer", { endsAt: Date.now() + minutes * 60_000, durationMs: minutes * 60_000, byName: user.name } satisfies BoardTimer)
  }
  const pauseTimer = () => timer && setShared("timer", { endsAt: timer.endsAt, durationMs: timer.durationMs, byName: timer.byName, pausedLeftMs: left })
  const resumeTimer = () => {
    if (!timer) return
    setNow(Date.now())
    setShared("timer", { endsAt: Date.now() + left, durationMs: timer.durationMs, byName: timer.byName })
  }
  const addMinute = () => {
    if (!timer) return
    setNow(Date.now())
    const base = { durationMs: timer.durationMs + 60_000, byName: timer.byName }
    setShared(
      "timer",
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

  const myVotes = React.useMemo(() => {
    if (!voting) return [] as string[]
    const v = votes.find(([k]) => k === voteKey(voting.id, user.id))?.[1]
    return Array.isArray(v) ? (v as string[]) : []
  }, [votes, voting, user.id])
  const results = React.useMemo(
    () => (voting?.closedAt ? tally(votes, voting.id, new Set(notes.map((n) => n.id))) : []),
    [voting, votes, notes],
  )
  const counts = React.useMemo(() => new Map(results.map((r) => [r.id, r.count])), [results])

  const startVoting = (perPerson: number) =>
    yDoc.transact(() => {
      yFac.set("voting", { id: newId(), perPerson, byId: user.id, byName: user.name } satisfies BoardVoting)
    })
  const endVoting = () => voting && setShared("voting", { ...voting, closedAt: Date.now() })
  const clearVoting = () =>
    yDoc.transact(() => {
      if (voting) for (const k of Array.from(yVotes.keys())) if (k.startsWith(`${voting.id}:`)) yVotes.delete(k)
      yFac.delete("voting")
    })
  const vote = (noteId: string) => {
    if (!voting || voting.closedAt || !editable) return
    const next = toggleVote(myVotes, noteId, voting.perPerson)
    if (!next) {
      toast({ title: `You've used all ${voting.perPerson} votes`, description: "Take one back to vote for something else." })
      return
    }
    yDoc.transact(() => yVotes.set(voteKey(voting.id, user.id), next))
  }
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
    const read = () => {
      const out: Presenter[] = []
      ;(awareness?.getStates() as Map<number, Record<string, unknown>> | undefined)?.forEach((state, clientId) => {
        if (clientId === awareness?.clientID) return
        const p = state.presenting as Omit<Presenter, "clientId"> | null | undefined
        if (p?.view) out.push({ ...p, clientId })
      })
      setPresenters(out)
    }
    read()
    awareness?.on("change", read)
    return () => awareness?.off("change", read)
  }, [awareness])

  // Broadcast what we show while presenting; stop when we stop or leave.
  React.useEffect(() => {
    if (!awareness) return
    if (!presenting || !view) {
      awareness.setLocalStateField("presenting", null)
      return
    }
    const t = setTimeout(() => {
      awareness.setLocalStateField("presenting", {
        userId: user.id,
        name: user.name,
        view: { scrollX: view.scrollX, scrollY: view.scrollY, zoom: view.zoom, width: view.width, height: view.height },
      })
    }, 80)
    return () => clearTimeout(t)
  }, [awareness, presenting, view, user.id, user.name])
  React.useEffect(() => () => awareness?.setLocalStateField("presenting", null), [awareness])

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
  const votesLeft = voting ? voting.perPerson - myVotes.length : 0
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

  if (idle && !editable) return null

  const segments: React.ReactNode[] = []

  if (presenting) {
    segments.push(
      <Segment key="presenting" tone="about-you">
        <Presentation className="size-4" aria-hidden />
        <span>You&apos;re presenting</span>
        <SegmentButton onClick={() => setPresenting(false)}>Stop</SegmentButton>
      </Segment>,
    )
  } else if (presenters.length > 0) {
    segments.push(
      <Segment key="presenter" tone="about-you">
        <Presentation className="size-4" aria-hidden />
        {presenter ? (
          <>
            <span>Following {presenter.name}</span>
            <SegmentButton onClick={stopFollowing}>Stop</SegmentButton>
          </>
        ) : (
          <>
            <span>{presenters[0].name} is presenting</span>
            <SegmentButton
              onClick={() => {
                declined.current.delete(presenters[0].clientId)
                setFollowing(presenters[0].clientId)
              }}
            >
              Follow
            </SegmentButton>
          </>
        )}
      </Segment>,
    )
  }

  if (voting && !voting.closedAt) {
    segments.push(
      <Segment key="voting">
        <span className="text-ink-2">
          {editable ? (votesLeft > 0 ? `Voting · ${votesLeft} left` : "Voting · all used") : `${voting.byName} started voting`}
        </span>
        {editable && voting.perPerson <= 10 ? (
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
        {editable && <SegmentButton onClick={endVoting}>End voting</SegmentButton>}
      </Segment>,
    )
  }
  if (voting?.closedAt) {
    segments.push(
      <Segment key="results">
        <Popover>
          <PopoverTrigger asChild>
            <SegmentButton>
              <Vote className="size-3.5" aria-hidden />
              {results.length > 1 && results[0].count === results[1].count
                ? "Results: a tie at the top"
                : results.length > 0
                  ? `Results: “${notes.find((n) => n.id === results[0].id)?.text ?? ""}” leads`
                  : "Results"}
            </SegmentButton>
          </PopoverTrigger>
          <PopoverContent side="top" sideOffset={10} className="content-float w-72 rounded-xl bg-pop p-1.5 shadow-e3">
            {results.length === 0 ? (
              <p className="p-2 text-ui-sm text-ink-2">Nobody voted.</p>
            ) : (
              <ol className="grid gap-0.5">
                {results.slice(0, 10).map((r, i) => {
                  const max = results[0].count || 1
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => goTo(r.id)}
                        {...ix("item")}
                        className="relative flex h-9 w-full items-center gap-2 overflow-hidden rounded-lg px-2 text-left text-ui"
                      >
                        <span
                          aria-hidden="true"
                          className="board-grow absolute inset-y-1 left-1 origin-left rounded-md bg-press"
                          style={{ width: `calc(${(r.count / max) * 100}% - 8px)`, ["--i" as string]: i }}
                        />
                        <span className="relative w-4 text-meta tabular-nums text-ink-3">{i + 1}</span>
                        <span className="relative min-w-0 flex-1 truncate text-ink">{notes.find((n) => n.id === r.id)?.text}</span>
                        <span className="relative text-meta font-semibold tabular-nums text-ink">{r.count}</span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            )}
          </PopoverContent>
        </Popover>
        {editable && (
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
        {editable && !timeUp && (
          <>
            {timer.pausedLeftMs !== undefined ? (
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
        {editable && (
          <SegmentIcon label={timeUp ? "Dismiss" : "Stop the timer"} onClick={() => setShared("timer", null)}>
            <X />
          </SegmentIcon>
        )}
      </Segment>,
    )
  }

  // Starting things (editors).
  if (editable && (!timer || !voting || !presenting)) {
    segments.push(
      <Segment key="start" quiet>
        {!timer && (
          <Choice icon={<Timer className="size-3.5" />} label="Timer" options={TIMER_MINUTES.map((m) => ({ label: `${m} min`, onPick: () => startTimer(m) }))} side="top" />
        )}
        {!voting && (
          <Choice
            icon={<Vote className="size-3.5" />}
            label="Vote"
            heading="Votes for each person"
            options={VOTES_EACH.map((n) => ({ label: `${n} ${n === 1 ? "vote" : "votes"}`, onPick: () => startVoting(n) }))}
            side="top"
          />
        )}
        {!presenting && (
          <SegmentButton
            onClick={() => {
              setFollowing(null)
              setPresenting(true)
            }}
          >
            <Presentation className="size-3.5" aria-hidden />
            Present
          </SegmentButton>
        )}
      </Segment>,
    )
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
                onClick={() => vote(n.id)}
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

      {segments.length > 0 && (
        <div
          className={cn(
            "pointer-events-none absolute left-1/2 z-20 flex w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 justify-center",
            // On a phone, above the canvas's footer and the board's own buttons:
            // at the top it covered Excalidraw's tool row. On a computer, docked
            // above the tool bar at the bottom centre.
            isMobile ? "bottom-[8.5rem]" : "bottom-[72px]",
          )}
        >
          <div
            role="toolbar"
            aria-label="Facilitation"
            data-board-chrome=""
            data-facilitation=""
            className="content-float pointer-events-auto flex h-11 max-w-full items-center overflow-x-auto rounded-[22px] bg-pop px-1.5 text-ui-sm text-ink shadow-e3"
          >
            {segments.map((seg, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-line-2" />}
                {seg}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

/** One part of the facilitation cluster. */
function Segment({ children, tone, quiet }: { children: React.ReactNode; tone?: "about-you" | "sun"; quiet?: boolean }) {
  return (
    <div
      className={cn(
        "flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[16px] px-2",
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

function SegmentIcon({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-[14px] text-ink-3 outline-none transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand [&_svg]:size-3.5"
    >
      {children}
    </button>
  )
}

function Choice({
  icon,
  label,
  heading,
  options,
  side,
}: {
  icon: React.ReactNode
  label: string
  heading?: string
  options: { label: string; onPick: () => void }[]
  side: "top" | "bottom"
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <SegmentButton>
          {icon}
          {label}
        </SegmentButton>
      </PopoverTrigger>
      <PopoverContent side={side} sideOffset={10} className="content-float w-44 rounded-xl bg-pop p-1 shadow-e3">
        {heading && <p className="px-2 py-1 text-meta font-medium text-ink-3">{heading}</p>}
        {options.map((o) => (
          <button
            key={o.label}
            type="button"
            onClick={() => {
              o.onPick()
              setOpen(false)
            }}
            {...ix("item")}
            className="flex h-8 w-full items-center rounded-lg px-2 text-left text-ui text-ink"
          >
            {o.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
