"use client";

import { Fragment, memo, useEffect, useMemo, useRef, useState } from "react";
import { addDays, differenceInCalendarDays, format, isSameDay, isSameMonth, isWeekend, parseISO } from "date-fns";
import { SpotCalendar } from "@/components/ui/graphics";
import { cn } from "@/lib/utils/helpers/cn";
import { HueBlock, dragPlaceholderClasses, hueBlock, hueBlockClasses } from "@/components/calendar/HueBlock";
import { DayOverflow, dayMoreButton } from "@/components/calendar/dayOverflowPopover";
import { useProjectHues } from "@/lib/projectHue";
import { onDragCancel } from "@/lib/ui/dragCancel";
import { PRESS_LIFT, holdLifted, pressBecomes } from "@/lib/ui/pressLift";
import { hueOf, kindOf } from "@/components/calendar/calendarTones";
import { HUE_CLASS } from "@/components/ui/graphics/hues";
import { dayKey, dayListTime, lastDayOf, layoutWeek, placeItems, type DatedItem, type Placed, type WeekBar } from "@/components/calendar/calendarLayout";
import type { CalendarDraft } from "@/components/calendar/weekView";
import { clockTime } from "@/lib/utils/date/clock";

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
  /** The calendar it is on (A6): the Calendars panel counts each calendar's week by it. */
  event_calendar_id?: string;
  /** Its calendar's colour when that isn't Personal's: Personal counts only its own. */
  calendar_hue?: string;
}

export interface MonthWeek<T extends MonthItem> {
  weekStart: Date;
  days: Date[];
  tracks: WeekBar<T>[][];
}

interface MonthViewProps<T extends MonthItem> {
  /** Days outside it are dimmed; a custom range of weeks has none. */
  month?: Date;
  weeks: MonthWeek<T>[];
  byDay: Map<string, T[]>;
  now: Date;
  onItemClick: (item: T, el: HTMLElement) => void;
  onItemOpen?: (item: T) => void;
  /** A finger held on an event and let go without moving: its menu (D16). Without it, a click. */
  onItemMenu?: (item: T, el: HTMLElement) => void;
  onDraft?: (draft: CalendarDraft, anchor: HTMLElement | null) => void;
  /** Move an event by whole days (the existing update call). */
  onMoveDays?: (item: T, days: number) => void;
  canMove?: (item: T) => boolean;
  matches?: (title: string) => boolean;
  blank?: boolean;
  onNewEvent?: () => void;
  /** A phone: events as thin hue lines, "+N" for the rest, no + on each day. */
  compact?: boolean;
  /** Each row's week number ("W44"), when the view options show them. */
  weekLabel?: (weekStart: Date) => string;
}


type MonthDrag<T> =
  | { kind: "create"; from: Date; to: Date; el: HTMLElement }
  | {
      kind: "move";
      item: T;
      from: Date;
      over: Date;
      /** Lifted: a mouse that travelled, or a finger held (lib/ui/pressLift). */
      active: boolean;
      pressX: number;
      pressY: number;
      touch: boolean;
      held: boolean;
      /** Strayed past PRESS_LIFT.slop since the press: let go, it isn't a still hold. */
      moved: boolean;
      el: HTMLElement;
    };

function dayFromPoint(x: number, y: number): Date | null {
  const el = document.elementFromPoint?.(x, y)?.closest<HTMLElement>("[data-month-day]");
  return el ? parseISO(el.dataset.monthDay!) : null;
}

/** A row of the month's grid: its days and its bars, a hidden weekend's columns taken out. Pure. */
export function weekRow<T extends DatedItem>(weekStart: Date, placed: readonly Placed<T>[], { weekends }: { weekends?: boolean }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const tracks = layoutWeek(weekStart, placed)
  if (weekends !== false) return { weekStart, days, tracks }
  const kept = days.flatMap((d, i) => (isWeekend(d) ? [] : [i]))
  return {
    weekStart,
    days: kept.map((i) => days[i]),
    tracks: tracks
      .map((t) =>
        t.flatMap((bar) => {
          const cols = kept.filter((c) => c >= bar.col && c < bar.col + bar.span)
          return cols.length ? [{ ...bar, col: kept.indexOf(cols[0]), span: cols.length }] : []
        }),
      )
      .filter((t) => t.length),
  }
}

/**
 * The month's grid from its first week to its last (a month, or a custom
 * range of weeks), each row laid out once per change of what's on it. Drawn
 * only when what it shows changes: an event's card opening draws none of it,
 * its bar marked open by the card (data-selected, C3).
 */
