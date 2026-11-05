"use client"

import type { ReactNode } from "react"
import { forecastDay, landsAfter, type ProjectForecast } from "@/lib/work/forecast"
import type { ForecastPages } from "@/lib/work/forecastsRead"
import { ForecastWhen } from "./ForecastWhen"

// A list's forecast lines (linear-20), a chunk of their own (LazyForecastLines; V-49). The page reads the list's
// forecasts (useProjectForecasts) and hands each line what the read brought: a line finds its project's forecast and
// says it, and its chunk reaches nothing a page shares (swr, the API client), which would re-cut every route's shared
// chunks (LEAD-RULES, 30 Oct). Nothing is said until the read has come.

// One map for each answer, however many of a list's lines read it (a line a row).
const maps = new WeakMap<ForecastPages, Map<string, ProjectForecast>>()
function forecastOf(pages: ForecastPages | undefined, projectId: string): ProjectForecast | undefined {
  if (!pages) return undefined
  let map = maps.get(pages)
  if (!map) maps.set(pages, (map = new Map(pages.flatMap((page) => Object.entries(page)))))
  return map.get(projectId.toLowerCase())
}

/** One listed project's forecast: "Lands ~25 Nov", held up or not (the projects overview's rows), after `before`. */
export function ForecastWhenOf({ forecasts, projectId, before, className, fit }: { forecasts: ForecastPages | undefined; projectId: string; before?: ReactNode; className?: string; fit?: boolean }) {
  return <ForecastWhen forecast={forecastOf(forecasts, projectId)} before={before} className={className} fit={fit} />
}

/**
 * A goal's project's line of its own: "Lands ~25 Nov", and ", after the goal's date" when it lands after an open
 * goal's date. The line is one line and never more, so the face fits it (ForecastFace's `fit` and `after`): when room
 * runs out, "Lands", then the date, give whole, and "held up" and ", after the goal's date" never do.
 */
export function GoalProjectLands({ forecasts, projectId, due }: { forecasts: ForecastPages | undefined; projectId: string; due?: string }) {
  const forecast = forecastOf(forecasts, projectId)
  if (!forecastDay(forecast)) return null
  const after = landsAfter(forecast, due) ? (
    <span data-lands-after-goal="" className="font-medium text-danger-ink">
      , after the goal&apos;s date
    </span>
  ) : undefined
  return <ForecastWhen forecast={forecast} fit after={after} />
}

/** How many of an open goal's projects land after its date: the forecast's word on the goal's health. */
export function GoalLandsLate({ forecasts, ids, due }: { forecasts: ForecastPages | undefined; ids: string[]; due?: string }) {
  const late = ids.filter((id) => landsAfter(forecastOf(forecasts, id), due)).length
  if (late === 0) return null
  return (
    <span data-goal-lands-late="" className="font-medium text-danger-ink">
      {late === 1 ? "1 project lands late" : `${late} projects land late`}
    </span>
  )
}
