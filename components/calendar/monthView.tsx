"use client";

import { useEffect, useRef, useState } from "react";
import { addDays, differenceInCalendarDays, format, isSameDay, isSameMonth, isWeekend, parseISO } from "date-fns";
import { Plus } from "@/lib/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SpotCalendar } from "@/components/ui/graphics";
import { shortTime } from "@/lib/utils/date/shortDate";
import { cn } from "@/lib/utils/helpers/cn";
import { HueBlock } from "@/components/calendar/HueBlock";
import { hueOf, kindOf } from "@/components/calendar/calendarTones";
import { HUE_CLASS } from "@/components/ui/graphics/hues";
import { dayKey, type DatedItem, type WeekBar } from "@/components/calendar/calendarLayout";
import type { CalendarDraft } from "@/components/calendar/weekView";

/**
 * The month (content.md C05, C06): hairlines between days only, weekends on
 * sunken, today's date in a brand ring with a 2 px brand top edge on its cell,
 * and events as hue bars: all-day and multi-day bars full, timed ones quiet
 * with their start time. A cell's hover offers "+" to quick-create; a drag
 * across days drafts a multi-day event; a held bar moves to another day.
 */
export interface MonthItem extends DatedItem {
  event_description?: string;
  task_status?: string;
}

export interface MonthWeek<T extends MonthItem> {
  weekStart: Date;
  days: Date[];
  tracks: WeekBar<T>[][];
}

