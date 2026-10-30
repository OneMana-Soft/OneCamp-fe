"use client"

import React from "react"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import type { Doc as YDoc, Map as YMap } from "yjs"
import { PartRetry } from "@/components/ui/part-retry"
import { PHONE_DOCK } from "@/components/board/phoneDock"
import { useMedia } from "@/context/MediaQueryContext"
import { cn } from "@/lib/utils/helpers/cn"
import type { BoardTimer, BoardVoting } from "@/lib/board/facilitation"
import type { BoardView } from "@/lib/board/viewport"

/**
 * Where the facilitation bar docks, and the one surface it is drawn on. The bar (boardFacilitation) is a
 * chunk of its own, so this part is static: the words that its code couldn't come stand in the same dock,
 * on the same surface, and the bar lands where they stood.
 */

/** The bar's surface: a pill on the board, above the canvas. */
export const BAR_SURFACE = "content-float pointer-events-auto flex max-w-full items-center rounded-[22px] bg-pop px-1.5 text-ink shadow-e3"

/** On a computer, the widest the bar may be: the room the board's bottom row leaves it (components/board/bottomRow.ts). */
export const BAR_MAX_COMPUTER = "max-w-[min(calc(100%-1.5rem),var(--board-facilitation-max,100%))]"

/**
 * The facilitation dock. On a phone, above the canvas's footer and the board's own buttons: at the top it
 * covered Excalidraw's tool row. On a computer, docked above the tool bar, on its middle and clear of the zoom
 * cluster when that rises beside it (components/board/bottomRow.ts finds what it docks by data-facilitation).
 */
export function FacilitationDock({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  const { isMobile } = useMedia()
  return (
    <div
      {...rest}
      className={cn(
        "pointer-events-none absolute z-20 flex w-max -translate-x-1/2 justify-center",
        isMobile
          ? cn(PHONE_DOCK.facilitation, "left-1/2 max-w-[calc(100%-1.5rem)]")
          : cn("bottom-[72px] left-[calc(50%+var(--board-facilitation-x,0px))] -translate-y-[var(--board-facilitation-lift,0px)]", BAR_MAX_COMPUTER),
        className,
      )}
      data-phone-foot=""
    >
      {children}
    </div>
  )
}

/** What's on in a board's facilitation, as every screen sees it. */
export interface FacilitationOn {
  presenting: boolean
  voting: boolean
  timer: boolean
}

// ---- The one reader -------------------------------------------------------
// What's on, read the same way by the bar (boardFacilitation, useBoardVoting) and by its place when the
// bar's code couldn't come, so the two never disagree (code review, 29 Oct). The round and the timer live
// in the board's Yjs map "facilitation"; presenting travels over awareness, so it ends when the presenter
// leaves. Each name is written here once.

/** The board's shared facilitation map, and its keys. */
export const facilitationOf = (doc: YDoc): YMap<unknown> => doc.getMap<unknown>("facilitation")
export const ROUND_KEY = "voting"
export const TIMER_KEY = "timer"
/** The awareness field a presenting screen fills with the view it shows (null when it stops). */
export const PRESENTING_FIELD = "presenting"

/** The board's round, running or ended: an ended round stays on, with its Results, until it's cleared. */
export const roundIn = (shared: YMap<unknown>): BoardVoting | null => (shared.get(ROUND_KEY) as BoardVoting | undefined) ?? null

/** The board's timer, running, paused or run out (it stays on, saying time's up, until it's dismissed). */
export const timerIn = (shared: YMap<unknown>): BoardTimer | null => (shared.get(TIMER_KEY) as BoardTimer | undefined) ?? null

/** Another screen presenting: who, and the view it shows. */
export interface Presenter {
  clientId: number
  userId: string
  name: string
  view: Pick<BoardView, "scrollX" | "scrollY" | "zoom" | "width" | "height">
}

/** A board's awareness, as far as the reader needs it. */
interface AwarenessLike {
  clientID: number
  getStates(): Map<number, Record<string, unknown>>
}

/** Every other screen presenting (its awareness has a view); this screen's own never counts. */
export function presentersIn(awareness: AwarenessLike | null | undefined): Presenter[] {
  const out: Presenter[] = []
  awareness?.getStates().forEach((state, clientId) => {
    if (clientId === awareness.clientID) return
    const p = state[PRESENTING_FIELD] as Omit<Presenter, "clientId"> | null | undefined
    if (p?.view) out.push({ ...p, clientId })
  })
  return out
}

const PRESENTING = 1
const VOTING = 2
const TIMER = 4

/** What's on, as bits (a stable snapshot), through the one reader. */
function onNow(provider: HocuspocusProvider): number {
  const shared = facilitationOf(provider.document)
  return (presentersIn(provider.awareness).length > 0 ? PRESENTING : 0) | (roundIn(shared) ? VOTING : 0) | (timerIn(shared) ? TIMER : 0)
}

/** What's on in the board's facilitation, live, without the bar's code. */
export function useFacilitationOn(provider: HocuspocusProvider): FacilitationOn {
  const subscribe = React.useCallback(
    (changed: () => void) => {
      const shared = facilitationOf(provider.document)
      const awareness = provider.awareness
      shared.observe(changed)
      awareness?.on("change", changed)
      return () => {
        shared.unobserve(changed)
        awareness?.off("change", changed)
      }
    },
    [provider],
  )
  const bits = React.useSyncExternalStore(subscribe, () => onNow(provider), () => 0)
  return { presenting: (bits & PRESENTING) > 0, voting: (bits & VOTING) > 0, timer: (bits & TIMER) > 0 }
}

/**
 * What a screen whose bar couldn't come is missing, as PartRetry's {what}. An editor misses the bar's own
 * tools. A viewer's bar only shows what's on, so a viewer misses what's on, in the bar's order, and nothing
 * while nothing is (main and design review, 29 Oct).
 */
export function missingFromBar(on: FacilitationOn, editable: boolean): string | null {
  if (editable) return "Timer, Vote and Present"
  const parts = [on.presenting && "who's presenting", on.voting && "the vote", on.timer && "the timer"].filter((part): part is string => !!part)
  if (parts.length === 0) return null
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
}

/**
 * The bar's place when its code couldn't come (page.tsx: lazyPart's failed): PartRetry, in the bar's dock and
 * on its surface, while the rest of the board carries on. lazyPart also tries again once the browser is back
 * online. It reads shared state only, so it changes nothing anyone can do.
 */
export function FacilitationFailed({ provider, editable, retry }: { provider: HocuspocusProvider; editable: boolean; retry: () => void }) {
  const what = missingFromBar(useFacilitationOn(provider), editable)
  if (!what) return null
  return (
    <FacilitationDock role="alert">
      <div data-board-chrome="" data-facilitation="" data-facilitation-failed="" className={cn(BAR_SURFACE, "min-h-11")}>
        <PartRetry what={what} retry={retry} className="rounded-[18px]" />
      </div>
    </FacilitationDock>
  )
}
