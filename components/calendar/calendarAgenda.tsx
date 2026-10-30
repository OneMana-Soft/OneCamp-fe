"use client";

import { memo } from "react";
import { differenceInCalendarDays, differenceInMinutes, format, isSameDay, isToday, isTomorrow, parseISO, subMinutes } from "date-fns";
import { EmptyState } from "@/components/ui/empty-state";
import { SpotCalendar } from "@/components/ui/graphics/spots";
import { HUE_CLASS } from "@/components/ui/graphics/hues";
import { Button } from "@/components/ui/button";
import { hueOf, kindOf } from "@/components/calendar/calendarTones";
import { allDayItem, daySpan, daySpanWords } from "@/components/calendar/calendarLayout";
import { allDayLastDay } from "@/lib/calendar/allDay";
import { eventCallOf } from "@/lib/calendar/joinLink";
import { cn } from "@/lib/utils/helpers/cn";
import { clockTime } from "@/lib/utils/date/clock";
import { spanLabel } from "@/lib/calendar/spanLabel";

// The agenda (content.md C17): the days that have something on them, one row
// per event or task. The phone's default view, and a desktop view of its own,
// 720 px and centred. The event happening now, or the next one, is about you,
// so it wears brand-muted with "Now" or "Next · in 20 min".

interface AgendaItem {
  event_uuid: string;
  event_title: string;
  event_start_time: string;
  event_end_time: string;
  event_description?: string;
  isTask?: boolean;
  event_is_focus?: boolean;
  event_is_away?: boolean;
  /** A Google all-day event (lib/calendar/allDay). */
  event_all_day?: boolean;
  task_project?: { project_uuid?: string } | null;
}

function dayLabel(day: Date): string {
  if (isToday(day)) return "Today";
  if (isTomorrow(day)) return "Tomorrow";
  // "Sunday 18 Oct", as the event panel writes a day: no comma.
  return format(day, "EEEE d MMM");
}

function itemDetail(item: AgendaItem, day: Date): string {
  const start = parseISO(item.event_start_time);
  const end = parseISO(item.event_end_time);
  // A task sits under its due day, so the heading already says when.
  if (item.isTask) return isSameDay(end, day) ? "Task due" : `Task, due ${format(end, "d MMM")}`;
  if (item.event_is_away) return isSameDay(start, day) ? `Away until ${format(subMinutes(end, 1), "d MMM")}` : "Away";
  const times = spanLabel(start, end);
  // A focus block is usually called "Focus time": say it once.
  if (item.event_is_focus) return item.event_title.trim().toLowerCase() === "focus time" ? times : `Focus time, ${times}`;
  if (allDayItem(item, start, end)) {
    // Its last day, counted in days: a day the clocks change on isn't 24 hours.
    const last = allDayLastDay(start, end);
    return isSameDay(start, last) ? "All day" : `All day, until ${format(last, "d MMM")}`;
  }
  // A span of a day or more says its days ("Thu 09:30 – Fri 09:30") on each day it is listed.
  return times;
}

/** The event that is on now, or the next one to come. Pure. */
export function nextItemId(days: { day: Date; items: AgendaItem[] }[], now: Date): string | null {
  let best: { id: string; at: number } | null = null;
  for (const { items } of days) {
    for (const it of items) {
      if (it.isTask || it.event_is_away) continue;
      const start = parseISO(it.event_start_time);
      const end = parseISO(it.event_end_time);
      if (allDayItem(it, start, end) || end <= now) continue;
      const at = start.getTime();
      if (!best || at < best.at) best = { id: it.event_uuid, at };
    }
  }
  return best?.id ?? null;
}

/** "Now", "Next · in 20 min", "Next · in 3 h", "Next · Tue". */
function nextLabel(start: Date, end: Date, now: Date): string {
  if (start <= now && now < end) return "Now";
  const mins = differenceInMinutes(start, now);
  if (mins < 90) return `Next · in ${Math.max(1, mins)} min`;
  if (isSameDay(start, now)) return `Next · in ${Math.round(mins / 60)} h`;
  return `Next · ${format(start, "EEE")}`;
}

