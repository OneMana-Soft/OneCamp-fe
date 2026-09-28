"use client"

import { useCallback, useEffect, useState } from "react"
import { readSidebarSections, writeSidebarSection } from "@/lib/nav/sidebarDisclosure"

const KEY = "board-column:"

/**
 * Which status columns a board shows, remembered across reloads. Someone who
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
      for (const column of Object.keys(next)) {
        const v = stored[KEY + column]
        if (typeof v === "boolean") next[column] = v
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
