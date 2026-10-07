"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * A choice remembered in this browser (localStorage, as JSON) under a key: a
 * board's grouping, its folded columns. `accept` vets what was stored, so a
 * value from an older version or a hand edit falls back to the default. With
 * no key it is plain state. Storage failures (private windows) are ignored:
 * the choice then lasts the visit.
 */
export function useStoredState<T>(key: string | undefined, initial: T, accept: (v: unknown) => v is T) {
  const [value, setValue] = useState<T>(initial)
  // Whether the remembered value has been read: a view that lays itself out
  // from it (a timeline's zoom) waits for it rather than drawing twice.
  const [loaded, setLoaded] = useState(!key)
  useEffect(() => {
    if (!key) return
    try {
      const raw = localStorage.getItem(key)
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw)
        if (accept(parsed)) setValue(parsed)
      }
    } catch {
      /* nothing remembered */
    }
    setLoaded(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once per key
  }, [key])
  const set = useCallback(
    (next: T | ((prev: T) => T)) =>
      setValue((prev) => {
        const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next
        if (key) {
          try {
            localStorage.setItem(key, JSON.stringify(v))
          } catch {
            /* remembered for this visit only */
          }
        }
        return v
      }),
    [key],
  )
  return [value, set, loaded] as const
}
