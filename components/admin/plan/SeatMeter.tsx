"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { seatWords } from "@/lib/people/seatWords"
import { removeLimit } from "@/lib/plan/planWords"

/**
 * The plan's seats: "14 of 25" over a 120x4 track. At 90 % or more the fill
 * turns sun and the words say how many places are left. The fill moves by
 * scaleX, never by width. Only drawn when the server reports a limit (the
 * free plan); a paid licence reports none and shows nothing. It leads where
 * the limit is removed (usePlan's upgradeUrl), and says so to a screen reader.
 */
export function SeatMeter({ used, limit, href }: { used: number; limit: number; href?: string }) {
  if (!limit || limit <= 0) return null
  const { words, near, ratio } = seatWords(used, limit)
  const label = `${used} of ${limit} seats used. ${href ? removeLimit(limit) : "Free plan, seats lift on purchase"}`
  const body = (
    <span data-seat-meter="" data-near={near ? "true" : undefined} className="people-meter">
      <span className="people-meter-words">
        <span className="font-medium tabular-nums text-foreground">{words}</span>
        {!near && <span className="text-ink-3"> seats</span>}
      </span>
      <span className="people-meter-track" aria-hidden="true">
        <span className="people-meter-fill" style={{ transform: `scaleX(${ratio})` }} />
      </span>
    </span>
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            aria-label={label}
            className="rounded-md focus-visible:outline-2 focus-visible:outline-ring"
          >
            {body}
          </a>
        ) : (
          <span tabIndex={0} role="img" aria-label={label} className="rounded-md focus-visible:outline-2 focus-visible:outline-ring">
            {body}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent>Free plan · seats lift on purchase</TooltipContent>
    </Tooltip>
  )
}
