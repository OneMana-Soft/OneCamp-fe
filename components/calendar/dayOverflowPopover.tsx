"use client";

import { useRef, useState, type ReactNode, type RefObject } from "react";
import { format } from "date-fns";
import { Plus } from "@/lib/icons";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils/helpers/cn";

/**
 * A day's "+N more" (content.md C06): what its cell has no room for, listed in
 * full in a 280 px pop under the day's name (brand when it's today), and an
 * optional "+ New …" at its foot. The calendar's month and a table's calendar
 * view draw their busy days with it; each brings its own rows.
 *
 * - `children(done)` draws the rows. `done()` closes the pop and returns the
 *   "+N more" button, still on screen, for whatever opens next to anchor to.
 *   The rows are drawn only while the pop is open: a day can hold hundreds.
 * - `add` is the foot's action, given the day's cell (the button's parent).
 * - A press on the button is its own, never the cell's: a drag across days
 *   starts on the cell.
 * - Only the button is drawn until it is first pressed; the popover, anchored
 *   to it, from then on, for that day alone. A month drew a Radix Popover
 *   with its Popper in every busy cell, about 1,400 of a switch to Month's
 *   2,491 renders (FLUIDITY-LEAD, 20 Oct 2026).
 */
export function DayOverflowPopover({
    day,
    hidden,
    today = false,
    compact = false,
    className,
    add,
    children,
}: {
    day: Date;
    /** How many the cell doesn't show. */
    hidden: number;
    today?: boolean;
    /** "+2" where the cell is narrow, else "+2 more". */
    compact?: boolean;
    /** The button's place in its cell. */
    className?: string;
    add?: { label: string; onAdd: (cell: HTMLElement | null) => void };
    children: (done: () => HTMLElement | null) => ReactNode;
}) {
    const [open, setOpen] = useState(false);
    // Whether it has been opened: the popover is drawn from then on, so it
    // closes with its animation; never before.
    const [used, setUsed] = useState(false);
    const button = useRef<HTMLButtonElement>(null);
    const done = () => {
        setOpen(false);
        return button.current;
    };
    // One tree whether open or not: the button stays the same node, which
    // done() hands on and focus comes back to.
    return (
        <>
            <button
                ref={button}
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                    setUsed(true);
                    setOpen((o) => !o);
                }}
                aria-label={compact ? `${hidden} more` : undefined}
                aria-haspopup="dialog"
                aria-expanded={open}
                data-state={open ? "open" : "closed"}
                data-day-more=""
                data-touch-target=""
                className={cn(
                    "h-5 rounded-sm px-1.5 text-meta font-medium text-ink-2 hover:bg-press hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                    className,
                )}
            >
                {compact ? `+${hidden}` : `+${hidden} more`}
            </button>
            {used ? (
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverAnchor virtualRef={button as RefObject<HTMLButtonElement>} />
                    <PopoverContent
                        align="start"
                        className="content-float w-[280px] rounded-xl bg-pop p-1 shadow-e3"
                        data-day-overflow=""
                        // The button opens and closes it: a press on it isn't one outside.
                        onPointerDownOutside={(e) => {
                            if (button.current?.contains(e.target as Node)) e.preventDefault();
                        }}
                        // Back to the button, which stays on screen.
                        onCloseAutoFocus={(e) => {
                            e.preventDefault();
                            button.current?.focus();
                        }}
                    >
                        <p className={cn("flex h-9 items-center px-2 text-ui-sm font-semibold", today && "text-brand-text")}>{format(day, "EEE d MMM")}</p>
                        <div className="flex max-h-[300px] flex-col gap-0.5 overflow-y-auto">
                            <Drawn draw={() => children(done)} />
                        </div>
                        {add ? (
                            <button
                                type="button"
                                onClick={() => add.onAdd(done()?.parentElement ?? null)}
                                className="mt-1 flex h-8 w-full items-center gap-2 rounded-lg px-2 text-ui-sm font-medium text-ink-2 hover:bg-hover hover:text-ink pointer-coarse:h-11"
                            >
                                <Plus className="size-4" aria-hidden="true" /> {add.label}
                            </button>
                        ) : null}
                    </PopoverContent>
                </Popover>
            ) : null}
        </>
    );
}

/** Calls `draw` when it renders: inside the pop's content, only while the pop is mounted. */
function Drawn({ draw }: { draw: () => ReactNode }) {
    return <>{draw()}</>;
}
