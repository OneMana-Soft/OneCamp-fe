"use client"

/**
 * Read and unread for Activity rows (hub.md A4).
 *
 * The server demotes what you have already seen (an item you have seen comes
 * back at priority "low"), and keeps no per-item read flag. So a row is unread
 * while the server has not demoted it and you have not marked it read here.
 * What you mark read is kept in this browser (a per-viewer convenience; read in
 * try/catch, so a private window just forgets it), capped so it never grows
 * without end. Unread is drawn as a dot and nothing else: marking a row read
 * moves nothing.
 */
import { useCallback, useEffect, useState } from "react"

import type { UnifiedActivityItem } from "@/types/activity"

const STORE = "activity:read"
const CAP = 500

function load(): string[] {
  try {
    const raw = window.localStorage.getItem(STORE)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

function save(keys: string[]) {
  try {
    window.localStorage.setItem(STORE, JSON.stringify(keys.slice(-CAP)))
  } catch {
    // Kept for this visit only.
  }
}

/** Unread unless the server demoted it or the reader marked it read. Pure. */
export function isUnread(item: Pick<UnifiedActivityItem, "priority">, key: string, read: ReadonlySet<string>): boolean {
  return item.priority !== "low" && !read.has(key)
}

export function useReadState() {
  const [read, setRead] = useState<ReadonlySet<string>>(() => new Set())
  useEffect(() => setRead(new Set(load())), [])

  const mark = useCallback((keys: string[], asRead: boolean) => {
    setRead((prev) => {
      const next = new Set(prev)
      for (const k of keys) {
        if (asRead) next.add(k)
        else next.delete(k)
      }
      save([...next])
      return next
    })
  }, [])

  return { read, mark }
}
