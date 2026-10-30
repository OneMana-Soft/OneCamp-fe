"use client"

import { useRef } from "react"

const same = (a: unknown, b: unknown) =>
  Object.is(a, b) || (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => Object.is(x, b[i])))

const sameFields = (row: object, old: object) =>
  Object.keys(row).length === Object.keys(old).length && Object.entries(row).every(([k, v]) => same(v, (old as Record<string, unknown>)[k]))

// Rows rebuilt every render keep last render's objects while their fields
// hold (or, given sameRow, while it says so), so a memoised row draws again
// only when it changed (fluid-01).
export function useStableRows<T extends object>(rows: readonly T[], keyOf: (row: T) => string, sameRow: (row: T, was: T) => boolean = sameFields): T[] {
  const last = useRef<{ byKey: Map<string, T>; list: T[] }>({ byKey: new Map(), list: [] })
  const byKey = new Map<string, T>()
  const list = rows.map((row) => {
    const old = last.current.byKey.get(keyOf(row))
    const keep = !!old && sameRow(row, old)
    byKey.set(keyOf(row), keep ? old : row)
    return keep ? old : row
  })
  const prev = last.current.list
  const out = prev.length === list.length && list.every((r, i) => r === prev[i]) ? prev : list
  last.current = { byKey, list: out }
  return out
}
