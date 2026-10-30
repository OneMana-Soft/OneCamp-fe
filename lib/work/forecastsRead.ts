import type { ProjectForecast } from "@/lib/work/forecast"

/**
 * The read of many projects' forecasts (GET /project/forecasts, linear-20): its paths and its answer, apart from the
 * forecast's words (lib/work/forecast). A page reads the forecasts through these (hooks/useProjectForecasts) and hands
 * what came to its lazy lines (components/project/ForecastLines), which say it: none of the forecast's own code is on a
 * page's first load, and the lines' chunk reaches nothing a page shares (swr, the API client), which re-cut the shared
 * chunks of every route (LEAD-RULES, 30 Oct).
 */

/**
 * The most projects one forecasts read takes: the server refuses more whole. A list of more is read in pages of this
 * many, as 100 ids (~3.7 KB) keep the address well under a proxy's 8 KB.
 */
export const FORECASTS_PAGE = 100

/** GET /project/forecasts's answer: each project's forecast that the reader may see, by its id in lower case. */
export interface ForecastsAnswer {
  data: { forecasts: Record<string, ProjectForecast> }
}

/** What a list's forecasts read brought: each page's forecasts, by project id in lower case. */
export type ForecastPages = Record<string, ProjectForecast>[]

/**
 * The reads of many projects' forecasts, in zone tz: the distinct ids in id order, FORECASTS_PAGE to a read, so the
 * same projects always ask the same, however they're sorted on screen; none with no ids.
 */
export function forecastsPaths(ids: string[], tz: string): string[] {
  const all = [...new Set(ids.map((id) => id.toLowerCase()))].sort()
  const paths: string[] = []
  for (let at = 0; at < all.length; at += FORECASTS_PAGE) {
    paths.push(`/project/forecasts?ids=${all.slice(at, at + FORECASTS_PAGE).join(",")}&tz=${encodeURIComponent(tz)}`)
  }
  return paths
}
