"use client";

import { format, isSameDay, isToday, isTomorrow, parseISO } from "date-fns";
import { Calendar as CalendarIcon, ChevronRight, Plus } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { calendarColors } from "@/lib/colors";
import { cn } from "@/lib/utils/helpers/cn";

// The phone calendar: the days that have something on them, one row per event
// or task, each a full-width tap target. See agendaDays for which days.

export interface AgendaItem {
  event_uuid: string;
  event_title: string;
  event_start_time: string;
  event_end_time: string;
  isTask?: boolean;
}

function dayLabel(day: Date): string {
  if (isToday(day)) return "Today";
  if (isTomorrow(day)) return "Tomorrow";
  return format(day, "EEEE, d MMM");
}

function itemDetail(item: AgendaItem, day: Date): string {
  const start = parseISO(item.event_start_time);
  const end = parseISO(item.event_end_time);
  // A task sits under its due day, so the heading already says when.
  if (item.isTask) return isSameDay(end, day) ? "Task due" : `Task · due ${format(end, "d MMM")}`;
  if (!isSameDay(start, day)) return "Continues";
  return `${format(start, "h:mm a")} – ${format(end, "h:mm a")}`;
}

export function CalendarAgenda({
  days,
  onOpen,
  onCreate,
}: {
  days: { day: Date; items: AgendaItem[] }[];
  onOpen: (item: AgendaItem) => void;
  onCreate: () => void;
}) {
  if (days.length === 0) {
    return (
      <EmptyState
        icon={CalendarIcon}
        tone="accent"
        title="Nothing coming up this month"
        description="Events you create and tasks with dates show up here."
        action={
          <Button size="sm" onClick={onCreate} className="gap-1.5">
            <Plus className="h-4 w-4" />
            New event
          </Button>
        }
        className="min-h-[50vh]"
      />
    );
  }

  return (
    <div className="pb-24">
      {days.map(({ day, items }) => (
        <section key={day.toISOString()} aria-label={dayLabel(day)}>
          <h2
            className={cn(
              "sticky top-0 z-10 bg-background/95 px-4 pb-1.5 pt-4 text-xs font-semibold uppercase tracking-wide backdrop-blur",
              isToday(day) ? "text-primary" : "text-muted-foreground",
            )}
          >
            {dayLabel(day)}
          </h2>
          <ul className="divide-y divide-border/60">
            {items.map((item) => (
              <li key={`${item.event_uuid}-${day.toISOString()}`}>
                <button
                  type="button"
                  onClick={() => onOpen(item)}
                  className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors active:bg-accent/60"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "h-9 w-1 shrink-0 rounded-full",
                      item.isTask ? calendarColors.task.solid : calendarColors.event.solid,
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{item.event_title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{itemDetail(item, day)}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
