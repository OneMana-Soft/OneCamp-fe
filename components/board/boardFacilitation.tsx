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
import { Pause, Play, Plus, Presentation, Timer, Vote, X } from "lucide-react"
import { Button } from "@/components/ui/button"
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
  const view = useBoardView(api)
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
  const votesLeft = voting ? voting.perPerson - myVotes.length : 0
  const idle = !timer && !voting && !presenting && presenters.length === 0
  if (idle && !editable) return null

  return (
    <>
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
                style={{ left: pos.left, top: pos.top }}
                className="absolute flex h-7 min-w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground shadow"
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
                  "pointer-events-auto absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 shadow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  mine ? "border-primary bg-primary text-primary-foreground" : "border-primary/60 bg-background text-primary hover:bg-primary/10",
                )}
              >
                {mine ? <span className="h-2.5 w-2.5 rounded-full bg-current" /> : <Plus className="h-3.5 w-3.5" />}
              </button>
            ) : null
          })}
        </div>
      )}

      <div
        className={cn(
          "pointer-events-none absolute left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2",
          isMobile ? "top-2" : "bottom-4",
        )}
      >
        {/* Presenting. */}
        {presenting && (
          <Bar tone="primary">
            <Presentation className="h-4 w-4" aria-hidden />
            <span>You&apos;re presenting. Everyone follows your view.</span>
            <Button size="sm" variant="secondary" className="h-7" onClick={() => setPresenting(false)}>
              Stop
            </Button>
          </Bar>
        )}
        {!presenting && presenters.length > 0 && (
          <Bar>
            <Presentation className="h-4 w-4 text-primary" aria-hidden />
            {presenter ? (
              <>
                <span>Following {presenter.name}</span>
                <Button size="sm" variant="ghost" className="h-7" onClick={stopFollowing}>
                  Stop following
                </Button>
              </>
            ) : (
              <>
                <span>{presenters[0].name} is presenting</span>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7"
                  onClick={() => {
                    declined.current.delete(presenters[0].clientId)
                    setFollowing(presenters[0].clientId)
                  }}
                >
                  Follow
                </Button>
              </>
            )}
          </Bar>
        )}

        {/* Voting. */}
        {voting && !voting.closedAt && (
          <Bar>
            <Vote className="h-4 w-4 text-primary" aria-hidden />
            <span>
              {editable
                ? votesLeft > 0
                  ? `Voting: ${votesLeft} of ${voting.perPerson} ${voting.perPerson === 1 ? "vote" : "votes"} left. Click a note's dot.`
                  : "You've used all your votes. Click a dot to take one back."
                : `${voting.byName} started voting.`}
            </span>
            {editable && (
              <Button size="sm" className="h-7" onClick={endVoting}>
                End voting
              </Button>
            )}
          </Bar>
        )}
        {voting?.closedAt && (
          <Bar>
            <Vote className="h-4 w-4 text-primary" aria-hidden />
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="secondary" className="h-7">
                  Results{results.length > 0 && `: “${notes.find((n) => n.id === results[0].id)?.text ?? ""}” leads`}
                </Button>
              </PopoverTrigger>
              <PopoverContent side={isMobile ? "bottom" : "top"} className="w-72 p-2">
                {results.length === 0 ? (
                  <p className="p-2 text-sm text-muted-foreground">Nobody voted.</p>
                ) : (
                  <ol className="grid gap-0.5">
                    {results.slice(0, 10).map((r, i) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => goTo(r.id)}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                        >
                          <span className="w-4 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                          <span className="min-w-0 flex-1 truncate">{notes.find((n) => n.id === r.id)?.text}</span>
                          <span className="text-xs font-semibold tabular-nums">{r.count}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </PopoverContent>
            </Popover>
            {editable && (
              <Button size="sm" variant="ghost" className="h-7" onClick={clearVoting} aria-label="Clear the results">
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </Bar>
        )}

        {/* Timer. */}
        {timer && (
          <Bar tone={timeUp ? "warning" : undefined}>
            <Timer className="h-4 w-4" aria-hidden />
            <span className="font-semibold tabular-nums" role="timer" aria-live={timeUp ? "assertive" : "off"}>
              {timeUp ? "Time's up" : formatClock(left)}
            </span>
            {editable && !timeUp && (
              <>
                {timer.pausedLeftMs !== undefined ? (
                  <IconButton aria-label="Resume" onClick={resumeTimer}>
                    <Play className="h-3.5 w-3.5" />
                  </IconButton>
                ) : (
                  <IconButton aria-label="Pause" onClick={pauseTimer}>
                    <Pause className="h-3.5 w-3.5" />
                  </IconButton>
                )}
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={addMinute}>
                  +1 min
                </Button>
              </>
            )}
            {editable && (
              <IconButton aria-label={timeUp ? "Dismiss" : "Stop the timer"} onClick={() => setShared("timer", null)}>
                <X className="h-3.5 w-3.5" />
              </IconButton>
            )}
          </Bar>
        )}

        {/* Starting things (editors). */}
        {editable && (!timer || !voting || !presenting) && (
          <Bar subtle>
            {!timer && (
              <Choice icon={<Timer className="h-3.5 w-3.5" />} label="Timer" options={TIMER_MINUTES.map((m) => ({ label: `${m} min`, onPick: () => startTimer(m) }))} side={isMobile ? "bottom" : "top"} />
            )}
            {!voting && (
              <Choice
                icon={<Vote className="h-3.5 w-3.5" />}
                label="Vote"
                heading="Votes for each person"
                options={VOTES_EACH.map((n) => ({ label: `${n} ${n === 1 ? "vote" : "votes"}`, onPick: () => startVoting(n) }))}
                side={isMobile ? "bottom" : "top"}
              />
            )}
            {!presenting && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 px-2"
                onClick={() => {
                  setFollowing(null)
                  setPresenting(true)
                }}
              >
                <Presentation className="h-3.5 w-3.5" aria-hidden />
                Present
              </Button>
            )}
          </Bar>
        )}
      </div>
    </>
  )
}

function Bar({ children, tone, subtle }: { children: React.ReactNode; tone?: "primary" | "warning"; subtle?: boolean }) {
  return (
    <div
      className={cn(
        "pointer-events-auto flex max-w-[calc(100vw-2rem)] flex-wrap items-center justify-center gap-2 rounded-full border px-3 py-1 text-sm shadow-lg",
        tone === "primary"
          ? "border-primary bg-primary text-primary-foreground"
          : tone === "warning"
            ? "border-warning/40 bg-warning/15 text-foreground"
            : "bg-popover text-popover-foreground",
        subtle && "gap-0.5 px-1 opacity-90 hover:opacity-100",
      )}
    >
      {children}
    </div>
  )
}

function IconButton({ "aria-label": label, onClick, children }: { "aria-label": string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClick} aria-label={label} title={label}>
      {children}
    </Button>
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
        <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2">
          {icon}
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent side={side} className="w-44 p-1">
        {heading && <p className="px-2 py-1 text-xs text-muted-foreground">{heading}</p>}
        {options.map((o) => (
          <button
            key={o.label}
            type="button"
            onClick={() => {
              o.onPick()
              setOpen(false)
            }}
            className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
          >
            {o.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
