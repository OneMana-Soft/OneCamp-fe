"use client"

// A project's forecast (linear-20), counted in the reader's own days, over the
// work they may see: lib/work/forecast says what it means.

import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { browserTZ } from "@/lib/utils/timeZone"
import { forecastPath, type ForecastAnswer } from "@/lib/work/forecast"

/** forecast: undefined while it's read; error: why the read failed, when it did. */
export function useProjectForecast(projectId: string | undefined) {
  const read = useFetch<ForecastAnswer>(projectId ? `${forecastPath(projectId)}?tz=${encodeURIComponent(browserTZ())}` : "", undefined, undefined, OWN_ERRORS)
  return { forecast: read.data?.data, error: read.isError as unknown, retry: () => void read.mutate() }
}
