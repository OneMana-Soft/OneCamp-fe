"use client"

import { useTheme } from "next-themes"

/**
 * A board canvas's theme: the app's, as it resolves (the person's choice, or
 * their system's while they have made none). A member's board and a board
 * shared by link both follow it, so a canvas never sits light in a dark page
 * or dark in a light one. A call's stage passes "dark" instead.
 */
export function useBoardTheme(): "light" | "dark" {
  const { resolvedTheme } = useTheme()
  return resolvedTheme === "dark" ? "dark" : "light"
}
