import { cn } from "@/lib/utils/helpers/cn"

/**
 * The label of a button in a message's actions toolbar, from the button's
 * `data-tip`, where a Radix tooltip used to be.
 *
 * The toolbar is built each time a message is hovered or focused (it no longer
 * sits hidden under every row), and its tooltips were four fifths of what
 * building it cost: each one a provider, a popper, an anchor, a portal and a
 * presence, about 40 components, mounted for a label most hovers never wait
 * for. The page's one chip draws the label (components/ui/tipLayer.tsx: the
 * tooltips' ink, size and radius) after the app's 200 ms tooltip delay, or at
 * once on keyboard focus, under the button. These are the markers it reads.
 * It was the button's CSS ::after, which the conversation's scroller cut
 * (the composer's first tool, 18 Oct 2026). The button's accessible name
 * stays its aria-label; the label is only for sight.
 */
export const ACTION_TIP = "relative"

/** The same, held to the button's right edge, for the toolbar's last button. */
export const ACTION_TIP_END = cn(ACTION_TIP, "tip-end")

/**
 * The same label above its button, for a row at the foot of the screen (the
 * composer's tools), and hidden while the button's own menu is open. Those
 * tools wore the browser's title tooltip: an OS box a second late, unlike
 * every other label in a conversation.
 */
export const ACTION_TIP_ABOVE = cn(ACTION_TIP, "tip-above")

/** Above and held to the button's right edge: the composer's last control. */
export const ACTION_TIP_ABOVE_END = cn(ACTION_TIP_ABOVE, "tip-end")

/**
 * A message's full date and time, drawn the same way under its clock (SD-11):
 * after the tooltip delay under the pointer, and at once while the row's own
 * keyboard stop has the focus: its author's name (a `group/name` name line)
 * or, on a continued row, its gutter (`group/gutter`). It was the browser's
 * title: an OS box a second late, and never on focus.
 */
export const TIME_TIP = cn(ACTION_TIP, "tip-time")
