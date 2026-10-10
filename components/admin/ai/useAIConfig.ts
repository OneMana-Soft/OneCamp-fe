"use client"

import { useCallback } from "react"
import useSWR from "swr"
import { GetEndpointUrl } from "@/services/endPoints"
import { getAIConfig, type AIConfig } from "@/services/aiModelService"

/**
 * The SWR key every reader of the AI settings shares. An array, not the bare
 * URL: its value is the AIConfig itself (getAIConfig unwraps the envelope),
 * and a useFetch of the URL elsewhere would cache the envelope under the same
 * string, so the two shapes would collide.
 */
export const AI_CONFIG_KEY = [GetEndpointUrl.GetAIConfig, "config"] as const

type ConfigUpdate = AIConfig | null | ((current: AIConfig | null) => AIConfig | null)

/**
 * The AI settings, read once for every section that shows a part of them.
 *
 * The Models section and the agent collaboration policy beside it each fetched
 * /admin/ai/config on their own, two requests for one document on every open
 * of the tab, and a save in one left the other's copy stale. They share one
 * key now. `setConfig` updates the shared copy in place (a switch flipped and
 * confirmed by the server), `refresh` reads it again, and both sections see
 * the result.
 */
export function useAIConfig() {
  const { data, error, isLoading, mutate } = useSWR<AIConfig>(AI_CONFIG_KEY, () => getAIConfig(), {
    // As useFetch does: a tab coming back into focus refreshes at most once a minute.
    focusThrottleInterval: 60_000,
  })
  const setConfig = useCallback(
    (next: ConfigUpdate) => {
      void mutate(
        (cur) => {
          const value = typeof next === "function" ? next(cur ?? null) : next
          return value ?? cur
        },
        { revalidate: false },
      )
    },
    [mutate],
  )
  /** Reads the settings again: the stored copy, or null when the read failed. */
  const refresh = useCallback(async () => {
    try {
      return (await mutate()) ?? null
    } catch {
      return null
    }
  }, [mutate])
  return { config: data ?? null, isLoading, error: error as unknown, setConfig, refresh }
}