export const MonthGrid = memo(function MonthGrid<T extends MonthItem>({ from, to, placed, weekends, ...rest }: Omit<MonthViewProps<T>, "weeks"> & { from: Date; to: Date; placed: readonly Placed<T>[]; weekends: boolean }) {
  // By the dates' times: the calendar hands new Dates for the same range.
  const weeks = useMemo(() => {
    const out: MonthWeek<T>[] = [];
    for (let ws = from; ws <= to; ws = addDays(ws, 7)) out.push(weekRow(ws, placed, { weekends }));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- by the dates' times: the calendar hands new Dates for the same range
  }, [+from, +to, placed, weekends]);
  return <MonthView weeks={weeks} {...rest} />;
}) as <T extends MonthItem>(props: Omit<MonthViewProps<T>, "weeks"> & { from: Date; to: Date; placed: readonly Placed<T>[]; weekends: boolean }) => React.ReactElement;

export function MonthView<T extends MonthItem>({
  month,
  weeks,
  byDay,
  now,
  onItemClick,
  onItemOpen,
  onItemMenu,
  onDraft,
  onMoveDays,
  canMove,
  matches,
  blank,
  onNewEvent,
  compact = false,
  weekLabel,
}: MonthViewProps<T>) {
  // As many columns as a week shows: five when the weekend is hidden.
  const n = weeks[0]?.days.length || 7;
  const cols = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };
  const [drag, setDrag] = useState<MonthDrag<T> | null>(null);
  const dragRef = useRef<MonthDrag<T> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [revealing, setRevealing] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setRevealing(false), 600);
    return () => clearTimeout(t);
  }, []);
  // The day whose "+N more" was pressed, and its one list (fluid-10: each
  // busy day drew a component of its own).
  const [more, setMore] = useState<{ day: Date; open: boolean } | null>(null);
  const moreAt = useRef<HTMLButtonElement | null>(null);
  // The bars are drawn here, each one element (hueBlock), not a component a
  // bar: the project hues are read here, as HueBlock reads them (fluid-10).
  useProjectHues();
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
      if (!d.active) {
        const now = pressBecomes({ x: d.pressX, y: d.pressY, touch: d.touch, held: d.held }, e.clientX, e.clientY);
        if (now === "press") return;
        if (now === "scroll") {
          // A finger that moved before its hold is scrolling: the press is over.
          clearTimeout(timer.current);
          set(null);
          return;
        }
      }
      const moved = d.moved || Math.hypot(e.clientX - d.pressX, e.clientY - d.pressY) > PRESS_LIFT.slop;
      if (!d.active || moved !== d.moved || (day && !isSameDay(day, d.over))) set({ ...d, active: true, moved, over: day ?? d.over });
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
      const delta = d.active ? differenceInCalendarDays(d.over, d.from) : 0;
      if (delta !== 0) {
        onMoveDays?.(d.item, delta);
        return;
      }
      // Nothing moved: a click opens the event (CA-09: held or not), and a
      // finger held still opens its menu (D16).
      if (d.touch && d.held && !d.moved && onItemMenu) onItemMenu(d.item, d.el);
      else onItemClick(d.item, d.el);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    // Esc puts the drag back, and a scroll that takes the pointer (touch)
    // sends no pointerup: either ends it there, sending nothing, or the next
    // tap anywhere would land it (CA-08, CA-09).
    const stop = onDragCancel(() => {
      clearTimeout(timer.current);
      if (dragRef.current) set(null);
    });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      stop();
    };
    // Only (re)bind when a drag starts or ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag]);

  // A lifted bar holds the pointer: the page doesn't scroll under a finger,
  // and no context menu opens until it lands.
  const lifted = drag?.kind === "move" && drag.active;
  useEffect(() => (lifted ? holdLifted() : undefined), [lifted]);

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
                <button type="button" onClick={onNewEvent} data-touch-target="" className="font-medium text-brand-text hover:underline">
                  New event
                </button>
              </>
            ) : null}
          </p>
        </div>
      )}
      {/* Weekday header: 32 px, sticky, left-aligned. */}
      <div className="sticky top-0 z-20 grid border-b border-line bg-sheet" style={cols} aria-hidden="true">
        {(weeks[0]?.days ?? []).map((d) => (
          <div key={d.getDay()} className={cn("flex h-8 items-center px-2.5 text-meta font-medium text-ink-3", isWeekend(d) && "bg-sunken")}>
            {format(d, "EEE")}
          </div>
        ))}
      </div>

      <div className="flex flex-1 flex-col">
        {weeks.map(({ weekStart, days, tracks }, wi) => (
          <div key={weekStart.toISOString()} className={cn("relative flex min-h-28 flex-1 flex-col", wi < weeks.length - 1 && "border-b border-line")}>
            {weekLabel ? (
              <span className="pointer-events-none absolute bottom-1 left-1.5 z-10 text-micro font-medium tabular-nums text-ink-3" data-week-number="">
                {weekLabel(weekStart)}
              </span>
            ) : null}
            {/* The cells: date, hover "+", "+N more"; the pointer target for drafts. */}
            <div className="absolute inset-0 grid" style={cols}>
              {days.map((day, i) => {
                const items = byDay.get(dayKey(day)) || [];
                const isToday = isSameDay(day, now);
                const outside = !!month && !isSameMonth(day, month);
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
                          isToday ? "rounded-full font-semibold text-brand-text ring-[1.5px] ring-inset ring-brand" : outside ? "text-ink-3" : "text-ink-2",
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
                        data-touch-target=""
                        onClick={(e) => {
                          const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0);
                          onDraft({ start, end: new Date(start.getTime() + 30 * 60_000) }, e.currentTarget.parentElement);
                        }}
                        className="absolute right-1.5 top-1.5 z-20 flex size-5 items-center justify-center rounded-sm text-ink-3 opacity-0 transition-opacity hover:bg-press hover:text-ink focus-visible:opacity-100 group-hover/cell:opacity-100 [@media(hover:none)]:opacity-100"
                      >
                        <span aria-hidden="true" className="calendar-plus" />
                      </button>
                    ) : null}
                    {dropOn(day) && drag?.kind === "move" ? <LiftedBar item={drag.item} days={Math.min(daysOf(drag.item), 7 - i)} /> : null}
                    {hidden > 0
                      ? dayMoreButton({
                          hidden,
                          compact,
                          className: "absolute bottom-1 left-1 z-20",
                          open: !!more?.open && isSameDay(more.day, day),
                          onPress: (button) => {
                            moreAt.current = button;
                            setMore((m) => ({ day, open: !(m?.open && isSameDay(m.day, day)) }));
                          },
                        })
                      : null}
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
                            left: `calc(${(bar.col / n) * 100}% + ${bar.startsHere ? 4 : 0}px)`,
                            width: `calc(${(bar.span / n) * 100}% - ${(bar.startsHere ? 4 : 0) + (bar.endsHere ? 4 : 0)}px)`,
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
                <div key={trackIdx} data-month-track="" className="relative h-[22px] w-full" style={{ ["--days" as string]: n }}>
                  {trackBars.map((bar, bi) => {
                    const item = bar.item;
                    const timed = bar.timed && (kindOf(item) === "event" || kindOf(item) === "block");
                    const outside = !!month && !isSameMonth(addDays(weekStart, bar.col), month);
                    const end = parseISO(item.event_end_time);
                    const past = end < now;
                    const isTask = kindOf(item) === "task";
                    const movable = !!onMoveDays && !isTask && (canMove ? canMove(item) : true);
                    return (
                      <Fragment key={item.event_uuid}>
                      {hueBlock({
                        item,
                        variant: "bar",
                        quiet: timed,
                        past,
                        continued: !bar.startsHere,
                        "aria-label": `${isTask ? "Task" : "Event"}: ${item.event_title}`,
                        onPointerDown: (e) => {
                          e.stopPropagation();
                          if (e.button !== 0 || !movable) return;
                          const from = addDays(weekStart, bar.col);
                          const el = e.currentTarget as HTMLElement;
                          // A mouse lifts the bar after 5 px of travel, a finger after a 250 ms hold.
                          const touch = e.pointerType === "touch";
                          set({ kind: "move", item, from, over: from, active: false, pressX: e.clientX, pressY: e.clientY, touch, held: false, moved: false, el });
                          clearTimeout(timer.current);
                          if (touch) {
                            timer.current = setTimeout(() => {
                              const cur = dragRef.current;
                              if (cur?.kind === "move" && !cur.active) set({ ...cur, held: true, active: true });
                            }, PRESS_LIFT.hold);
                          }
                        },
                        onClick: (e) => {
                          if (e.detail === 0 || !movable) onItemClick(item, e.currentTarget as HTMLElement);
                        },
                        onDoubleClick: () => onItemOpen?.(item),
                        onMouseEnter: (e) => light(e.currentTarget, item.event_uuid, true),
                        onMouseLeave: (e) => light(e.currentTarget, item.event_uuid, false),
                        style: {
                          left: `calc(${(bar.col / n) * 100}% + ${bar.startsHere ? 4 : 0}px)`,
                          width: `calc(${(bar.span / n) * 100}% - ${(bar.startsHere ? 4 : 0) + (bar.endsHere ? 4 : 0)}px)`,
                          ["--i" as string]: trackIdx * 3 + bi,
                          // Its days' columns, for print (calendar.css), where a bar grows with its words.
                          ["--col" as string]: bar.col + 1,
                          ["--span" as string]: bar.span,
                          ["--ml" as string]: bar.startsHere ? "4px" : "0px",
                          ["--mr" as string]: bar.endsHere ? "4px" : "0px",
                        },
                        className: cn(
                          "pointer-events-auto absolute top-0 data-[lit]:ring-1 data-[lit]:ring-inset data-[lit]:ring-hue/40 data-[lit]:[--fill:80%]",
                          !bar.startsHere && "rounded-l-none",
                          !bar.endsHere && "rounded-r-none",
                          outside && "opacity-55",
                          revealing && "content-event-in",
                          movable && "cursor-grab",
                          // Where it was, while it moves: the placeholder (CA-09).
                          drag?.kind === "move" && drag.active && drag.item.event_uuid === item.event_uuid && dragPlaceholderClasses(item),
                          matches && !matches(item.event_title) && "opacity-25",
                        ),
                        children: (
                          <span className={cn("cal-bar-text truncate leading-none", isTask && item.task_status === "done" && "line-through decoration-ink-4")}>
                            {timed ? (
                              <span className="mr-1 hidden text-micro font-[450] tabular-nums @[40rem]/month:inline">{clockTime(parseISO(item.event_start_time), { compact: true })}</span>
                            ) : null}
                            {item.event_title}
                          </span>
                        ),
                      })}
                      </Fragment>
                    );
                  })}
                </div>
              ))}
            </div>
            )}
          </div>
        ))}
      </div>
      {more ? (
        <DayOverflow
          day={more.day}
          anchor={moreAt}
          open={more.open}
          onOpenChange={(open) => setMore((m) => m && { ...m, open })}
          today={isSameDay(more.day, now)}
          add={
            onDraft
              ? {
                  label: "New event",
                  onAdd: (cell) => {
                    const start = new Date(more.day.getFullYear(), more.day.getMonth(), more.day.getDate(), 9, 0);
                    onDraft({ start, end: new Date(start.getTime() + 30 * 60_000) }, cell);
                  },
                }
              : undefined
          }
        >
          {(done) =>
            (byDay.get(dayKey(more.day)) || []).map((item) => (
              <HueBlock key={item.event_uuid} item={item} variant="row" onClick={(e) => onItemClick(item, (done() ?? e.currentTarget) as HTMLElement)} className="w-full">
                <span className="min-w-0 flex-1 truncate">{item.event_title}</span>
                {!item.isTask ? <span className="shrink-0 text-meta font-[450] tabular-nums">{dayListTime(item, more.day)}</span> : null}
              </HueBlock>
            ))
          }
        </DayOverflow>
      ) : null}
    </div>
  );
}


