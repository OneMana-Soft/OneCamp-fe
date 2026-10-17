"use client";

import { Fragment, type ElementType } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** Something to do with an event, as a menu row: the calendar's event menu, and the event page's More actions. */
export interface EventMenuItem {
    label: string;
    /** Drawn before the label (the event page's menu shows each action's icon). */
    icon?: ElementType;
    /** It deletes or leaves: set apart by a line, in the danger tone. */
    destructive?: boolean;
    onSelect: () => void;
}

/** A menu's rows in order, a destructive one set apart by a line above it. */
export function EventMenuRows({ items }: { items: readonly EventMenuItem[] }) {
    return (
        <>
            {items.map((item) => (
                <Fragment key={item.label}>
                    {item.destructive ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuItem variant={item.destructive ? "destructive" : "default"} onSelect={item.onSelect}>
                        {item.icon ? <item.icon aria-hidden="true" /> : null}
                        {item.label}
                    </DropdownMenuItem>
                </Fragment>
            ))}
        </>
    );
}

/** Where the menu was asked for: the pointer, and the block it opened on, which takes the focus back. */
export interface EventMenuAt {
    x: number;
    y: number;
    from: HTMLElement;
}

/**
 * An event's menu (VD-20): at the pointer on a right-click, or under the block
 * from the keyboard (the menu key, Shift+F10). The rows are the caller's: Open,
 * Duplicate, Copy link, and Delete for your own events (D-CAL-20's list, which
 * A7 registers for the pop card's ⋯ as well). It is the app's own menu,
 * anchored to a point, so it moves, reads and closes as every menu does.
 */
export function EventMenu({ at, open, items, onClose }: { at: EventMenuAt | null; open: boolean; items: EventMenuItem[]; onClose: () => void }) {
    if (!at) return null;
    return (
        <DropdownMenu open={open} onOpenChange={(o) => !o && onClose()}>
            <DropdownMenuTrigger asChild>
                <span aria-hidden="true" className="pointer-events-none fixed size-px" style={{ left: at.x, top: at.y }} />
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="start"
                className="w-44"
                data-event-menu=""
                onCloseAutoFocus={(e) => {
                    // Back to the event it opened on, not the point it was anchored to.
                    e.preventDefault();
                    at.from.focus({ preventScroll: true });
                }}
            >
                <EventMenuRows items={items} />
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
