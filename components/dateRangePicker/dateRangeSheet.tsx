"use client";

import type { RefObject } from "react";
import type { DateRange } from "react-day-picker";

import { Calendar } from "@/components/ui/calendar";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";

/**
 * The date range field's sheet on a phone (dateRangeField), a chunk of its
 * own, so the shared drawer stays off the first load of the pages that show
 * the field. Its button stays in the field, not in here, so the sheet gives
 * focus back to it as it closes, as its own trigger would.
 */
export function DateRangeSheet({
  open,
  onOpenChange,
  opener,
  dateRange,
  setDateRange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opener: RefObject<HTMLButtonElement | null>;
  dateRange?: DateRange;
  setDateRange: (range: DateRange | undefined) => void;
}) {
  return (
    <Drawer detent="medium" open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          opener.current?.focus();
        }}
      >
        <DrawerTitle className="sr-only">Pick dates</DrawerTitle>
        <div className="mt-4 border-t pt-4 pb-4">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={dateRange?.from}
            selected={dateRange}
            onSelect={setDateRange}
            numberOfMonths={1}
            captionLayout="dropdown-buttons"
            fromYear={1960}
            toYear={2030}
            className="w-full flex justify-center"
            classNames={{
              months:
                "w-full flex flex-col space-y-4 sm:space-x-4 sm:space-y-0",
              month: "space-y-4 w-full",
              table: "w-full border-collapse space-y-1",
              head_row: "flex w-full justify-between",
              row: "flex w-full mt-2 justify-between",
              cell: "text-center flex-1 p-0 relative focus-within:relative [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected].day-range-end)]:rounded-r-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
              day: "h-9 w-full p-0 font-normal aria-selected:opacity-100",
              head_cell:
                "text-muted-foreground rounded-md flex-1 font-normal text-[0.8rem]",
              caption_label: "hidden", // Hide default caption label when using dropdowns if generic shading doesn't handle it
              caption_dropdowns: "flex justify-center gap-1",
            }}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
