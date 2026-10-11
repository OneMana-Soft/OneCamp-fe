"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { addDays, format, isSameDay, isWeekend, parseISO, startOfDay } from "date-fns";
import { cn } from "@/lib/utils/helpers/cn";
import { shortTime } from "@/lib/utils/date/shortDate";
import { ChevronDown, Plus } from "@/lib/icons";
import { SpotCalendar } from "@/components/ui/graphics";
import { HueBlock } from "@/components/calendar/HueBlock";
import { NowLine, useMinute } from "@/components/calendar/NowLine";
import { kindOf, type CalendarItemLike } from "@/components/calendar/calendarTones";
import { atMinutes, clickRange, createRange, durationLabel, minutesAt, moveRange, resizeRange, DAY_MINUTES } from "@/lib/calendar/calendarDrag";
import type { CalendarEventInterface } from "@/types/calendar";
import type { TaskInfoInterface } from "@/types/task";

/** px per hour: 15 minutes is 14 px (content.md C07). */
export const HOUR_HEIGHT = 56;
const GUTTER = 56;
/** Working hours: outside them the grid sits on sunken, so the day's shape reads. */
const WORK_START = 9;
const WORK_END = 18;
const MAX_RAIL_TRACKS = 3;

interface TimedItem extends CalendarItemLike {
  uuid: string;
  title: string;
  start: Date;
  end: Date;
  topMin: number; // minutes from midnight (clamped to day)
  endMin: number;
  col: number;
  cols: number;
  movable: boolean;
}

interface AllDayItem extends CalendarItemLike {
  uuid: string;
  title: string;
  task_status?: string;
  done?: boolean;
}

/** A draft on the grid: the ghost a drag or click drew, while its quick-create card is open. */
export interface CalendarDraft {
  start: Date;
  end: Date;
  allDay?: boolean;
}

interface WeekViewProps {
  weekStart: Date;
  /** 7 for a week, 1 for a day. */
  dayCount?: number;
  events: CalendarEventInterface[];
  tasks: TaskInfoInterface[];
  showEvents: boolean;
  showTasks: boolean;
  /** A slot was clicked or dragged: the draft range, and the ghost to anchor a card to. */
  onDraft?: (draft: CalendarDraft, ghost: HTMLElement | null) => void;
  /** The draft to keep drawn (its card is open). */
  draft?: CalendarDraft | null;
  /** An event was clicked: open its popover beside the block. */
  onEventClick: (uuid: string, el: HTMLElement) => void;
  /** An event was double-clicked: open it in full. */
  onEventOpen?: (uuid: string) => void;
  onTaskClick: (uuid: string) => void;
  /** Commit a move or a resize (the existing update call). */
  onEventChange?: (uuid: string, start: Date, end: Date) => void;
  /** Whether an event may be moved here (its organiser's). */
  canMove?: (uuid: string) => boolean;
  selectedId?: string | null;
  /** Search: blocks whose title doesn't match drop to 25 %. */
  matches?: (title: string) => boolean;
  /** The day view's right rail. */
  rail?: ReactNode;
  /** The items are still on their way: a blank grid is not yet a free week. */
  loading?: boolean;
  /** Opens quick create from the blank note's link. */
  onNewEvent?: () => void;
  /** Kept for callers that still pass a slot click (the old API). */
  onSlotClick?: (date: Date) => void;
}

/**
 * Greedy overlap packing: assign each item a column within its overlap
 * cluster. Two columns split the width; three or more cascade (content.md C10).
 */
