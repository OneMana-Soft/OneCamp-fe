"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

/**
 * The rows in the order last shown (`shown`, their keys): one whose place
 * changed waits where it was, a new one goes last, a gone one goes. Pure.
 */
export function heldOrder<T>(rows: readonly T[], keyOf: (row: T) => string, shown: readonly string[]): T[] {
  const byKey = new Map(rows.map((r) => [keyOf(r), r]))
  const out: T[] = []
  for (const key of shown) {
    const row = byKey.get(key)
    if (row) {
      out.push(row)
      byKey.delete(key)
    }
  }
  return out.concat([...byKey.values()])
}

/** How long a pointer resting on a list holds its order before the order may change. */
export const HOLD_RELEASE_MS = 2000

/**
 * A list that never reorders under the pointer (F-17): while the pointer
 * moves over it, or focus is in it, rows keep the order they had; it moves
 * on when the pointer leaves, after HOLD_RELEASE_MS at rest, or when focus
 * goes. Spread `handlers` on the list's element.
 */
export function useHeldOrder<T>(rows: T[], keyOf: (row: T) => string) {
  const [pointer, setPointer] = useState(false)
  const [focus, setFocus] = useState(false)
  const rest = useRef(0)
  useEffect(() => () => window.clearTimeout(rest.current), [])
  const held = pointer || focus

  const shown = useRef<readonly string[] | null>(null)
  const ordered = useMemo(() => (held && shown.current ? heldOrder(rows, keyOf, shown.current) : rows), [rows, keyOf, held])
  useEffect(() => {
    shown.current = ordered.map(keyOf)
  }, [ordered, keyOf])

  const onPointerMove = useCallback(() => {
    setPointer(true)
    window.clearTimeout(rest.current)
    rest.current = window.setTimeout(() => setPointer(false), HOLD_RELEASE_MS)
  }, [])
  const onPointerLeave = useCallback(() => {
    window.clearTimeout(rest.current)
    setPointer(false)
  }, [])
  const onFocus = useCallback(() => setFocus(true), [])
  const onBlur = useCallback((e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocus(false)
  }, [])

  return { rows: ordered, handlers: { onPointerMove, onPointerLeave, onFocus, onBlur } }
}