/** How many days an item's bar covers. Pure. */
function daysOf(item: DatedItem): number {
  const [p] = placeItems([item]);
  return p ? differenceInCalendarDays(lastDayOf(p), p.start) + 1 : 1;
}

/**
 * The bar a drag carries (CA-09; INTERACTION_SPEC §5.1): drawn lifted (e3, no
 * tilt) in the day it would land on, as many days long as the event, inside
 * that week; where it was, its placeholder stays.
 */
function LiftedBar({ item, days }: { item: MonthItem; days: number }) {
  return (
    <div
      aria-hidden="true"
      data-drag-ghost=""
      className={cn("calendar-lift pointer-events-none absolute left-1 top-8 z-30 flex h-[22px] items-center gap-1 overflow-hidden rounded-md pl-[9px] pr-1.5 text-meta font-medium", hueBlockClasses(item))}
      style={{ width: `calc(${days * 100}% - 8px)` }}
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-hue" />
      <span className="truncate leading-none">{item.event_title}</span>
    </div>
  );
}

/** Lights every segment of one item (a meeting across two weeks is two bars). */
function light(from: HTMLElement, uuid: string, on: boolean) {
  from.closest("[data-month-grid]")?.querySelectorAll<HTMLElement>(`[data-event-uuid="${CSS.escape(uuid)}"]`).forEach((el) => {
    if (on) el.setAttribute("data-lit", "");
    else el.removeAttribute("data-lit");
  });
}
