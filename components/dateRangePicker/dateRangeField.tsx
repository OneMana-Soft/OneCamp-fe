import { Calendar as CalendarIcon } from "@/lib/icons";
import { cn } from "@/lib/utils/helpers/cn";
import { Button } from "@/components/ui/button";
import { useRef, useState } from "react";

import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { lazyView } from "@/lib/lazy/lazyView";
import { DateRange } from "react-day-picker";
import { useMedia } from "@/context/MediaQueryContext";
import { useSheetMode } from "@/components/ui/overlayMode";
import { shortDate } from "@/lib/utils/date/shortDate";

// On a phone, the sheet: a chunk of its own, so the shared drawer isn't on the
// first load of every page showing the field (the recordings lists). A press
// on the button fetches it; a fetch that failed is asked for again.
const sheetChunk = lazyView(() => import("@/components/dateRangePicker/dateRangeSheet"));

/**
 * A range as the app writes days: "10 Sep to 10 Oct", with the year only when
 * it isn't this one. It was "Sep 10, 2026 - Oct 10, 2026", the US order with
 * the year twice, in a 260px box 48px tall.
 */
export function dateRangeLabel(range: DateRange | undefined, now: Date = new Date()): string {
  if (!range?.from) return "Pick dates";
  if (!range.to) return shortDate(range.from, now);
  return `${shortDate(range.from, now)} to ${shortDate(range.to, now)}`;
}

interface DateRangeFieldProps {
  dateRange?: DateRange;
  setDateRange?: (range: DateRange | undefined) => void;
  className?: string;
}

export const DateRangeField: React.FC<
  DateRangeFieldProps
> = ({ dateRange, setDateRange, className }) => {
  const { isMobile } = useMedia();
  // A sheet on a phone, held either way (components/ui/overlayMode); the
  // layout's width sizes the button.
  const sheet = useSheetMode();
  const [open, setOpen] = useState(false);
  // Drawn from its first opening, and kept, so it slides away as it closes.
  const [drawn, setDrawn] = useState(false);
  if (open && !drawn) setDrawn(true);
  const opener = useRef<HTMLButtonElement>(null);
  // On a phone the button opens the sheet itself, so it says what it opens as a trigger would.
  const opens = sheet && {
    "aria-haspopup": "dialog" as const,
    "aria-expanded": open,
    "data-state": open ? "open" : "closed",
    onPointerDown: sheetChunk.prefetch,
    onFocus: sheetChunk.prefetch,
    onClick: () => setOpen(true),
  };
  const trigger = (
    <Button
      ref={opener}
      variant={"outline"}
      className={cn(
        // A finger's 44px across a phone; a header control's height (h-9),
        // as wide as its words, elsewhere.
        "justify-start text-left font-normal px-3",
        isMobile ? "w-full h-11" : "w-auto h-9",
        !dateRange && "text-muted-foreground"
      )}
      {...opens}
    >
      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
      {dateRangeLabel(dateRange)}
    </Button>
  );

  return (
    <div className={cn("flex flex-col gap-2 md:flex-row md:items-center md:gap-0 md:space-x-2", className)}>

      {setDateRange &&
        (sheet ? (
          <>
            {trigger}
            {drawn ? (
              <sheetChunk.View
                fallback={null}
                render={({ DateRangeSheet }) => (
                  <DateRangeSheet open={open} onOpenChange={setOpen} opener={opener} dateRange={dateRange} setDateRange={setDateRange} />
                )}
              />
            ) : null}
          </>
        ) : (
          <Popover>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={dateRange?.from}
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={2}
                captionLayout="dropdown-buttons"
                fromYear={1960}
                toYear={2030}
                classNames={{
                  caption_dropdowns: "flex justify-center gap-1",

                  caption_label: "hidden", // Hide default caption label when using dropdowns if generic shading doesn't handle it
                }}
              />
            </PopoverContent>
          </Popover>
        ))}
    </div>
  );
};
