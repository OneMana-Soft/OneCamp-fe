"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, isSameDay, parseISO, startOfDay } from "date-fns";
import { cn } from "@/lib/utils/helpers/cn";
import { shortTime } from "@/lib/utils/date/shortDate";
import { CircleCheck } from "@/lib/icons";
import { toneOf, type CalendarItemLike } from "@/components/calendar/calendarTones";
import type { CalendarEventInterface } from "@/types/calendar";
import type { TaskInfoInterface } from "@/types/task";

const HOUR_HEIGHT = 48; // px per hour
const DAY_MINUTES = 24 * 60;

interface TimedItem extends CalendarItemLike {
  uuid: string;
  title: string;
  start: Date;
  end: Date;
  topMin: number; // minutes from midnight (clamped to day)
  endMin: number;
  col: number;
  cols: number;
}

interface AllDayItem extends CalendarItemLike {
  uuid: string;
  title: string;
}

interface WeekViewProps {
  weekStart: Date;
  /** 7 for a week, 1 for a day. */
  dayCount?: number;
  events: CalendarEventInterface[];
  tasks: TaskInfoInterface[];
  showEvents: boolean;
  showTasks: boolean;
  onSlotClick: (date: Date) => void;
  onEventClick: (uuid: string) => void;
  onTaskClick: (uuid: string) => void;
}

