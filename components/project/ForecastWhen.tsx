import type { ReactNode } from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { forecastDay, heldUp, landsWords, type ProjectForecast } from "@/lib/work/forecast"
import { ForecastFace } from "./ForecastFace"

/**
 * A project's forecast said in a row that is itself a link (the projects overview, a goal's projects), so nothing
 * here takes a press: the chip's face (ForecastFace), in a quiet span. Nothing when there's nothing to forecast, not
 * even `before` (a " · " joining it to what comes first, beside it rather than in it). The chip's card, with the how, is the project's own header.
 */
export function ForecastWhen({ forecast, before, className }: { forecast: ProjectForecast | undefined; before?: ReactNode; className?: string }) {
  const day = forecastDay(forecast)
  if (!forecast || !day) return null
  const held = heldUp(forecast)
  return (
    <>
      {before}
      <span data-forecast-when={held ? "held" : "pace"} className={cn("inline-flex min-w-0 items-center gap-1 whitespace-nowrap", className)}>
        <ForecastFace lands={landsWords(day)} held={held} />
      </span>
    </>
  )
}
