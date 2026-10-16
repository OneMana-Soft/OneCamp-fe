import { cn } from "@/lib/utils/helpers/cn"

/**
 * The label of a button in a message's actions toolbar, drawn by CSS from the
 * button's `data-tip`, where a Radix tooltip used to be.
 *
 * The toolbar is built each time a message is hovered or focused (it no longer
 * sits hidden under every row), and its tooltips were four fifths of what
 * building it cost: each one a provider, a popper, an anchor, a portal and a
 * presence, about 40 components, mounted for a label most hovers never wait
 * for. This draws the same label (TooltipContent's ink, size and radius) after
 * the app's 200 ms tooltip delay, or at once on keyboard focus. It sits under
 * the button, so the list's top edge never clips it. The button's accessible
 * name stays its aria-label; the tip is only for sight.
 */
export const ACTION_TIP = cn(
    "relative",
    "after:pointer-events-none after:absolute after:left-1/2 after:top-full after:z-10 after:mt-1.5 after:-translate-x-1/2",
    "after:whitespace-nowrap after:rounded-md after:bg-foreground after:px-2 after:py-1",
    "after:text-xs after:font-medium after:leading-4 after:text-background after:content-[attr(data-tip)]",
    "after:opacity-0 after:transition-opacity after:duration-150 after:ease-standard",
    "hover:after:opacity-100 hover:after:delay-200 focus-visible:after:opacity-100",
)

/** The same, held to the button's right edge, for the toolbar's last button. */
export const ACTION_TIP_END = cn(ACTION_TIP, "after:left-auto after:right-0 after:translate-x-0")

/**
 * The same label above its button, for a row at the foot of the screen (the
 * composer's tools), and hidden while the button's own menu is open. Those
 * tools wore the browser's title tooltip: an OS box a second late, unlike
 * every other label in a conversation.
 */
export const ACTION_TIP_ABOVE = cn(ACTION_TIP, "after:top-auto after:bottom-full after:mt-0 after:mb-1.5 data-[state=open]:after:hidden")

/** Above and held to the button's right edge: the composer's last control. */
export const ACTION_TIP_ABOVE_END = cn(ACTION_TIP_ABOVE, "after:left-auto after:right-0 after:translate-x-0")

/**
 * A message's full date and time, drawn the same way under its clock (SD-11):
 * after the tooltip delay under the pointer, and at once while the row's own
 * keyboard stop has the focus: its author's name (a `group/name` name line)
 * or, on a continued row, its gutter (`group/gutter`). It was the browser's
 * title: an OS box a second late, and never on focus.
 */
export const TIME_TIP = cn(ACTION_TIP, "group-has-[:focus-visible]/name:after:opacity-100 group-focus-visible/gutter:after:opacity-100")
