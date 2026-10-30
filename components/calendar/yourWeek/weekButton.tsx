"use client";

import { memo, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BarChart3 } from "@/lib/icons";
import { YourWeekPanel } from "@/components/calendar/yourWeek/yourWeekPanel";

/**
 * Your week's button (B3), in the calendar's header and phone bar: a chunk of
 * its own with its panel, so the calendar's first load carries neither. It
 * reads the week on screen when it opens, so moving weeks never draws it.
 * Under 40rem of the computer's header (an event's panel open at 1280) it
 * gives its room to the period's title, "26 Oct–1 Nov" whole, and View
 * options shows Your week instead (V-43b). The phone bar is no calhead.
 */
export const WeekButton = memo(function WeekButton({ week }: { week: RefObject<Date> }) {
    const [open, setOpen] = useState(false);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="Your week" title="Your week" data-tone="neutral" data-week-button="" className="@max-[40rem]/calhead:hidden">
                    <BarChart3 />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="content-float w-[320px] rounded-xl bg-pop p-0 shadow-e3">
                {open ? <YourWeekPanel weekStart={week.current} /> : null}
            </PopoverContent>
        </Popover>
    );
});
