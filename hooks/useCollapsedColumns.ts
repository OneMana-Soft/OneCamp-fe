"use client"

import { useCallback, useMemo } from "react"
import { useStoredState } from "@/hooks/useStoredState"

const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string")

/** The columns folded on a board, remembered per board in this browser. */
export function useCollapsedColumns(board?: string): [Set<string>, (column: string) => void] {
  const [list, setList] = useStoredState<string[]>(board ? `oc_board_collapsed:${board}` : undefined, [], isStringList)
  const collapsed = useMemo(() => new Set(list), [list])
  const toggle = useCallback(
    (column: string) => setList((prev) => (prev.includes(column) ? prev.filter((c) => c !== column) : [...prev, column])),
    [setList],
  )
  return [collapsed, toggle]
}
