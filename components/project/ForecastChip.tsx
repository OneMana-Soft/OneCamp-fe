"use client"

import type { ReactNode } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { PartRetry } from "@/components/ui/part-retry"
import { skeletonClass } from "@/components/ui/skeleton"
import { useProjectForecast } from "@/hooks/useProjectForecast"
import { loadFailure } from "@/lib/http/loadFailure"
import { CalendarClock } from "@/lib/icons"
import { lazyPart } from "@/lib/lazy/lazyPart"
import { ix } from "@/lib/ui/interactive"
import { cn } from "@/lib/utils/helpers/cn"
import { forecastDay, heldUp, landsWords, type ForecastHold } from "@/lib/work/forecast"
import { ForecastFace } from "./ForecastFace"
import { ForecastCardFrame, type ForecastCardProps } from "./ForecastCardFrame"
import { ForecastChipSlot } from "./ForecastChipSlot"

/**
 * A run of the card's words as a bar of their room: the words are there, see-through, as the bar's ::before (from
 * data-words, so they are no text of the page's), and the bar wraps exactly as they do, at any width.
 */
const bar = (words: string) => (
  <span data-words={words} className={cn(skeletonClass(), "box-decoration-clone text-transparent before:content-[attr(data-words)]")} />
)

/** A late task's line in the slot: its bar, with no ellipsis to see when its words run past the line. */
const quiet = (_: ForecastHold, line: ReactNode) => <div className="text-transparent">{line}</div>

/**
 * The card's room while its code comes: the card's own frame, from the card's own props, every run of its words a
 * bar. So it holds the room of every shape of the card (held up, a very large project's), and the phone's sheet and
 * the laptop's popover open once (DB-36, DB-37).
 */
function CardSlot(props: ForecastCardProps) {
  return <ForecastCardFrame {...props} aria-hidden ink={bar} task={quiet} />
}

/** Said in the card's place when its code couldn't come, with Try again; it also comes once the browser is back online. */
function CardFailed({ retry }: ForecastCardProps & { retry: () => void }) {
  return <PartRetry what="how it's forecast" retry={retry} />
}

// The card is a chunk of its own, fetched on the chip's first press, or as the pointer or the focus comes to it
// (lib/lazy/lazyPart): it isn't the first screen's work (V-49, main 29 Oct).
const card = lazyPart<ForecastCardProps>(() => import("./ForecastCard").then((m) => m.ForecastCard), { placeholder: CardSlot, failed: CardFailed })
const warmCard = () => void card.warm()

/**
 * When the project's open work lands (linear-20), as the header's 24 px chip
 * beside its health: "Lands ~18 Nov". Its card says how (ForecastCard, a chunk
 * of its own). Held up, the chip carries the at-risk dot and says so: "· held up". A
 * project done, or with nothing to go on yet, shows nothing, as does one the
 * server refuses the reader (403, 404); a read that failed says so in the
 * chip's place, with Try again. A sheet on a phone.
 */
export function ForecastChip({ projectId, className }: { projectId: string; className?: string }) {
  const { forecast, error, retry } = useProjectForecast(projectId)
  if (!forecast) {
    if (error) return loadFailure(error) === "failed" ? <PartRetry what="the forecast" retry={retry} className={cn("max-w-full md:min-h-6", className)} /> : null
    // Its place from the first paint: the line doesn't jump when it comes.
    return <ForecastChipSlot className={className} />
  }
  const day = forecastDay(forecast)
  if (!day) return null
  const held = heldUp(forecast)
  const lands = landsWords(day)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-forecast={held ? "held" : "pace"}
          data-touch-target=""
          aria-label={`${lands}${held ? ", held up" : ""}. How it's forecast`}
          onPointerEnter={warmCard}
          onFocus={warmCard}
          {...ix("chip")}
          className={cn("chip inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-[510] text-foreground", className)}
        >
          <ForecastFace lands={lands} held={held} pace={<CalendarClock className="size-3.5 shrink-0 text-ink-3" aria-hidden />} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" data-forecast-card="" className="w-80 p-4">
        <card.Part forecast={forecast} lands={lands} held={held} />
      </PopoverContent>
    </Popover>
  )
}
