/**
 * How wide the desktop sidebar may be, in percent of the window, from pixels.
 *
 * The panel group sizes in percent, and the sidebar was 15 to 18% with a 4%
 * rail. That reads well at 1440 (216 to 259px) and badly on a tablet: at 768
 * it was 123px, every channel, doc and project name truncated to a few
 * letters ("ac…", "Q4 laun…") and the Channels badge clipped by the page, and
 * the collapsed rail was 31px, narrower than its own icons.
 *
 * So the floors are in pixels: expanded, never under SIDEBAR_MIN_PX; the
 * rail, SIDEBAR_RAIL_PX. Where the percentages already give more, they stand,
 * so a desktop is unchanged. Below SIDEBAR_RAIL_BELOW_PX the sidebar starts as
 * the rail, which leaves a tablet in portrait the room for a channel beside a
 * thread; somebody who opens it there keeps it open (the cookie).
 */

export const SIDEBAR_MIN_PX = 200
export const SIDEBAR_RAIL_PX = 56
export const SIDEBAR_RAIL_BELOW_PX = 1024

const MIN_PERCENT = 15
const MAX_PERCENT = 18
const RAIL_PERCENT = 4

export interface SidebarSizes {
  /** The narrowest the expanded sidebar may be, in percent. */
  min: number
  /** The widest, in percent. */
  max: number
  /** The rail, in percent. */
  rail: number
}

/** The sidebar's sizes in a window this many pixels wide. Pure. */
export function sidebarSizes(windowWidth: number): SidebarSizes {
  if (!(windowWidth > 0)) return { min: MIN_PERCENT, max: MAX_PERCENT, rail: RAIL_PERCENT }
  const percent = (px: number) => Math.ceil((px / windowWidth) * 1000) / 10
  const min = Math.min(50, Math.max(MIN_PERCENT, percent(SIDEBAR_MIN_PX)))
  return {
    min,
    max: Math.max(MAX_PERCENT, min),
    rail: Math.max(RAIL_PERCENT, percent(SIDEBAR_RAIL_PX)),
  }
}

/** Whether the sidebar starts as the rail when nobody has chosen. */
export function startsAsRail(windowWidth: number): boolean {
  return windowWidth > 0 && windowWidth < SIDEBAR_RAIL_BELOW_PX
}