/** Greedy overlap packing: assign each item a column within its overlap cluster. */
function packDay(items: TimedItem[]): TimedItem[] {
  const sorted = [...items].sort((a, b) => a.topMin - b.topMin || a.endMin - b.endMin);
  const result: TimedItem[] = [];
  let cluster: TimedItem[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    const colEnds: number[] = [];
    for (const it of cluster) {
      let col = 0;
      while (col < colEnds.length && colEnds[col] > it.topMin) col++;
      colEnds[col] = it.endMin;
      it.col = col;
    }
    const cols = colEnds.length;
    for (const it of cluster) {
      it.cols = cols;
      result.push(it);
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const it of sorted) {
    if (cluster.length > 0 && it.topMin >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.endMin);
  }
  flush();
  return result;
}

/** The time now, a minute at a time, so the now line moves while the calendar is open. */
function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function WeekView({
  weekStart,
  dayCount = 7,
  events,
  tasks,
  showEvents,
  showTasks,
  onSlotClick,
  onEventClick,
  onTaskClick,
}: WeekViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const days = useMemo(() => Array.from({ length: dayCount }, (_, i) => addDays(startOfDay(weekStart), i)), [weekStart, dayCount]);
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const now = useMinute();

  // On opening, the working day is in view: an hour before now when today is
  // shown, else from 7am. Moving to another week or day keeps the scroll, as
  // a calendar does; it does not jump back to the morning each time.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const t = new Date();
    const showsToday = days.some((d) => isSameDay(d, t));
    const hour = showsToday ? Math.max(0, Math.min(t.getHours() - 1, 16)) : 7;
    el.scrollTop = hour * HOUR_HEIGHT;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on opening
  }, []);

  const { timedByDay, allDayByDay } = useMemo(() => {
    const timed: TimedItem[][] = days.map(() => []);
    const allDay: AllDayItem[][] = days.map(() => []);

    const pushTimedOrAllDay = (base: AllDayItem, start: Date, end: Date) => {
      days.forEach((day, di) => {
        const dayStart = startOfDay(day);
        const dayEnd = addDays(dayStart, 1);
        if (end <= dayStart || start >= dayEnd) return;

        const durationMs = end.getTime() - start.getTime();
        const spansFullDay = start <= dayStart && end >= dayEnd;
        const isMultiDay = !isSameDay(start, end) && durationMs >= DAY_MINUTES * 60 * 1000;

        if (spansFullDay || isMultiDay) {
          allDay[di].push(base);
          return;
        }

        const clampedStart = start < dayStart ? dayStart : start;
        const clampedEnd = end > dayEnd ? dayEnd : end;
        const topMin = (clampedStart.getTime() - dayStart.getTime()) / 60000;
        const endMin = (clampedEnd.getTime() - dayStart.getTime()) / 60000;
        timed[di].push({ ...base, start, end, topMin, endMin: Math.max(endMin, topMin + 20), col: 0, cols: 1 });
      });
    };

    if (showEvents) {
      events.forEach((e) => {
        const start = parseISO(e.event_start_time);
        const end = parseISO(e.event_end_time);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
        pushTimedOrAllDay({ uuid: e.event_uuid, title: e.event_title, event_uuid: e.event_uuid, event_is_focus: !!e.event_is_focus, event_is_away: !!e.event_is_away }, start, end);
      });
    }

    if (showTasks) {
      tasks.forEach((t) => {
        const startStr = t.task_start_date || t.task_due_date;
        const endStr = t.task_due_date || t.task_start_date;
        if (!startStr || !endStr) return;
        const start = parseISO(startStr);
        const end = parseISO(endStr);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
        // Tasks are date-anchored; surface them in the all-day rail on their due day.
        days.forEach((day, di) => {
          if (isSameDay(day, end) || isSameDay(day, start)) {
            if (!allDay[di].some((x) => x.uuid === t.task_uuid)) {
              allDay[di].push({ uuid: t.task_uuid, title: t.task_name, event_uuid: t.task_uuid, isTask: true, task_project: t.task_project });
            }
          }
        });
      });
    }

    return { timedByDay: timed.map(packDay), allDayByDay: allDay };
  }, [days, events, tasks, showEvents, showTasks]);

  const todayIndex = days.findIndex((d) => isSameDay(d, now));
  const nowTopMin = now.getHours() * 60 + now.getMinutes();
  const single = dayCount === 1;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Day headers */}
      <div className="flex border-b border-border/60 bg-background sticky top-0 z-20">
        <div className="w-14 shrink-0 border-r border-border/60" />
        {days.map((day, i) => {
          const isToday = isSameDay(day, now);
          return (
            <div key={i} className={cn("flex-1 border-r border-border/60 py-2", single ? "px-3 text-left" : "min-w-[90px] text-center")}>
              <div className="text-xs font-medium text-muted-foreground">
                {format(day, single ? "EEEE" : "EEE")}
              </div>
              <div
                className={cn(
                  "mt-1 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                  !single && "mx-auto",
                  isToday ? "bg-primary text-primary-foreground" : "text-foreground",
                )}
                aria-current={isToday ? "date" : undefined}
              >
                {format(day, "d")}
              </div>
            </div>
          );
        })}
      </div>

      {/* All-day rail */}
      <div className="flex border-b border-border/60 bg-muted/20">
        <div className="flex w-14 shrink-0 items-center justify-center border-r border-border/60 py-1 text-2xs font-medium text-muted-foreground">
          All day
        </div>
        {allDayByDay.map((items, i) => (
          <div key={i} className={cn("flex-1 space-y-0.5 border-r border-border/60 p-1", !single && "min-w-[90px]")}>
            {items.map((it) => (
              <button
                key={`${it.uuid}-${i}`}
                type="button"
                onClick={() => (it.isTask ? onTaskClick(it.uuid) : onEventClick(it.uuid))}
                aria-label={`${it.isTask ? "Task" : "Event"}: ${it.title}`}
                className={cn(
                  "flex w-full items-center gap-1 truncate rounded-sm px-1.5 py-0.5 text-left text-2xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                  toneOf(it).block,
                )}
              >
                {it.isTask && <CircleCheck className="h-3 w-3 shrink-0" aria-hidden="true" />}
                <span className="truncate">{it.title}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div ref={scrollRef} className="custom-scrollbar flex-1 overflow-y-auto">
        <div className="flex" style={{ height: `${24 * HOUR_HEIGHT}px` }}>
          {/* Hour gutter */}
          <div className="w-14 shrink-0 border-r border-border/60">
            {hours.map((h) => (
              <div key={h} className="relative" style={{ height: `${HOUR_HEIGHT}px` }}>
                {h > 0 && (
                  <span className="absolute -top-2 right-1.5 text-2xs tabular-nums text-muted-foreground">
                    {format(new Date(2000, 0, 1, h), "h a")}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, di) => (
            <div key={di} className={cn("relative flex-1 border-r border-border/60", !single && "min-w-[90px]")}>
              {/* Hour cells (click to create) */}
              {hours.map((h) => (
                <div
                  key={h}
                  className="border-b border-border/40 hover:bg-highlight/40 cursor-pointer"
                  style={{ height: `${HOUR_HEIGHT}px` }}
                  onClick={() => {
                    const d = new Date(day);
                    d.setHours(h, 0, 0, 0);
                    onSlotClick(d);
                  }}
                />
              ))}

              {/* Now line */}
              {todayIndex === di && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-20"
                  style={{ top: `${(nowTopMin / 60) * HOUR_HEIGHT}px` }}
                  aria-hidden="true"
                >
                  <div className="relative h-px bg-destructive">
                    <span className="absolute -left-1 -top-[3px] h-1.5 w-1.5 rounded-full bg-destructive" />
                  </div>
                </div>
              )}

              {/* Timed events */}
              {timedByDay[di].map((it) => {
                const top = (it.topMin / 60) * HOUR_HEIGHT;
                const height = ((it.endMin - it.topMin) / 60) * HOUR_HEIGHT;
                const widthPct = 100 / it.cols;
                return (
                  <button
                    key={it.uuid}
                    type="button"
                    onClick={() => (it.isTask ? onTaskClick(it.uuid) : onEventClick(it.uuid))}
                    aria-label={`${it.title}, ${shortTime(it.start)}`}
                    style={{
                      top: `${top}px`,
                      height: `${Math.max(height - 2, 16)}px`,
                      left: `calc(${it.col * widthPct}% + 2px)`,
                      width: `calc(${widthPct}% - 4px)`,
                    }}
                    className={cn(
                      "absolute z-10 overflow-hidden rounded-sm px-1.5 py-0.5 text-left text-2xs font-medium leading-tight outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                      toneOf(it).block,
                    )}
                  >
                    <span className="block truncate font-semibold">{it.title}</span>
                    <span className="block truncate tabular-nums opacity-90">{shortTime(it.start)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
