import type { ReactNode } from "react"
import { SignalDot } from "@/components/projectUpdates/HealthPill"
import { landsDay, landsWords } from "@/lib/work/forecast"

/**
 * A project's forecast as it is said everywhere (linear-20): "Lands ~25 Nov", and, held up, the at-risk dot and
 * "· held up" in words too, never by the dot's colour alone. ONE face: the project header's chip wraps it in its
 * button (with its calendar mark when on pace), and a listed project's line (ForecastWhen) in a quiet span. Its
 * parts are the wrapper's flex items, so the wrapper sets the gap and the size. Its words are never cut to a stub.
 *
 * `fit`, for a line that is one line and never more (the overview's phone rows and a goal's lands lines, V-280):
 * when room runs out, "Lands" gives first, then the date, each whole; the dot and the last part, "held up" (or the
 * date, on pace), never give.
 * The parts sit in a one-line, reversed, wrapping flex: the last in order wraps first, onto a second line that is
 * never shown, and the first in order, the part that never gives, sits at the end, so what's shown reads together
 * and any room left over trails after it. Only that second line is clipped, so a part on the shown line is never
 * cut; the title carries the whole forecast for a part that gave. The words keep their reading order for a screen
 * reader and a copy. Elsewhere the face never gives: the chip keeps its size, and the overview's table cell wraps
 * "held up" under the date. A one-line home without `fit` would let the face run under what follows it.
 *
 * `after`: what follows the forecast on its line (a goal's ", after the goal's date"). It comes last and, like the
 * part before it, never gives; fitted, it sits inside the wrap, first in order, so the room the words leave over
 * trails after it rather than opening a hole before it.
 */
export function ForecastFace({ day, held, pace, fit = false, after }: { day: string; held: boolean; pace?: ReactNode; fit?: boolean; after?: ReactNode }) {
  const mark = held ? <SignalDot health="at_risk" /> : pace
  if (!fit)
    return (
      <>
        {mark}
        <span className="whitespace-nowrap tabular-nums">{landsWords(day)}</span>
        {held && <span className="shrink-0 text-ink-2">· held up</span>}
        {after}
      </>
    )
  return (
    <>
      {mark}
      <span
        data-forecast-words=""
        title={`${landsWords(day)}${held ? " · held up" : ""}`}
        className="inline-flex h-[1lh] min-w-0 flex-row-reverse flex-wrap content-start justify-end overflow-y-clip tabular-nums"
      >
        <span className="order-2 whitespace-pre">Lands </span>
        {/* Held up, the date carries the " · " before "held up", so it gives with the date. */}
        <span className="order-1 whitespace-pre">{held ? `${landsDay(day)} · ` : landsDay(day)}</span>
        {held && <span className="whitespace-nowrap text-ink-2">held up</span>}
        {after && <span className="-order-1 whitespace-nowrap">{after}</span>}
      </span>
    </>
  )
}
