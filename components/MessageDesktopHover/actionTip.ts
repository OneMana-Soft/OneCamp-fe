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
