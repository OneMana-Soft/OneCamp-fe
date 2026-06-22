"use client";

import { useEffect, useMemo, useRef } from "react";
import { addDays, format, isSameDay, parseISO, startOfDay } from "date-fns";
import { cn } from "@/lib/utils/helpers/cn";
import { calendarColors } from "@/lib/colors";
import type { CalendarEventInterface } from "@/types/calendar";
import type { TaskInfoInterface } from "@/types/task";

const HOUR_HEIGHT = 48; // px per hour
const DAY_MINUTES = 24 * 60;

interface TimedItem {
  uuid: string;
  title: string;
  isTask: boolean;
  start: Date;
  end: Date;
  topMin: number; // minutes from midnight (clamped to day)
  endMin: number;
  col: number;
  cols: number;
}

interface AllDayItem {
  uuid: string;
  title: string;
  isTask: boolean;
}

export interface WeekViewProps {
  weekStart: Date;
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

export function WeekView({
  weekStart,
  events,
  tasks,
  showEvents,
  showTasks,
  onSlotClick,
  onEventClick,
  onTaskClick,
}: WeekViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfDay(weekStart), i)), [weekStart]);
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  // Scroll to ~7am on mount / week change so the morning is visible.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_HEIGHT;
  }, [weekStart]);

  const { timedByDay, allDayByDay } = useMemo(() => {
    const timed: TimedItem[][] = days.map(() => []);
    const allDay: AllDayItem[][] = days.map(() => []);

    const pushTimedOrAllDay = (
      uuid: string,
      title: string,
      isTask: boolean,
      start: Date,
      end: Date,
    ) => {
      days.forEach((day, di) => {
        const dayStart = startOfDay(day);
        const dayEnd = addDays(dayStart, 1);
        if (end <= dayStart || start >= dayEnd) return;

        const durationMs = end.getTime() - start.getTime();
        const spansFullDay = start <= dayStart && end >= dayEnd;
        const isMultiDay = !isSameDay(start, end) && durationMs >= DAY_MINUTES * 60 * 1000;

        if (spansFullDay || isMultiDay) {
          allDay[di].push({ uuid, title, isTask });
          return;
        }

        const clampedStart = start < dayStart ? dayStart : start;
        const clampedEnd = end > dayEnd ? dayEnd : end;
        const topMin = (clampedStart.getTime() - dayStart.getTime()) / 60000;
        const endMin = (clampedEnd.getTime() - dayStart.getTime()) / 60000;
        timed[di].push({
          uuid,
          title,
          isTask,
          start,
          end,
          topMin,
          endMin: Math.max(endMin, topMin + 20),
          col: 0,
          cols: 1,
        });
      });
    };

    if (showEvents) {
      events.forEach((e) => {
        const start = parseISO(e.event_start_time);
        const end = parseISO(e.event_end_time);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
        pushTimedOrAllDay(e.event_uuid, e.event_title, false, start, end);
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
              allDay[di].push({ uuid: t.task_uuid, title: t.task_name, isTask: true });
            }
          }
        });
      });
    }

    return { timedByDay: timed.map(packDay), allDayByDay: allDay };
  }, [days, events, tasks, showEvents, showTasks]);

  const now = new Date();
  const todayIndex = days.findIndex((d) => isSameDay(d, now));
  const nowTopMin = now.getHours() * 60 + now.getMinutes();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Day headers */}
      <div className="flex border-b border-border/60 bg-background sticky top-0 z-20">
        <div className="w-14 shrink-0 border-r border-border/60" />
        {days.map((day, i) => {
          const isToday = isSameDay(day, now);
          return (
            <div key={i} className="flex-1 min-w-[90px] border-r border-border/60 py-2 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {format(day, "EEE")}
              </div>
              <div
                className={cn(
                  "mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                  isToday ? "bg-primary text-primary-foreground" : "text-foreground",
                )}
              >
                {format(day, "d")}
              </div>
            </div>
          );
        })}
      </div>

      {/* All-day rail */}
      <div className="flex border-b border-border/60 bg-muted/20">
        <div className="flex w-14 shrink-0 items-center justify-center border-r border-border/60 py-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
          All day
        </div>
        {allDayByDay.map((items, i) => (
          <div key={i} className="flex-1 min-w-[90px] space-y-0.5 border-r border-border/60 p-1">
            {items.map((it) => (
              <button
                key={`${it.uuid}-${i}`}
                onClick={() => (it.isTask ? onTaskClick(it.uuid) : onEventClick(it.uuid))}
                className={cn(
                  "block w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium text-white",
                  it.isTask ? calendarColors.task.solidOpacity : calendarColors.event.solidOpacity,
                )}
              >
                {it.title}
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
                  <span className="absolute -top-2 right-1.5 text-[10px] tabular-nums text-muted-foreground">
                    {format(new Date(2000, 0, 1, h), "h a")}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, di) => (
            <div key={di} className="relative flex-1 min-w-[90px] border-r border-border/60">
              {/* Hour cells (click to create) */}
              {hours.map((h) => (
                <div
                  key={h}
                  className="border-b border-border/40 hover:bg-accent/30 cursor-pointer"
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
                >
                  <div className="relative h-px bg-rose-500">
                    <span className="absolute -left-1 -top-[3px] h-1.5 w-1.5 rounded-full bg-rose-500" />
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
                    onClick={() => (it.isTask ? onTaskClick(it.uuid) : onEventClick(it.uuid))}
                    style={{
                      top: `${top}px`,
                      height: `${Math.max(height - 2, 16)}px`,
                      left: `calc(${it.col * widthPct}% + 2px)`,
                      width: `calc(${widthPct}% - 4px)`,
                    }}
                    className={cn(
                      "absolute z-10 overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[10px] font-medium leading-tight text-white shadow-sm",
                      it.isTask ? calendarColors.task.solidOpacity : calendarColors.event.solidOpacity,
                    )}
                  >
                    <span className="block truncate font-semibold">{it.title}</span>
                    <span className="block truncate opacity-90">{format(it.start, "h:mm a")}</span>
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
