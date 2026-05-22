"use client"

import { useCallback, useEffect, useState } from "react"

export interface RecentItem {
  id: string
  type: "task" | "channel" | "doc" | "project" | "team" | "chat" | "user"
  title: string
  path: string
  timestamp: number
}

const STORAGE_KEY = "onecamp-recent-items"
const MAX_RECENT = 10

function getStorage(): RecentItem[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RecentItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function setStorage(items: RecentItem[]) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Ignore quota errors
  }
}

export function useRecentItems() {
  const [recentItems, setRecentItems] = useState<RecentItem[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setRecentItems(getStorage())
    setHydrated(true)
  }, [])

  const addRecentItem = useCallback((item: Omit<RecentItem, "timestamp">) => {
    setRecentItems((prev) => {
      const next = prev.filter((r) => !(r.id === item.id && r.type === item.type))
      next.unshift({ ...item, timestamp: Date.now() })
      const trimmed = next.slice(0, MAX_RECENT)
      setStorage(trimmed)
      return trimmed
    })
  }, [])

  const clearRecentItems = useCallback(() => {
    setRecentItems([])
    setStorage([])
  }, [])

  return { recentItems, hydrated, addRecentItem, clearRecentItems }
}
