/**
 * Which shell a screen gets (design v3, mobile T1): the width says how much
 * room there is, and the pointer says how big a target must be.
 *
 *   phone           under 640                         the phone shell
 *   tablet compact  640 to 1023, a coarse pointer     the 72px rail, one column, lists as an overlay
 *   tablet wide     1024 to 1279, a coarse pointer    the 72px rail, the list beside the page
 *   desktop         1280 up, or any width with a fine pointer   the sidebar (the 56px rail under 1024)
 *
 * A tablet rendered the desktop shell: a 56px rail of 36x32 icons at 768 and
 * the 248px sidebar of 30px rows at 1024, all under the 44px floor, with hover
 * toolbars a finger can't reach. A window that narrow with a mouse is still a
 * desktop: the pointer decides, not the width alone.
 */

export type ShellBand = "phone" | "tablet-compact" | "tablet-wide" | "desktop"

/** The band for a width and a pointer. Pure. */
export function shellBand(width: number, coarse: boolean): ShellBand {
  if (width < 640) return "phone"
  if (coarse && width < 1024) return "tablet-compact"
  if (coarse && width < 1280) return "tablet-wide"
  return "desktop"
}

/** Whether a band is one of the two tablet shells. Pure. */
export const isTabletBand = (band: ShellBand): band is "tablet-compact" | "tablet-wide" =>
  band === "tablet-compact" || band === "tablet-wide"

/** The media queries the band follows. */
export const COARSE_QUERY = "(pointer: coarse)"

/**
 * From this window width the right panel (a thread, a task, OneCamp AI) opens
 * beside the page; below it, over the page as a sheet, as Slack does in a
 * narrow window (chat critic). Beside it, a thread at 1024 left the
 * conversation about 360px wide, and at 768 about 165.
 */
export const PANEL_BESIDE_FROM_PX = 1100

/** Where the right panel opens: beside the page, or over it. A tablet's is always over it. Pure. */
export function rightPanelPlacement(width: number, band: ShellBand): "beside" | "over" {
  if (isTabletBand(band)) return "over"
  return width < PANEL_BESIDE_FROM_PX ? "over" : "beside"
}
