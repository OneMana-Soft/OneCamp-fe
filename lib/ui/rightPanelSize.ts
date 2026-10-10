/**
 * How narrow the right panel (a task, a thread, comments) may get.
 *
 * The panel group sizes its panels in percent, and the right panel's minimum
 * was 32%. Its content is laid out at least RIGHT_PANEL_MIN_PX wide and pinned
 * to the panel's right edge, so where 32% came to less than that (about 270px
 * on a 1024px screen), the content's left edge ran under the page beside it:
 * "Mark complete" and the field labels ("Assignee", "Start date") were cut off.
 */

/** The narrowest the panel's content is laid out at. */
export const RIGHT_PANEL_MIN_PX = 320

/** The panel's usual share of the group, and the most it may take. */
const MIN_PERCENT = 32
const MAX_PERCENT = 60

/**
 * The right panel's minimum size, in percent of a panel group this many pixels
 * wide: 32%, or what RIGHT_PANEL_MIN_PX takes when that is more, up to 60%.
 * 32% before the group has been measured. Pure.
 */
export function rightPanelMinSize(groupWidth: number): number {
  if (!(groupWidth > 0)) return MIN_PERCENT
  const needed = Math.ceil((RIGHT_PANEL_MIN_PX / groupWidth) * 1000) / 10
  return Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, needed))
}
