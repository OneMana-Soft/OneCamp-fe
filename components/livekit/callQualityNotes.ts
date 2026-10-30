// Why a call stutters for each person, for whoever runs it (calls A5, #56):
// the server's verdicts (business/CallQuality's Why), read every minute while
// People is open, in the words People shows under a name.

import { useMemo } from "react"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { listOf } from "@/lib/utils/listOf"

export type QualityVerdict = "fine" | "network" | "cpu" | "other_side" | "unknown"

/** One person's verdict as the server answers it. */
type PersonQuality = { identity: string; verdict: QualityVerdict }

/** The words under a name for a verdict worth saying, and what they mean; nothing for fine or too little to tell. Pure. */
export function qualityNote(v: QualityVerdict | undefined): { label: string; detail: string } | null {
  switch (v) {
    case "network":
      return { label: "Weak connection", detail: "Their network is holding the call back: lost packets, a long round trip or too little bandwidth." }
    case "cpu":
      return { label: "Computer struggling", detail: "Their computer is holding the call back: it's too busy to send at full quality." }
    case "other_side":
      return { label: "Video freezing", detail: "Their own connection and computer are fine; video reaching them from others is freezing." }
  }
  return null
}

/** The read, only while People is open for someone who runs the call. Pure. */
export function qualityKey(sessionId: string | undefined, open: boolean, runs: boolean): string {
  return sessionId && open && runs ? `/calls/${encodeURIComponent(sessionId)}/quality` : ""
}

/** Each person's verdict, by their identity in the call; none from an answer that isn't a list, which once took the whole call page down when People opened. */
export function useQualityVerdicts(key: string): ReadonlyMap<string, QualityVerdict> {
  const { data } = useFetch<{ data?: PersonQuality[] }>(key, undefined, { refreshInterval: 60_000 }, OWN_ERRORS)
  return useMemo(() => new Map(listOf<PersonQuality>(data?.data).map((p) => [p.identity, p.verdict])), [data])
}
