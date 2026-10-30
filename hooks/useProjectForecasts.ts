"use client"

import { useMemo } from "react"
import useSWR from "swr"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { browserTZ } from "@/lib/utils/timeZone"
import { forecastsPaths, type ForecastPages, type ForecastsAnswer } from "@/lib/work/forecastsRead"

/**
 * The forecasts of a list's projects (linear-20), as the read brought them: ONE read for a list's projects (the
 * projects overview, a goal's projects), and one more for each further FORECASTS_PAGE of them, never a read a row.
 * The page reads them and hands them to its lazy lines (components/project/ForecastLines), which find each project's
 * and say it. A project the reader can't see, or with nothing to forecast, has none. The forecasts add to rows already
 * drawn, so a failed read leaves them as they are (quiet, OWN_ERRORS) and SWR tries it again.
 */
export function useProjectForecasts(ids: string[]): ForecastPages | undefined {
  const paths = useMemo(() => forecastsPaths(ids, browserTZ()), [ids])
  return useSWR(paths.length > 0 ? paths : null, () => Promise.all(paths.map((path) => axiosInstance.get<ForecastsAnswer>(path, OWN_ERRORS).then((r) => r.data?.data?.forecasts ?? {}))), {
    revalidateOnFocus: false,
  }).data
}