// Kept while an event's card opens (C3).
export const CalendarAgenda = memo(function CalendarAgenda({
  days,
  onOpen,
  desktop = false,
  now = new Date(),
  onNewEvent,
  emptyTitle = "Nothing coming up this month",
}: {
  days: { day: Date; items: AgendaItem[] }[];
  onOpen: (item: AgendaItem, el: HTMLElement) => void;
  desktop?: boolean;
  now?: Date;
  onNewEvent?: () => void;
  /** What an empty list says: the desktop agenda names its window. */
  emptyTitle?: string;
}) {
  // The same quiet treatment a free week, day or month gets on the grids.
  if (days.length === 0) {
    return (
      <EmptyState
        illustration={<SpotCalendar />}
        title={emptyTitle}
        description="Events you create and tasks with dates show up here."
        action={onNewEvent && desktop ? <Button variant="secondary" size="sm" onClick={onNewEvent}>New event</Button> : undefined}
        className="pt-16"
      />
    );
  }

  const next = nextItemId(days, now);
  let n = 0;

  return (
    <div className={cn("pb-24", desktop && "mx-auto w-full max-w-[720px] px-6 pt-2")} data-agenda={desktop ? "desktop" : "phone"}>
      {days.map(({ day, items }, di) => {
        const gap = di > 0 ? differenceInCalendarDays(day, days[di - 1].day) - 1 : 0;
        const today = isToday(day);
        return (
          <section key={day.toISOString()} aria-label={dayLabel(day)}>
            {gap > 0 ? <p className={cn("pt-3 text-meta text-ink-3", desktop ? "px-1" : "px-4")}>{gap === 1 ? "1 quiet day" : `${gap} quiet days`}</p> : null}
            <h2 className={cn("sticky top-0 z-10 flex h-10 items-center gap-2 bg-sheet text-ui-sm font-semibold", desktop ? "px-1" : "px-4", today ? "text-ink" : "text-ink-2")}>
              {today ? (
                <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-full text-micro font-semibold tabular-nums text-brand-text ring-[1.5px] ring-inset ring-brand">
                  {format(day, "d")}
                </span>
              ) : null}
              {dayLabel(day)}
            </h2>
            <ul className={cn("grid gap-0.5", !desktop && "px-2")}>
              {items.map((item) => {
                const start = parseISO(item.event_start_time);
                const end = parseISO(item.event_end_time);
                const kind = kindOf(item);
                const isNext = item.event_uuid === next && isSameDay(start, day);
                const live = isNext && start <= now && now < end;
                const span = daySpan(item, start, end, day);
                // Its own call (calendar B11), else the link in its notes.
                const call = eventCallOf(item, window.location.origin);
                const link = call?.join ?? null;
                const soon = !!link && differenceInMinutes(start, now) <= 10 && now < end;
                const i = n++;
                return (
                  <li key={`${item.event_uuid}-${day.toISOString()}`} className="content-event-in" style={{ ["--i" as string]: Math.min(i, 8) }}>
                    <button
                      type="button"
                      onClick={(e) => onOpen(item, e.currentTarget)}
                      data-next={isNext || undefined}
                      // Which item it is, for the calendar's keys and its menu (E, Delete, a right-click).
                      data-event-uuid={item.event_uuid}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-2 text-left outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand",
                        desktop ? "min-h-[52px] py-1.5" : "min-h-[56px] py-2",
                        isNext && "bg-brand-muted/75 hover:bg-brand-muted",
                      )}
                    >
                      <span className="flex w-[72px] shrink-0 flex-col text-ui-sm font-[450] leading-4 tabular-nums text-ink-2">
                        {span.kind === "timed" ? (
                          <>
                            <span>{clockTime(start)}</span>
                            <span className="text-meta text-ink-3">{clockTime(end)}</span>
                          </>
                        ) : (
                          <span className="text-meta text-ink-3">{daySpanWords(span)}</span>
                        )}
                      </span>
                      <span
                        aria-hidden="true"
                        className={cn(
                          "h-8 w-[3px] shrink-0 rounded-[2px]",
                          kind === "focus" ? "bg-ink-3" : kind === "away" ? "border-l border-dashed border-line-3" : cn(HUE_CLASS[hueOf(item)], "bg-hue"),
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        {isNext ? <span className="block text-micro font-semibold text-brand-text">{nextLabel(start, end, now)}</span> : null}
                        <span className="block truncate text-ui font-medium text-ink">{item.event_title}</span>
                        <span className="block truncate text-meta text-ink-3">{itemDetail(item, day)}</span>
                      </span>
                      {link && (live || soon) ? (
                        <Button asChild variant="secondary" size="xs" onClick={(e) => e.stopPropagation()}>
                          <a href={link} {...(call?.own ? {} : { target: "_blank", rel: "noopener noreferrer" })}>
                            Join
                          </a>
                        </Button>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
});
