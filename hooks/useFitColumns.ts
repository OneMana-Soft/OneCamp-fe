"use client"

import { useEffect, useMemo, useState, type RefObject } from "react"
import { columnsToHide } from "@/lib/table/fitColumns"

/** The columns to hide so a table fits its container (see lib/table/fitColumns). */
export function useFitColumns(ref: RefObject<HTMLElement | null>, columns: string[], userVisibility: Record<string, boolean>) {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  const key = columns.join(",")
  // eslint-disable-next-line react-hooks/exhaustive-deps -- columns by value
  return useMemo(() => columnsToHide(width, columns, userVisibility), [width, key, userVisibility])
}
