"use client"

import { useCallback, useState } from "react"
import { BOARD_CLOSED_MAX, BOARD_CLOSED_STEP } from "@/components/kanbanComponents/TaskBoard"

/**
 * How many done and cancelled tasks a board asks for, and "show more". The
 * query parameter is only sent once more was asked for, so the default board
 * keeps one cache key.
 */
export function useClosedLimit() {
  const [limit, setLimit] = useState(BOARD_CLOSED_STEP)
  const showMore = useCallback(() => setLimit((n) => Math.min(n + BOARD_CLOSED_STEP, BOARD_CLOSED_MAX)), [])
  return { showMore, param: limit > BOARD_CLOSED_STEP ? `closedLimit=${limit}` : "" }
}

/** Joins query strings, skipping empty ones. */
export const withQuery = (path: string, ...parts: string[]) => {
  const q = parts.filter(Boolean).join("&")
  return q ? `${path}?${q}` : path
}
