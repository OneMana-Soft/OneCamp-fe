"use client"

// The reader's keywords (chat P3): one quiet read, shared with the settings
// card; the marker loads only once there are some.

import { useEffect, useMemo, useState } from "react"
import { useFetch } from "@/hooks/useFetch"

/** Your keywords and VIPs (router/chatReach.go). */
export const PERSONAL_ALERT_PATHS = { keywords: "/me/keywords", vips: "/me/vips" } as const

type Mark = (html: string, keywords: readonly string[]) => string

const QUIET = { silent: true, suppressErrorToast: true } as never
const OPTIONS = { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 }
const NONE: readonly string[] = []
let loaded: Mark | undefined

/** The reader's keywords; none while they load or when they can't be read. */
export function useMyKeywords(enabled = true): readonly string[] {
  return useFetch<{ data: string[] }>(enabled ? PERSONAL_ALERT_PATHS.keywords : "", undefined, OPTIONS, QUIET).data?.data ?? NONE
}

/** The marker for one message: a channel's own posts, never the reader's own. */
export function useKeywordsFor(channelPost: boolean, writerId: string | undefined, selfId: string | undefined): ((html: string) => string) | undefined {
  const on = channelPost && !!selfId && writerId !== selfId
  const keywords = useMyKeywords(on)
  const [mark, setMark] = useState(() => loaded)
  const want = on && keywords.length > 0
  useEffect(() => {
    if (!want || mark) return
    let live = true
    void import("@/components/message/markKeywords").then((m) => {
      loaded = m.markKeywords
      if (live) setMark(() => m.markKeywords)
    })
    return () => {
      live = false
    }
  }, [want, mark])
  return useMemo(() => (want && mark ? (html: string) => mark(html, keywords) : undefined), [want, mark, keywords])
}
