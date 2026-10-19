"use client";

import { useRef, useState } from "react";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HueBlock } from "@/components/calendar/HueBlock";
import type { AllDayItem } from "@/components/calendar/weekView";
import { cn } from "@/lib/utils/helpers/cn";

/** A day's all-day items, in a popover from the "+N" past the rail's three. */
export function RailMore({ day, items, hidden, onPick }: { day: Date; items: AllDayItem[]; hidden: number; onPick: (item: AllDayItem, el: HTMLElement) => void }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={trigger}
          type="button"
          aria-label={`${hidden} more on ${format(day, "EEEE d MMMM")}`}
          className="h-5 self-start rounded-sm px-1.5 text-meta font-medium text-ink-2 hover:bg-hover hover:text-ink"
        >
          +{hidden}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="content-float w-[280px] rounded-xl bg-pop p-1 shadow-e3" data-rail-more="">
        <div className="flex h-9 items-center gap-2 px-2">
          <span className="text-ui-sm font-semibold">{format(day, "EEE d MMM")}</span>
          <span className="ml-auto text-meta tabular-nums text-ink-3">{items.length} all day</span>
        </div>
        <div className="flex max-h-[300px] flex-col gap-0.5 overflow-y-auto">
          {items.map((it) => (
            <HueBlock
              key={it.uuid}
              item={it}
              variant="row"
              aria-label={`${it.isTask ? "Task" : "Event"}: ${it.title}`}
              onClick={(e) => {
                setOpen(false);
                // The row goes with the popover: an event's card opens by the "+N".
                onPick(it, trigger.current ?? e.currentTarget);
              }}
              className="w-full"
            >
              <span className={cn("min-w-0 flex-1 truncate", it.done && "line-through decoration-ink-4")}>{it.title}</span>
            </HueBlock>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
