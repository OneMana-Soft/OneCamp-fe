"use client"

import { useCallback, useEffect, useMemo } from "react"
import { useStoredState } from "@/hooks/useStoredState"
import { readSidebarSections, writeSidebarSection } from "@/lib/nav/sidebarDisclosure"

/** Every open status and Done show; Cancelled waits to be asked for. */
const DEFAULTS: Record<string, boolean> = { canceled: false }

const isChoices = (v: unknown): v is Record<string, boolean> =>
  !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "boolean")

/**
 * Which status columns a board shows, remembered for that board across
 * reloads, as its grouping and its folded columns are: a project's (its id),
 * or My tasks' ("mine"). A column not chosen (a project's own status) is
 * shown; see isShown. In review and Backlog show by default: hidden, a task
 * moved there from its panel left the board. The choice was once one for
 * every board, kept in the sidebar's cookie; that one is dropped, unread,
 * since a hidden In review is what lost cards.
 */
export function useBoardColumns(board: string | undefined): [Record<string, boolean>, (column: string, shown: boolean) => void] {
  const [chosen, setChosen] = useStoredState<Record<string, boolean>>(board ? `oc_board_columns:${board}` : undefined, {}, isChoices)
  // The cookie goes with every request: the old entries, unread, are dropped.
  useEffect(() => {
    for (const key of Object.keys(readSidebarSections())) if (key.startsWith("board-column:")) writeSidebarSection(key, undefined)
  }, [])
  const columns = useMemo(() => ({ ...DEFAULTS, ...chosen }), [chosen])
  const setColumn = useCallback((column: string, shown: boolean) => setChosen((current) => ({ ...current, [column]: shown })), [setChosen])
  return [columns, setColumn]
}

/** Whether a column is shown: as chosen, or yes for one never chosen. */
export function isShown(columns: Record<string, boolean>, column: string): boolean {
  return columns[column] ?? true
}
