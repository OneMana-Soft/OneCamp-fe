/**
 * How wide the desktop sidebar is, in pixels (design v3, shell S2).
 *
 * It was a percentage of the window (15 to 18%, a 4% rail), so its width
 * drifted as the window changed and a tablet got a 123px sidebar. v3 holds it
 * in pixels: 248 by default, resizable from 216 to 320, remembered per person
 * (a cookie), and a 56px rail when collapsed. Below SIDEBAR_RAIL_BELOW_PX the
 * sidebar starts as the rail, which leaves a tablet in portrait room for a
 * channel beside a thread; somebody who opens it there keeps it open.
 */

export const SIDEBAR_DEFAULT_PX = 248
export const SIDEBAR_MIN_PX = 216
export const SIDEBAR_MAX_PX = 320
export const SIDEBAR_RAIL_PX = 56
export const SIDEBAR_RAIL_BELOW_PX = 1024

/** Where the width and the collapsed state are kept. */
export const SIDEBAR_WIDTH_COOKIE = "onecamp-sidebar-width"
export const SIDEBAR_COLLAPSED_COOKIE = "react-resizable-root-panels:collapsed"

/** A width held to the sidebar's bounds; anything unreadable is the default. Pure. */
export function clampSidebarWidth(px: number): number {
  if (!Number.isFinite(px)) return SIDEBAR_DEFAULT_PX
  return Math.round(Math.min(SIDEBAR_MAX_PX, Math.max(SIDEBAR_MIN_PX, px)))
}

/** Whether a width asked for is past a bound, for the handle's "no further" shake. Pure. */
export function atSidebarBound(asked: number): "min" | "max" | null {
  if (asked < SIDEBAR_MIN_PX) return "min"
  if (asked > SIDEBAR_MAX_PX) return "max"
  return null
}

/** Whether the sidebar starts as the rail when nobody has chosen. */
export function startsAsRail(windowWidth: number): boolean {
  return windowWidth > 0 && windowWidth < SIDEBAR_RAIL_BELOW_PX
}

/** A cookie's value from document.cookie, or undefined. Pure. */
export function readCookie(cookies: string, name: string): string | undefined {
  const row = cookies.split("; ").find((r) => r.startsWith(`${name}=`))
  return row ? row.slice(name.length + 1) : undefined
}

/** The sidebar as this person left it: its width, and whether it was the rail. Pure. */
export function savedSidebar(cookies: string, windowWidth: number): { width: number; collapsed: boolean } {
  const w = Number(readCookie(cookies, SIDEBAR_WIDTH_COOKIE))
  const c = readCookie(cookies, SIDEBAR_COLLAPSED_COOKIE)
  let collapsed = startsAsRail(windowWidth)
  if (c === "true" || c === "false") collapsed = c === "true"
  return { width: clampSidebarWidth(Number.isFinite(w) && w > 0 ? w : SIDEBAR_DEFAULT_PX), collapsed }
}
