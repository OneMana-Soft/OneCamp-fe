"use client"

import { useCallback, useEffect, useState } from "react"

const key = (board: string) => `oc_board_collapsed:${board}`

/** The columns folded on a board, remembered per board in this browser. */
export function useCollapsedColumns(board?: string): [Set<string>, (column: string) => void] {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    if (!board) return
    try {
      const saved = JSON.parse(localStorage.getItem(key(board)) || "[]")
      if (Array.isArray(saved)) setCollapsed(new Set(saved.filter((v) => typeof v === "string")))
    } catch {
      /* nothing remembered, nothing folded */
    }
  }, [board])
  const toggle = useCallback(
    (column: string) =>
      setCollapsed((prev) => {
        const next = new Set(prev)
        if (next.has(column)) next.delete(column)
        else next.add(column)
        if (board) {
          try {
            localStorage.setItem(key(board), JSON.stringify([...next]))
          } catch {
            /* folded for this visit only */
          }
        }
        return next
      }),
    [board],
  )
  return [collapsed, toggle]
}