export function packDay<T extends { topMin: number; endMin: number; col: number; cols: number }>(items: T[]): T[] {
  const sorted = [...items].sort((a, b) => a.topMin - b.topMin || a.endMin - b.endMin);
  const result: T[] = [];
  let cluster: T[] = [];
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

/** Where a block sits across its column: full, split in two, or cascaded by 12 px. Pure. */
export function blockGeometry(col: number, cols: number): { left: string; width: string } {
  if (cols <= 1) return { left: "2px", width: "calc(100% - 4px)" };
  if (cols === 2) return { left: col === 0 ? "2px" : "calc(50% + 1px)", width: "calc(50% - 3px)" };
  return { left: `${2 + col * 12}px`, width: `calc(100% - ${4 + col * 12}px)` };
}

type Drag =
  | { kind: "create"; day: number; pressMin: number; curMin: number; moved: boolean }
  | { kind: "move" | "top" | "bottom"; uuid: string; day: number; startMin: number; endMin: number; pressMin: number; pressX: number; pressY: number; curDay: number; curStart: number; curEnd: number; active: boolean; el: HTMLElement };

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function WeekView({
  weekStart,
  dayCount = 7,
  events,
  tasks,
  showEvents,
  showTasks,
  onDraft,
  draft,
  onEventClick,
  onEventOpen,
  onTaskClick,
  onEventChange,
  canMove,
  selectedId,
  matches,
  rail,
  loading = false,
  onNewEvent,
  onSlotClick,
}: WeekViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const days = useMemo(() => Array.from({ length: dayCount }, (_, i) => addDays(startOfDay(weekStart), i)), [weekStart, dayCount]);
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const now = useMinute();
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [railOpen, setRailOpen] = useState(true);
  const [hoverMin, setHoverMin] = useState<{ day: number; min: number } | null>(null);
  // Blocks enter (event-in) on the first reveal of a period only: this grid is
  // remounted per period, and a live refresh later never replays it.
  const [revealing, setRevealing] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setRevealing(false), 600);
    return () => clearTimeout(t);
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
        timed[di].push({
          ...base,
          start,
          end,
          topMin,
          endMin: Math.max(endMin, topMin + 20),
          col: 0,
          cols: 1,
          movable: !!onEventChange && isSameDay(start, end) && (canMove ? canMove(base.uuid) : true),
        });
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
              allDay[di].push({
                uuid: t.task_uuid,
                title: t.task_name,
                event_uuid: t.task_uuid,
                isTask: true,
                task_project: t.task_project,
                task_status: t.task_status,
                done: t.task_status === "done",
              });
            }
          }
        });
      });
    }

    return { timedByDay: timed.map(packDay), allDayByDay: allDay };
  }, [days, events, tasks, showEvents, showTasks, onEventChange, canMove]);

  // On opening, the working day is in view: an hour before now when today is
  // shown, else 8 am, or earlier for an earlier first event; with the hour's
  // label clear of the top. Once more when the items first arrive (they
  // usually come after the grid), never after that: moving to another
  // period keeps the scroll, as a calendar does.
  const firstMin = useMemo(() => Math.min(...timedByDay.flat().map((it) => it.topMin), DAY_MINUTES), [timedByDay]);
  const scrolledFor = useRef<"none" | "grid" | "items">("none");
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const hasItems = firstMin < DAY_MINUTES;
    if (scrolledFor.current === "items" || (scrolledFor.current === "grid" && !hasItems)) return;
    const t = new Date();
    const showsToday = days.some((d) => isSameDay(d, t));
    let hour = showsToday ? Math.max(0, Math.min(t.getHours() - 1, 16)) : 8;
    if (hasItems && firstMin / 60 < hour) hour = Math.floor(firstMin / 60);
    const top = Math.max(0, hour * HOUR_HEIGHT - 12);
    const smooth = scrolledFor.current === "grid" && !reducedMotion();
    if (el.scrollTo) el.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
    else el.scrollTop = top;
    scrolledFor.current = hasItems ? "items" : "grid";
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on opening, and once when the items arrive
  }, [firstMin]);

  const blank = !loading && allDayByDay.every((d) => d.length === 0) && timedByDay.every((d) => d.length === 0);
  const todayIndex = days.findIndex((d) => isSameDay(d, now));
  const nowTopMin = now.getHours() * 60 + now.getMinutes();
  const single = dayCount === 1;
  const railTracks = Math.min(MAX_RAIL_TRACKS, Math.max(1, ...allDayByDay.map((d) => d.length)));
  const railShown = railOpen ? railTracks : 1;

  // ---- pointer: create, move, resize -------------------------------------

  const columnAt = (clientX: number): number => {
    const cols = colsRef.current?.querySelectorAll<HTMLElement>("[data-day-col]");
    if (!cols) return 0;
    for (let i = 0; i < cols.length; i++) {
      const r = cols[i].getBoundingClientRect();
      if (clientX >= r.left && clientX < r.right) return i;
    }
    const first = cols[0]?.getBoundingClientRect();
    return first && clientX < first.left ? 0 : cols.length - 1;
  };
  const minuteAt = (clientY: number): number => {
    const r = colsRef.current?.getBoundingClientRect();
    return r ? minutesAt(clientY - r.top, HOUR_HEIGHT) : 0;
  };
  const setD = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };

  const onColumnPointerDown = (e: React.PointerEvent<HTMLDivElement>, day: number) => {
    if (e.button !== 0 || !onDraft) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const m = minuteAt(e.clientY);
    setD({ kind: "create", day, pressMin: m, curMin: m, moved: false });
  };

  const onBlockPointerDown = (e: React.PointerEvent<HTMLElement>, it: TimedItem, day: number, kind: "move" | "top" | "bottom") => {
    e.stopPropagation();
    if (e.button !== 0 || !it.movable) return;
    colsRef.current?.setPointerCapture?.(e.pointerId);
    const el = e.currentTarget.closest<HTMLElement>("[data-hue-block]") ?? e.currentTarget;
    const d: Drag = {
      kind,
      uuid: it.uuid,
      day,
      startMin: it.topMin,
      endMin: it.endMin,
      pressMin: minuteAt(e.clientY),
      pressX: e.clientX,
      pressY: e.clientY,
      curDay: day,
      curStart: it.topMin,
      curEnd: it.endMin,
      active: kind !== "move",
      el,
    };
    setD(d);
    // Hold 150 ms (or travel 4 px) to lift a block; a quick press is a click.
    if (kind === "move") {
      clearTimeout(holdTimer.current);
      holdTimer.current = setTimeout(() => {
        const cur = dragRef.current;
        if (cur && cur.kind === "move" && !cur.active) setD({ ...cur, active: true });
      }, 150);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) {
      // The 15-minute band under the pointer, with its time.
      const target = e.target as HTMLElement;
      if (target.closest("[data-hue-block]")) return setHoverMin(null);
      const day = columnAt(e.clientX);
      const min = Math.floor(minuteAt(e.clientY) / 15) * 15;
      if (hoverMin?.day !== day || hoverMin?.min !== min) setHoverMin({ day, min });
      return;
    }
    const m = minuteAt(e.clientY);
    if (d.kind === "create") {
      if (Math.abs(m - d.pressMin) >= 4 || d.moved) setD({ ...d, curMin: m, moved: true });
      return;
    }
    const travelled = Math.hypot(e.clientX - d.pressX, e.clientY - d.pressY) > 4;
    const active = d.active || travelled;
    if (!active) return;
    if (d.kind === "move") {
      const r = moveRange(d.startMin, d.endMin, m - d.pressMin);
      setD({ ...d, active, curDay: columnAt(e.clientX), curStart: r.startMin, curEnd: r.endMin });
    } else {
      const r = resizeRange(d.startMin, d.endMin, d.kind, m);
      setD({ ...d, active, curStart: r.startMin, curEnd: r.endMin });
    }
  };

  const onPointerUp = () => {
    clearTimeout(holdTimer.current);
    const d = dragRef.current;
    setD(null);
    if (!d) return;
    if (d.kind === "create") {
      const r = d.moved ? createRange(d.pressMin, d.curMin) : clickRange(d.pressMin);
      const draftRange = { start: atMinutes(days[d.day], r.startMin), end: atMinutes(days[d.day], r.endMin) };
      if (onDraft) {
        // The ghost stays drawn through the draft prop; the card anchors to it.
        requestAnimationFrame(() => onDraft(draftRange, ghostRef.current));
      } else onSlotClick?.(draftRange.start);
      return;
    }
    if (!d.active) {
      // A press without travel: a click.
      onEventClick(d.uuid, d.el);
      return;
    }
    const changed = d.curStart !== d.startMin || d.curEnd !== d.endMin || d.curDay !== d.day;
    if (changed) onEventChange?.(d.uuid, atMinutes(days[d.curDay], d.curStart), atMinutes(days[d.curDay], d.curEnd));
  };

  // What the ghost shows: a live create drag, or the draft held for its card.
  const ghost = (() => {
    if (drag?.kind === "create") {
      const r = drag.moved ? createRange(drag.pressMin, drag.curMin) : clickRange(drag.pressMin);
      return { day: drag.day, ...r };
    }
    if (draft && !draft.allDay) {
      const di = days.findIndex((d) => isSameDay(d, draft.start));
      if (di < 0) return null;
      const s = draft.start.getHours() * 60 + draft.start.getMinutes();
      const e = isSameDay(draft.start, draft.end) ? draft.end.getHours() * 60 + draft.end.getMinutes() : DAY_MINUTES;
      return { day: di, startMin: s, endMin: Math.max(e, s + 15) };
    }
    return null;
  })();
  const ghostLabel = ghost ? `${shortTime(atMinutes(days[ghost.day], ghost.startMin))} – ${shortTime(atMinutes(days[ghost.day], ghost.endMin))}` : "";

  const moving = drag && drag.kind !== "create" && drag.active ? drag : null;

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Day headers: 56 px, sticky. Today's date in a brand ring. */}
        <div className="sticky top-0 z-20 flex border-b border-line bg-sheet">
          <div className="shrink-0" style={{ width: GUTTER }} />
          {days.map((day, i) => {
            const isToday = isSameDay(day, now);
            const weekend = isWeekend(day);
            return (
              <div
                key={i}
                data-today={isToday || undefined}
                data-weekend={weekend || undefined}
                className={cn(
                  "group/dh relative flex h-14 flex-1 flex-col justify-center border-l border-line",
                  single ? "items-start px-3" : "min-w-[90px] items-center",
                  weekend && "bg-sunken",
                )}
              >
                <span className={cn("text-micro font-medium", isToday ? "text-brand-text" : "text-ink-3")}>{format(day, single ? "EEEE" : "EEE")}</span>
                <span
                  className={cn(
                    "mt-0.5 flex size-8 items-center justify-center rounded-full text-xl font-semibold tabular-nums leading-6",
                    isToday ? "text-brand-text ring-[1.5px] ring-inset ring-brand" : "text-ink",
                  )}
                  aria-current={isToday ? "date" : undefined}
                >
                  {format(day, "d")}
                </span>
                {onDraft ? (
                  <button
                    type="button"
                    aria-label={`New all-day event on ${format(day, "EEEE d MMMM")}`}
                    onClick={(e) => onDraft({ start: day, end: addDays(day, 1), allDay: true }, e.currentTarget)}
                    className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-sm text-ink-3 opacity-0 transition-opacity hover:bg-hover hover:text-ink focus-visible:opacity-100 group-hover/dh:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <Plus className="size-3.5" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* All-day rail: 32 px plus 24 px per extra track, three at most, then "+N". */}
        <div className="relative flex border-b border-line-2 bg-sheet" data-all-day-rail="">
          <div className="relative flex shrink-0 items-start justify-end gap-0.5 pr-2 pt-2 text-micro text-ink-3" style={{ width: GUTTER }}>
            All day
            {railTracks > 1 ? (
              <button
                type="button"
                aria-label={railOpen ? "Collapse all-day events" : "Expand all-day events"}
                aria-expanded={railOpen}
                onClick={() => setRailOpen((o) => !o)}
                className="absolute bottom-1 right-1.5 flex size-4 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink"
              >
                <ChevronDown className={cn("size-3 transition-transform duration-200", !railOpen && "-rotate-90")} />
              </button>
            ) : null}
          </div>
          {allDayByDay.map((items, i) => {
            const shown = items.slice(0, railShown);
            const more = items.length - shown.length;
            return (
              <div
                key={i}
                className={cn("flex flex-1 flex-col gap-0.5 border-l border-line px-1 py-[5px]", !single && "min-w-[90px]", isWeekend(days[i]) && "bg-sunken")}
                style={{ minHeight: 32 + (railShown - 1) * 24 }}
              >
                {shown.map((it) => (
                  <HueBlock
                    key={`${it.uuid}-${i}`}
                    item={it}
                    variant="chip"
                    selected={selectedId === it.uuid}
                    onClick={(e) => (it.isTask ? onTaskClick(it.uuid) : onEventClick(it.uuid, e.currentTarget))}
                    aria-label={`${it.isTask ? "Task" : "Event"}: ${it.title}`}
                    className={cn("w-full", matches && !matches(it.title) && "opacity-25")}
                  >
                    <span className={cn("truncate", it.done && "line-through decoration-ink-4")}>{it.title}</span>
                  </HueBlock>
                ))}
                {more > 0 ? (
                  <button
                    type="button"
                    onClick={() => setRailOpen(true)}
                    className="h-5 self-start rounded-sm px-1.5 text-meta font-medium text-ink-2 hover:bg-hover hover:text-ink"
                  >
                    +{more}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div ref={scrollRef} className="custom-scrollbar flex-1 overflow-y-auto overscroll-contain">
            <div className="relative flex" style={{ height: `${24 * HOUR_HEIGHT}px` }}>
              {/* Hour gutter: labels on the line, the first hidden. */}
              <div className="shrink-0" style={{ width: GUTTER }}>
                {hours.map((h) => (
                  <div key={h} className="relative" style={{ height: `${HOUR_HEIGHT}px` }}>
                    {h > 0 && Math.abs(nowTopMin - h * 60) >= 20 ? (
                      <span className="absolute right-2 top-0 -translate-y-1/2 text-micro tabular-nums text-ink-3">
                        {format(new Date(2000, 0, 1, h), "h a")}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              <div
                ref={colsRef}
                className={cn("relative flex flex-1", moving && "cursor-grabbing")}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => setD(null)}
                onPointerLeave={() => setHoverMin(null)}
              >
                {days.map((day, di) => (
                  <div
                    key={di}
                    data-day-col={di}
                    data-weekend={isWeekend(day) || undefined}
                    className={cn("relative flex-1 border-l border-line", !single && "min-w-[90px]", onDraft && "cursor-cell", isWeekend(day) && "bg-sunken")}
                    onPointerDown={(e) => onColumnPointerDown(e, di)}
                  >
                    {/* Outside working hours: sunken at 60 %. */}
                    <div data-off-hours="" aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 bg-sunken/60" style={{ height: WORK_START * HOUR_HEIGHT }} />
                    <div data-off-hours="" aria-hidden="true" className="pointer-events-none absolute inset-x-0 bg-sunken/60" style={{ top: WORK_END * HOUR_HEIGHT, height: (24 - WORK_END) * HOUR_HEIGHT }} />
                    {/* Hour hairlines, and a dashed half-hour line at half strength. */}
                    {hours.map((h) => (
                      <div key={h} className="pointer-events-none relative border-b border-line" style={{ height: `${HOUR_HEIGHT}px` }}>
                        <span data-half-hour="" aria-hidden="true" className="absolute inset-x-0 top-1/2 border-t border-dashed border-line opacity-50" />
                      </div>
                    ))}

                    {/* The 15-minute band under the pointer, with its time. */}
                    {!drag && hoverMin?.day === di && onDraft ? (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 z-[5] h-[14px] bg-hover"
                        style={{ transform: `translateY(${(hoverMin.min / 60) * HOUR_HEIGHT}px)` }}
                      >
                        <span className="absolute left-1.5 top-0 text-micro font-medium leading-[14px] tabular-nums text-ink-2">{shortTime(atMinutes(day, hoverMin.min))}</span>
                      </div>
                    ) : null}

                    {/* Timed events */}
                    {timedByDay[di].map((it, idx) => {
                      const isMoving = moving?.uuid === it.uuid;
                      const startMin = isMoving ? moving.curStart : it.topMin;
                      const endMin = isMoving ? moving.curEnd : it.endMin;
                      // A moved block draws in the column it's over.
                      if (isMoving && moving.curDay !== di) return <Origin key={it.uuid} it={it} />;
                      const top = (startMin / 60) * HOUR_HEIGHT;
                      const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT - 2, 14);
                      const geo = isMoving ? { left: "2px", width: "calc(100% - 4px)" } : blockGeometry(it.col, it.cols);
                      const past = it.end < now;
                      const live = it.start <= now && now < it.end;
                      const time = `${shortTime(it.start)} – ${shortTime(it.end)}`;
                      const tag = isMoving ? (moving.kind === "move" ? `${format(days[moving.curDay], "EEE")} ${shortTime(atMinutes(days[moving.curDay], startMin))}` : durationLabel(endMin - startMin)) : null;
                      return (
                        <div key={it.uuid} className="contents">
                          {isMoving ? <Origin it={it} /> : null}
                          <HueBlock
                            as="div"
                            role="button"
                            tabIndex={0}
                            item={it}
                            variant="block"
                            past={past}
                            live={live}
                            selected={selectedId === it.uuid}
                            aria-label={`${it.title}, ${time}`}
                            title={height < 28 ? `${it.title} · ${time}` : undefined}
                            onPointerDown={(e) => onBlockPointerDown(e, it, di, "move")}
                            onClick={(e) => {
                              // A movable block's pointer click is handled on pointer up
                              // (it may become a drag); the keyboard's, and a fixed block's, here.
                              if (e.detail === 0 || !it.movable) onEventClick(it.uuid, e.currentTarget as HTMLElement);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onEventClick(it.uuid, e.currentTarget as HTMLElement);
                              }
                            }}
                            onDoubleClick={() => onEventOpen?.(it.uuid)}
                            style={{ top, height, left: geo.left, width: geo.width, ["--i" as string]: idx }}
                            className={cn(
                              "absolute z-10",
                              height >= 28 ? "py-1" : "justify-center py-0",
                              it.cols > 1 && "outline outline-[1.5px] outline-sheet",
                              revealing && !isMoving && "content-event-in",
                              it.movable && "cursor-grab",
                              isMoving && "calendar-lift",
                              kindOf(it) === "focus" && live && "focus-running",
                              matches && !matches(it.title) && "opacity-25",
                            )}
                          >
                            {height >= 44 ? (
                              <>
                                <span className="line-clamp-2 text-meta font-medium leading-4">{it.title}</span>
                                <span className="truncate text-micro font-[450] tabular-nums opacity-75">{time}</span>
                              </>
                            ) : height >= 28 ? (
                              <span className="truncate leading-4">
                                {it.title} <span className="font-[450] tabular-nums opacity-75">· {shortTime(it.start)}</span>
                              </span>
                            ) : (
                              <span className="truncate text-micro leading-3">
                                {it.title} <span className="font-[450] tabular-nums opacity-75">{shortTime(it.start)}</span>
                              </span>
                            )}
                            {tag ? (
                              <span key={tag} className="content-ghost-pulse absolute bottom-1 right-1 rounded-[5px] bg-pop px-1 text-micro font-semibold tabular-nums text-ink shadow-e1">
                                {tag}
                              </span>
                            ) : null}
                            {it.movable && !moving ? (
                              <>
                                <span
                                  aria-hidden="true"
                                  onPointerDown={(e) => onBlockPointerDown(e, it, di, "top")}
                                  className="absolute inset-x-0 top-0 flex h-1.5 cursor-ns-resize justify-center opacity-0 group-hover/hb:opacity-100 [@media(hover:none)]:opacity-100"
                                >
                                  <span className="mt-0.5 h-[3px] w-4 rounded-[2px] bg-hue-ink/40" />
                                </span>
                                <span
                                  aria-hidden="true"
                                  onPointerDown={(e) => onBlockPointerDown(e, it, di, "bottom")}
                                  className="absolute inset-x-0 bottom-0 flex h-1.5 cursor-ns-resize items-end justify-center opacity-0 group-hover/hb:opacity-100 [@media(hover:none)]:opacity-100"
                                >
                                  <span className="mb-0.5 h-[3px] w-4 rounded-[2px] bg-hue-ink/40" />
                                </span>
                              </>
                            ) : null}
                          </HueBlock>
                        </div>
                      );
                    })}

                    {/* A block moved here from another column. */}
                    {moving && moving.curDay === di && moving.day !== di
                      ? (() => {
                          const it = timedByDay[moving.day].find((x) => x.uuid === moving.uuid);
                          if (!it) return null;
                          const top = (moving.curStart / 60) * HOUR_HEIGHT;
                          const height = Math.max(((moving.curEnd - moving.curStart) / 60) * HOUR_HEIGHT - 2, 14);
                          return (
                            <HueBlock as="div" item={it} variant="block" style={{ top, height, left: 2, width: "calc(100% - 4px)" }} className="calendar-lift absolute py-1">
                              <span className="truncate leading-4">{it.title}</span>
                              <span key={moving.curStart} className="content-ghost-pulse absolute bottom-1 right-1 rounded-[5px] bg-pop px-1 text-micro font-semibold tabular-nums text-ink shadow-e1">
                                {format(day, "EEE")} {shortTime(atMinutes(day, moving.curStart))}
                              </span>
                            </HueBlock>
                          );
                        })()
                      : null}

                    {/* The draft ghost: brand at 14 %, a brand bar, a dashed ring. */}
                    {ghost && ghost.day === di ? (
                      <div
                        ref={ghostRef}
                        data-calendar-ghost=""
                        className="pointer-events-none absolute inset-x-[2px] z-30 overflow-hidden rounded-md border border-dashed border-brand bg-brand/14 py-1 pl-[9px] pr-1.5"
                        style={{ top: (ghost.startMin / 60) * HOUR_HEIGHT, height: Math.max(((ghost.endMin - ghost.startMin) / 60) * HOUR_HEIGHT - 2, 12) }}
                      >
                        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-brand" />
                        <span key={ghostLabel} className="content-ghost-pulse block origin-left text-meta font-semibold tabular-nums text-brand-text">
                          {ghostLabel}
                        </span>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              {/* Now: brand, with the time in the gutter. */}
              <NowLine top={(nowTopMin / 60) * HOUR_HEIGHT} gutter={GUTTER} columns={dayCount} todayIndex={todayIndex} now={now} />
            </div>
          </div>
          {/* A week or a day with nothing in it says so, small, in the middle of
              what is in view; the slots under it still take a click. */}
          {blank && (
            <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2" data-calendar-blank="">
              <SpotCalendar size={64} />
              <p className="pointer-events-auto flex h-8 items-center gap-1 rounded-[16px] bg-pop px-3 text-ui-sm text-ink-2 shadow-e1">
                {single ? (isSameDay(days[0], now) ? "Nothing on today" : "Nothing on this day") : "Nothing on this week"}
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
        </div>
      </div>
      {single && rail ? (
        <aside className="hidden w-[280px] shrink-0 overflow-y-auto border-l border-line bg-sunken lg:block" data-day-rail="">
          {rail}
        </aside>
      ) : null}
    </div>
  );
}

/** Where a moved block came from: a dashed outline in its hue. */
function Origin({ it }: { it: TimedItem }) {
  const top = (it.topMin / 60) * HOUR_HEIGHT;
  const height = Math.max(((it.endMin - it.topMin) / 60) * HOUR_HEIGHT - 2, 14);
  const geo = blockGeometry(it.col, it.cols);
  return (
    <div
      aria-hidden="true"
      data-drag-origin=""
      className="pointer-events-none absolute rounded-md border border-dashed border-ink-4"
      style={{ top, height, left: geo.left, width: geo.width }}
    />
  );
}
