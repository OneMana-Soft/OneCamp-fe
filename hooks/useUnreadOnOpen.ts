"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useStore } from "react-redux"
import type { RootState } from "@/store/store"
import { useFetch } from "@/hooks/useFetch"
import { useInSplitPane } from "@/hooks/useLinkTarget"
import { answeredAt, onAnswered } from "@/lib/http/answered"
import { CACHE_ONLY } from "@/lib/http/cacheOnly"
import { GetEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"

const SIDE = GetEndpointUrl.SelfProfileSideNav
// Opened at the page's own address, first, it opened with the page.
const seen = new Set<string>()
const loadedAt = () => new URL(performance.getEntriesByType?.("navigation")[0]?.name || location.href).pathname

/**
 * How many were unread as a conversation opened (chat B27), once: the store's
 * if the sidebar answered before; else an answer asked for since (never the
 * last visit's), a DM's or group's latest page, else the sidebar's. 0 after 5 s
 * (30 s while a latest page is to come).
 */
export function useUnreadOnOpen(
  id: string | undefined,
  inStore: (s: RootState) => number | undefined,
  inSidebar: (a: UserProfileInterface) => number | undefined,
  latest = "",
): number | undefined {
  const store = useStore<RootState>()
  const [known, setKnown] = useState<{ id?: string; n?: number }>({})
  const done = !!id && known.id === id
  const side = useFetch<UserProfileInterface>(id && !done ? SIDE : "", undefined, CACHE_ONLY)
  const page = useFetch<{ data?: { unread?: number } }>(id && !done && latest ? latest : "", undefined, CACHE_ONLY)
  // Followed: an answer equal to the one kept is read too.
  const heard = useSyncExternalStore(onAnswered, () => (done ? "" : `${answeredAt(SIDE)} ${latest && answeredAt(latest)}`), () => "")
  const inPane = useInSplitPane()
  const opened = useRef<{ id?: string; at: number; live?: boolean }>({ at: 0 })
  if (id && opened.current.id !== id && typeof window !== "undefined") {
    const at = !inPane && !seen.has(id) && location.pathname === loadedAt() ? 0 : Date.now()
    opened.current = { id, at, live: (answeredAt(SIDE) ?? Infinity) < at }
  }
  useEffect(() => {
    if (id) seen.add(id)
    if (!id || done) return
    const { at, live } = opened.current
    if (live) return setKnown({ id, n: inStore(store.getState()) ?? 0 })
    const since = (url: string) => (answeredAt(url) ?? 0) > at
    const paged = !latest || since(latest)
    const n = (paged ? page.data?.data?.unread : undefined) ?? (paged && since(SIDE) && side.data ? inSidebar(side.data) ?? 0 : undefined)
    if (n !== undefined) return setKnown({ id, n })
    const t = window.setTimeout(() => setKnown({ id, n: 0 }), paged ? 5000 : 30_000)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inline selectors, read once per conversation
  }, [id, done, side.data, page.data, heard, latest, store])
  return done ? known.n : undefined
}
