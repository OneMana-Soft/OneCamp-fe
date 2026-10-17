"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { parseEventText } from "@/lib/calendar/parseEventText";
import { parseDay } from "@/lib/calendar/route";
import { fieldKeyDown } from "@/lib/keys/ime";

/** The day typed into Go to: 2026-11-05 as the address writes it, or in words (quick create's day rules). Pure. */
export function typedDay(text: string, now: Date): Date | undefined {
    const t = text.trim();
    if (!t) return undefined;
    return parseDay(t) ?? parseEventText(t, now).date;
}

/**
 * Go to (G, as in Google Calendar; VD-28): a field by the period's title that
 * reads a day ("next friday", "15 Nov", "tomorrow"), says which day it read,
 * and shows the calendar there on Enter. Escape or a click away closes it.
 */
export function GoToDate({ anchor, now, onGo, onClose }: { anchor: HTMLElement; now: Date; onGo: (day: Date) => void; onClose: () => void }) {
    const [text, setText] = useState("");
    const day = useMemo(() => typedDay(text, now), [text, now]);
    return (
        <Popover open onOpenChange={(open) => !open && onClose()}>
            <PopoverAnchor virtualRef={{ current: anchor }} />
            <PopoverContent align="start" sideOffset={6} className="content-float w-[280px] rounded-xl bg-pop p-2 shadow-e3" data-go-to="">
                <input
                    autoFocus
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={fieldKeyDown((e) => {
                        if (e.key !== "Enter" || !day) return;
                        e.preventDefault();
                        onGo(day);
                    })}
                    aria-label="Go to a date"
                    aria-describedby="go-to-reads"
                    placeholder="next Friday, 15 Nov"
                    className="h-8 w-full rounded-md bg-raised px-2.5 text-ui text-ink shadow-e1 outline-none placeholder:text-ink-3 focus-visible:ring-1 focus-visible:ring-brand/50"
                />
                <p id="go-to-reads" aria-live="polite" className="px-1 pb-0.5 pt-1.5 text-meta text-ink-3">
                    {day ? format(day, "EEEE d MMMM yyyy") : text.trim() ? "Try a day like next Friday or 15 Nov" : "Type a day, like next Friday or 15 Nov"}
                </p>
            </PopoverContent>
        </Popover>
    );
}
