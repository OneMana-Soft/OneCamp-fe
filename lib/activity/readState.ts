"use client"

/**
 * Read and unread for Activity rows (hub.md A4).
 *
 * A row is unread as the server marks it (item.unread, the rule the badge
 * counts by), unless marked otherwise here: an overlay kept in this browser
 * (try/catch, so a private window forgets it), capped. Drawn as a dot only.
 * Opening the Inbox moves the last look, so the server marks nothing unread
 * after it: the rows it counted are kept here (counted) until read here, or
 * where they are (CR-B10 M1).
 */
import { useCallback, useEffect, useState } from "react"

import { activityKey } from "@/lib/activity/feedPages"
import type { UnifiedActivityItem } from "@/types/activity"

const READ = "activity:read"
const UNREAD = "activity:unread"
/** Each counted row's key with its priority then: [key, priority][]. */
const COUNTED = "activity:counted"
const CAP = 500

function load(store: string): string[] {
  try {
    const raw = window.localStorage.getItem(store)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

function save(store: string, keys: Iterable<unknown>) {
  try {
    window.localStorage.setItem(store, JSON.stringify([...keys].slice(-CAP)))
  } catch {
    // Kept for this visit only.
  }
}

function loadCounted(): Map<string, string> {
  try {
    const list = JSON.parse(window.localStorage.getItem(COUNTED) ?? "[]") as unknown
    const pairs = Array.isArray(list) ? list.filter((p): p is [string, string] => Array.isArray(p) && typeof p[0] === "string" && typeof p[1] === "string") : []
    return new Map(pairs)
  } catch {
    return new Map()
  }
}

/**
 * The dot: marked unread here, or else not marked read here and either
 * unread as the server marks it or counted by the badge and not read where it
 * is since (demoted to low from what it was). Pure.
 */
export function isUnread(
  item: Pick<UnifiedActivityItem, "unread" | "priority">,
  key: string,
  read: ReadonlySet<string>,
  markedUnread?: ReadonlySet<string>,
  counted?: ReadonlyMap<string, string>,
): boolean {
  if (markedUnread?.has(key)) return true
  if (read.has(key)) return false
  if (item.unread === true) return true
  const was = counted?.get(key)
  return was !== undefined && !(item.priority === "low" && was !== "low")
}

type Marks = { read: ReadonlySet<string>; unread: ReadonlySet<string>; counted: ReadonlyMap<string, string> }

export function useReadState() {
  const [marks, setMarks] = useState<Marks>(() => ({ read: new Set(), unread: new Set(), counted: new Map() }))
  // After the first paint (the server's has no storage); anything kept before it stays.
  useEffect(
    () => setMarks((prev) => ({ read: new Set([...load(READ), ...prev.read]), unread: new Set([...load(UNREAD), ...prev.unread]), counted: new Map([...loadCounted(), ...prev.counted]) })),
    [],
  )

  /** Read here (opened, or marked) or unread again; read drops it from counted. Over what's stored, as keep(). */
  const mark = useCallback((keys: string[], asRead: boolean) => {
    setMarks((prev) => {
      const read = new Set([...load(READ), ...prev.read])
      const unread = new Set([...load(UNREAD), ...prev.unread])
      const counted = new Map([...loadCounted(), ...prev.counted])
      for (const k of keys) {
        if (asRead) {
          read.add(k)
          unread.delete(k)
          counted.delete(k)
        } else {
          read.delete(k)
          unread.add(k)
        }
      }
      save(READ, read)
      save(UNREAD, unread)
      save(COUNTED, counted)
      return { read, unread, counted }
    })
  }, [])

  /** The rows the server marks unread now, kept as counted (the newest 500). */
  const keep = useCallback((items: UnifiedActivityItem[]) => {
    setMarks((prev) => {
      const fresh = items.filter((i) => i.unread === true).map((i) => [activityKey(i), i.priority ?? ""] as const).filter(([k]) => !prev.counted.has(k) && !prev.read.has(k))
      if (fresh.length === 0) return prev
      // Over what's stored: another tab's, or this one's before it was read in.
      const counted = new Map([...loadCounted(), ...prev.counted, ...fresh].slice(-CAP))
      save(COUNTED, counted)
      return { ...prev, counted }
    })
  }, [])

  return { read: marks.read, markedUnread: marks.unread, counted: marks.counted, mark, keep }
}
