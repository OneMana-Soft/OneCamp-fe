"use client"

import { useCallback, useEffect, useState } from "react"
import { readSidebarSections, writeSidebarSection } from "@/lib/nav/sidebarDisclosure"

const KEY = "board-column:"

/**
 * Which status columns a board shows, remembered across reloads. A column
 * not in the map (a project's own status) is shown; see isShown. Someone who
 * turns on "In review" expects to find it there tomorrow; it used to reset to
 * the default set on every load.
 *
 * Kept in the same cookie as the sidebar's open sections (see
 * sidebarDisclosure.ts for why a cookie), under a prefix of its own. Both
 * boards, a project's and My Tasks, share the choice: it is how this person
 * likes to see work, not a property of one project.
 */
export function useBoardColumns(defaults: Record<string, boolean>): [Record<string, boolean>, (column: string, shown: boolean) => void] {
  const [columns, setColumns] = useState(defaults)

  useEffect(() => {
    const stored = readSidebarSections()
    setColumns((current) => {
      const next = { ...current }
      // Every remembered column, not only the defaults: a project's own
      // statuses are columns too, known only once the project has loaded.
      for (const [key, v] of Object.entries(stored)) {
        if (key.startsWith(KEY) && typeof v === "boolean") next[key.slice(KEY.length)] = v
      }
      return next
    })
  }, [])

  const setColumn = useCallback((column: string, shown: boolean) => {
    setColumns((current) => ({ ...current, [column]: shown }))
    writeSidebarSection(KEY + column, shown)
  }, [])

  return [columns, setColumn]
}

/** Whether a column is shown: as chosen, or yes for one never chosen. */
export function isShown(columns: Record<string, boolean>, column: string): boolean {
  return columns[column] ?? true
}
