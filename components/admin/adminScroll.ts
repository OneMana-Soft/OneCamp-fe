"use client"

import { createContext, useContext, type RefObject } from "react"

/**
 * The admin page's one scroll container (app/app/admin/page.tsx), for a list
 * inside a section that draws only the rows in view (the members list): the
 * page scrolls, not the card, so the list needs the page's scroller to know
 * which rows are visible. Outside the admin page it is null, and such a list
 * draws every row.
 */
export const AdminScrollContext = createContext<RefObject<HTMLElement | null> | null>(null)

export function useAdminScroller(): RefObject<HTMLElement | null> | null {
  return useContext(AdminScrollContext)
}