interface MonthViewProps<T extends MonthItem> {
  month: Date;
  weeks: MonthWeek<T>[];
  byDay: Map<string, T[]>;
  now: Date;
  onItemClick: (item: T, el: HTMLElement) => void;
  onItemOpen?: (item: T) => void;
  onDraft?: (draft: CalendarDraft, anchor: HTMLElement | null) => void;
  /** Move an event by whole days (the existing update call). */
  onMoveDays?: (item: T, days: number) => void;
  canMove?: (item: T) => boolean;
  selectedId?: string | null;
  matches?: (title: string) => boolean;
  blank?: boolean;
  onNewEvent?: () => void;
  /** A phone: events as thin hue lines, "+N" for the rest, no + on each day. */
  compact?: boolean;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type MonthDrag<T> =
  | { kind: "create"; from: Date; to: Date; el: HTMLElement }
  | { kind: "move"; item: T; from: Date; over: Date; active: boolean; pressX: number; pressY: number; el: HTMLElement };

function dayFromPoint(x: number, y: number): Date | null {
  const el = document.elementFromPoint?.(x, y)?.closest<HTMLElement>("[data-month-day]");
  return el ? parseISO(el.dataset.monthDay!) : null;
}

export function MonthView<T extends MonthItem>({
  month,
  weeks,
  byDay,
  now,
  onItemClick,
  onItemOpen,
  onDraft,
  onMoveDays,
  canMove,
  selectedId,
  matches,
  blank,
  onNewEvent,
  compact = false,
}: MonthViewProps<T>) {
  const [drag, setDrag] = useState<MonthDrag<T> | null>(null);
  const dragRef = useRef<MonthDrag<T> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [revealing, setRevealing] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setRevealing(false), 600);
    return () => clearTimeout(t);
  }, []);
  const set = (d: MonthDrag<T> | null) => {
    dragRef.current = d;
    setDrag(d);
  };

  // Pointer handling for the whole grid.
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const day = dayFromPoint(e.clientX, e.clientY);
      if (d.kind === "create") {
        if (day && !isSameDay(day, d.to)) set({ ...d, to: day });
        return;
      }
      const active = d.active || Math.hypot(e.clientX - d.pressX, e.clientY - d.pressY) > 4;
      if (active && (!d.active || (day && !isSameDay(day, d.over)))) set({ ...d, active, over: day ?? d.over });
    };
    const up = () => {
      clearTimeout(timer.current);
      const d = dragRef.current;
      set(null);
      if (!d) return;
      if (d.kind === "create") {
        const [a, b] = d.from <= d.to ? [d.from, d.to] : [d.to, d.from];
        if (isSameDay(a, b)) {
          // A click on a day: a half-hour draft at 9.
          const start = new Date(a.getFullYear(), a.getMonth(), a.getDate(), 9, 0);
          onDraft?.({ start, end: new Date(start.getTime() + 30 * 60_000) }, d.el);
        } else onDraft?.({ start: a, end: addDays(b, 1), allDay: true }, d.el);
        return;
      }
      if (!d.active) {
        onItemClick(d.item, d.el);
        return;
      }
      const delta = differenceInCalendarDays(d.over, d.from);
      if (delta !== 0) onMoveDays?.(d.item, delta);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // Only (re)bind when a drag starts or ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag]);

  const inRange = (day: Date) => {
    if (drag?.kind !== "create" || isSameDay(drag.from, drag.to)) return false;
    const [a, b] = drag.from <= drag.to ? [drag.from, drag.to] : [drag.to, drag.from];
    return day >= a && day <= b;
  };
  const dropOn = (day: Date) => drag?.kind === "move" && drag.active && isSameDay(day, drag.over);

  return (
    <div className="relative flex h-full min-w-0 flex-col @container/month" data-month-grid="">
      {blank && (
        // The same quiet note a free week and a free day get, in the middle of
        // the grid; the days under it still take a click.
        <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-2" data-calendar-blank="">
          <SpotCalendar size={72} />
          <p className="pointer-events-auto flex h-8 items-center gap-1 rounded-[16px] bg-pop px-3 text-ui-sm text-ink-2 shadow-e1">
            Nothing this month
            {onNewEvent ? (
              <>
                <span aria-hidden="true">·</span>
                <button type="button" onClick={onNewEvent} className="font-medium text-brand-text hover:underline">
                  New event
                </button>
              </>
            ) : null}
          </p>
        </div>
      )}
      {/* Weekday header: 32 px, sticky, left-aligned. */}
      <div className="sticky top-0 z-20 grid grid-cols-7 border-b border-line bg-sheet" aria-hidden="true">
        {WEEKDAYS.map((d, i) => (
          <div key={d} className={cn("flex h-8 items-center px-2.5 text-meta font-medium text-ink-3", i >= 5 && "bg-sunken")}>
            {d}
          </div>
        ))}
      </div>

      <div className="flex flex-1 flex-col">
        {weeks.map(({ weekStart, days, tracks }, wi) => (
          <div key={weekStart.toISOString()} className={cn("relative flex min-h-28 flex-1 flex-col", wi < weeks.length - 1 && "border-b border-line")}>
            {/* The cells: date, hover "+", "+N more"; the pointer target for drafts. */}
            <div className="absolute inset-0 grid grid-cols-7">
              {days.map((day, i) => {
                const items = byDay.get(dayKey(day)) || [];
                const isToday = isSameDay(day, now);
                const outside = !isSameMonth(day, month);
                const first = day.getDate() === 1;
                const hidden = items.length - Math.min(items.length, tracks.reduce((n, t) => n + (t.some((b) => i >= b.col && i < b.col + b.span) ? 1 : 0), 0));
                return (
                  <div
                    key={i}
                    data-month-day={day.toISOString()}
                    data-today={isToday || undefined}
                    data-weekend={isWeekend(day) || undefined}
                    data-outside={outside || undefined}
                    onPointerDown={(e) => {
                      if (e.button !== 0 || !onDraft) return;
                      if ((e.target as HTMLElement).closest("button")) return;
                      set({ kind: "create", from: day, to: day, el: e.currentTarget });
                    }}
                    className={cn(
                      "group/cell relative flex h-full flex-col transition-colors",
                      i < 6 && "border-r border-line",
                      isWeekend(day) && "bg-sunken",
                      onDraft && "cursor-pointer hover:bg-hover",
                      isToday && "before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-brand before:content-['']",
                      inRange(day) && "bg-brand/8",
                      dropOn(day) && "bg-brand/6 ring-1 ring-inset ring-brand",
                    )}
                  >
                    <div className="flex h-8 items-start px-2 pt-2">
                      <span
                        aria-current={isToday ? "date" : undefined}
                        className={cn(
                          "flex h-6 min-w-6 items-center justify-center text-ui-sm font-medium tabular-nums",
                          isToday ? "rounded-full font-semibold text-brand-text ring-[1.5px] ring-inset ring-brand" : outside ? "text-ink-4" : "text-ink-2",
                          first && !isToday && "font-semibold",
                          !isToday && "justify-start",
                        )}
                      >
                        {first && !isToday ? format(day, "d MMM") : format(day, "d")}
                      </span>
                    </div>
                    {onDraft && !compact ? (
                      <button
                        type="button"
                        aria-label={`New event on ${format(day, "EEEE d MMMM")}`}
                        onClick={(e) => {
                          const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0);
                          onDraft({ start, end: new Date(start.getTime() + 30 * 60_000) }, e.currentTarget.parentElement);
                        }}
                        className="absolute right-1.5 top-1.5 z-20 flex size-5 items-center justify-center rounded-sm text-ink-3 opacity-0 transition-opacity hover:bg-press hover:text-ink focus-visible:opacity-100 group-hover/cell:opacity-100 [@media(hover:none)]:opacity-100"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    ) : null}
                    {hidden > 0 ? (
                      <MorePopover
                        day={day}
                        items={items}
                        hidden={hidden}
                        compact={compact}
                        isToday={isToday}
                        onItemClick={onItemClick}
                        onNew={onDraft ? (el) => {
                          const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0);
                          onDraft({ start, end: new Date(start.getTime() + 30 * 60_000) }, el);
                        } : undefined}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>

            {/* Event bars, 22 px with 2 px between; on a phone, 4 px lines. */}
            {compact ? (
              <div className="pointer-events-none relative z-10 mt-9 flex flex-col gap-[3px] pb-6" data-month-lines="">
                {tracks.map((trackBars, trackIdx) => (
                  <div key={trackIdx} className="relative h-1 w-full">
                    {trackBars.map((bar) => {
                      const kind = kindOf(bar.item);
                      return (
                        <span
                          key={bar.item.event_uuid}
                          data-event-uuid={bar.item.event_uuid}
                          className={cn(
                            "absolute top-0 h-1 rounded-[2px]",
                            kind === "focus" ? "bg-ink-3" : kind === "away" ? "border border-dashed border-line-3" : cn(HUE_CLASS[hueOf(bar.item)], "bg-hue"),
                            parseISO(bar.item.event_end_time) < now && "opacity-55",
                          )}
                          style={{
                            left: `calc(${(bar.col / 7) * 100}% + ${bar.startsHere ? 4 : 0}px)`,
                            width: `calc(${(bar.span / 7) * 100}% - ${(bar.startsHere ? 4 : 0) + (bar.endsHere ? 4 : 0)}px)`,
                          }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
            <div className="pointer-events-none relative z-10 mt-8 flex flex-col gap-0.5 pb-7">
              {tracks.map((trackBars, trackIdx) => (
                <div key={trackIdx} className="relative h-[22px] w-full">
                  {trackBars.map((bar, bi) => {
                    const item = bar.item;
                    const timed = bar.timed && kindOf(item) === "event";
                    const outside = !isSameMonth(addDays(weekStart, bar.col), month);
                    const end = parseISO(item.event_end_time);
                    const past = end < now;
                    const isTask = kindOf(item) === "task";
                    const movable = !!onMoveDays && !isTask && (canMove ? canMove(item) : true);
                    return (
                      <HueBlock
                        key={item.event_uuid}
                        item={item}
                        variant="bar"
                        quiet={timed}
                        past={past}
                        selected={selectedId === item.event_uuid}
                        continued={!bar.startsHere}
                        data-event-uuid={item.event_uuid}
                        aria-label={`${isTask ? "Task" : "Event"}: ${item.event_title}`}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          if (e.button !== 0 || !movable) return;
                          const from = addDays(weekStart, bar.col);
                          const el = e.currentTarget as HTMLElement;
                          set({ kind: "move", item, from, over: from, active: false, pressX: e.clientX, pressY: e.clientY, el });
                          clearTimeout(timer.current);
                          timer.current = setTimeout(() => {
                            const cur = dragRef.current;
                            if (cur?.kind === "move" && !cur.active) set({ ...cur, active: true });
                          }, 150);
                        }}
                        onClick={(e) => {
                          if (e.detail === 0 || !movable) onItemClick(item, e.currentTarget as HTMLElement);
                        }}
                        onDoubleClick={() => onItemOpen?.(item)}
                        onMouseEnter={(e) => light(e.currentTarget, item.event_uuid, true)}
                        onMouseLeave={(e) => light(e.currentTarget, item.event_uuid, false)}
                        style={{
                          left: `calc(${(bar.col / 7) * 100}% + ${bar.startsHere ? 4 : 0}px)`,
                          width: `calc(${(bar.span / 7) * 100}% - ${(bar.startsHere ? 4 : 0) + (bar.endsHere ? 4 : 0)}px)`,
                          ["--i" as string]: trackIdx * 3 + bi,
                        }}
                        className={cn(
                          "pointer-events-auto absolute top-0 data-[lit]:ring-1 data-[lit]:ring-inset data-[lit]:ring-hue/40 data-[lit]:[--fill:80%]",
                          !bar.startsHere && "rounded-l-none",
                          !bar.endsHere && "rounded-r-none",
                          outside && "opacity-55",
                          revealing && "content-event-in",
                          movable && "cursor-grab",
                          drag?.kind === "move" && drag.active && drag.item.event_uuid === item.event_uuid && "opacity-40",
                          matches && !matches(item.event_title) && "opacity-25",
                        )}
                      >
                        <span className={cn("truncate leading-none", isTask && item.task_status === "done" && "line-through decoration-ink-4")}>
                          {timed ? (
                            <span className="mr-1 hidden text-micro font-[450] tabular-nums opacity-70 @[40rem]/month:inline">{compactTime(parseISO(item.event_start_time))}</span>
                          ) : null}
                          {item.event_title}
                        </span>
                      </HueBlock>
                    );
                  })}
                </div>
              ))}
            </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** "9:30", "14:00": the month bar's time, as the mock writes it. */
function compactTime(d: Date): string {
  return shortTime(d).replace(/\s?[AP]M$/i, "");
}

/** Lights every segment of one item (a meeting across two weeks is two bars). */
function light(from: HTMLElement, uuid: string, on: boolean) {
  from.closest("[data-month-grid]")?.querySelectorAll<HTMLElement>(`[data-event-uuid="${CSS.escape(uuid)}"]`).forEach((el) => {
    if (on) el.setAttribute("data-lit", "");
    else el.removeAttribute("data-lit");
  });
}

function MorePopover<T extends MonthItem>({
  day,
  items,
  hidden,
  compact,
  isToday,
  onItemClick,
  onNew,
}: {
  day: Date;
  items: T[];
  hidden: number;
  compact?: boolean;
  isToday: boolean;
  onItemClick: (item: T, el: HTMLElement) => void;
  onNew?: (el: HTMLElement | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const cellRef = useRef<HTMLButtonElement>(null);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={cellRef}
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute bottom-1 left-1 z-20 h-5 rounded-sm px-1.5 text-meta font-medium text-ink-2 hover:bg-press hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {compact ? `+${hidden}` : `+${hidden} more`}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="content-float w-[280px] rounded-xl bg-pop p-1 shadow-e3">
        <div className="flex h-9 items-center gap-2 px-2">
          <span className={cn("text-ui-sm font-semibold", isToday && "text-brand-text")}>{format(day, "EEE d MMM")}</span>
          <span className="ml-auto text-meta tabular-nums text-ink-3">{items.length} items</span>
        </div>
        <div className="flex max-h-[300px] flex-col gap-0.5 overflow-y-auto">
          {items.map((item) => (
            <HueBlock
              key={item.event_uuid}
              item={item}
              variant="row"
              onClick={(e) => {
                setOpen(false);
                onItemClick(item, (cellRef.current ?? e.currentTarget) as HTMLElement);
              }}
              className="w-full"
            >
              <span className="min-w-0 flex-1 truncate">{item.event_title}</span>
              {!item.isTask ? <span className="shrink-0 text-meta font-[450] tabular-nums opacity-75">{shortTime(parseISO(item.event_start_time))}</span> : null}
            </HueBlock>
          ))}
        </div>
        {onNew ? (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onNew(cellRef.current?.parentElement ?? null);
            }}
            className="mt-1 flex h-8 w-full items-center gap-2 rounded-lg px-2 text-ui-sm font-medium text-ink-2 hover:bg-hover hover:text-ink"
          >
            <Plus className="size-4" /> New event
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
