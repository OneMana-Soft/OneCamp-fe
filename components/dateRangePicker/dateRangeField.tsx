import { Calendar as CalendarIcon } from "@/lib/icons";
import { cn } from "@/lib/utils/helpers/cn";
import { Button } from "@/components/ui/button";
import { useState } from "react";

import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
  DrawerTitle,
} from "@/components/ui/drawer";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { useMedia } from "@/context/MediaQueryContext";

interface DateRangeFieldProps {
  dateRange?: DateRange;
  setDateRange?: (range: DateRange | undefined) => void;
  className?: string;
}

export const DateRangeField: React.FC<
  DateRangeFieldProps
> = ({ dateRange, setDateRange, className }) => {
  const { isMobile } = useMedia();
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("flex flex-col gap-2 md:flex-row md:items-center md:gap-0 md:space-x-2", className)}>

      {setDateRange &&
        (isMobile ? (
          <Drawer open={open} onOpenChange={setOpen}>
            <DrawerTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-full md:w-auto min-w-[3rem] justify-start text-left font-normal h-10 md:h-12 px-3",
                  !dateRange && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, "LLL dd, y")} -{" "}
                      {format(dateRange.to, "LLL dd, y")}
                    </>
                  ) : (
                    format(dateRange.from, "LLL dd, y")
                  )
                ) : (
                  <span>Pick a date</span>
                )}
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerTitle className="sr-only">Select Date Range</DrawerTitle>
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
        ) : (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id="date"
                variant={"outline"}
                className={cn(
                  "w-[260px] justify-start text-left font-normal h-10 md:h-12",
                  !dateRange && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, "LLL dd, y")} -{" "}
                      {format(dateRange.to, "LLL dd, y")}
                    </>
                  ) : (
                    format(dateRange.from, "LLL dd, y")
                  )
                ) : (
                  <span>Pick a date</span>
                )}
              </Button>
            </PopoverTrigger>
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
