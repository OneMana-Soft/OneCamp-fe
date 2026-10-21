"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { addDays, format, isSameDay, isWeekend, parseISO, startOfDay } from "date-fns";
import { cn } from "@/lib/utils/helpers/cn";
import { ChevronDown, Plus } from "@/lib/icons";
import { SpotCalendar } from "@/components/ui/graphics";
import { lazyView } from "@/components/task/LazyView";
import { HueBlock, dragPlaceholderClasses } from "@/components/calendar/HueBlock";
import { NowLine, useMinute } from "@/components/calendar/NowLine";
import { kindOf, type CalendarItemLike } from "@/components/calendar/calendarTones";
import { atMinutes, clickRange, createRange, durationLabel, keyNudge, minutesAt, moveRange, resizeRange, DAY_MINUTES } from "@/lib/calendar/calendarDrag";
import type { CalendarEventInterface } from "@/types/calendar";
import type { TaskInfoInterface } from "@/types/task";
import { clockHour, clockRange, clockTime } from "@/lib/utils/date/clock";
import { placedByDates } from "@/lib/calendar/allDay";
import { DEFAULT_VIEW_MINUTES, openingMinute } from "@/lib/calendar/openAt";
import { daySpan, daySpanWords } from "@/components/calendar/calendarLayout";
import { onDragCancel } from "@/lib/ui/dragCancel";
import { PRESS_LIFT, holdLifted, pressBecomes } from "@/lib/ui/pressLift";
import { edgeScroller } from "@/lib/ui/edgeScroll";
import { useStableCallback } from "@/hooks/useStableCallback";

/** The rail's "+N" list, loaded when a day first has more than the rail holds. */
const Rail = lazyView(() => import("@/components/calendar/railMore"));

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
  topMin: number; // minutes from midnight on the clock (clamped to the day)
  endMin: number; // where the block's drawing ends (at least 20 minutes down)
  /** How long it really is, in minutes: a move keeps this, not the drawn height. */
  lenMin: number;
  col: number;
  cols: number;
  /** How many columns it covers, from `col`: the free ones to its right as well. */
  span: number;
  movable: boolean;
  /** It began on an earlier day: its block starts at the top of this one. */
  carried?: boolean;
}

export interface AllDayItem extends CalendarItemLike {
  uuid: string;
  title: string;
  task_status?: string;
  done?: boolean;
  /** A timed event that runs on into another day: "From 09:30" on its first, "Until 09:30" on its last (daySpan). */
  when?: string;
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
  /** A finger held on an event and let go without moving: its menu (D16). Without it, a click. */
  onEventMenu?: (uuid: string, el: HTMLElement) => void;
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
 * Overlapping events side by side, as calendars lay them out (PG2-30; it
 * replaces content.md C10's cascade from three, whose blocks drew their
 * titles over each other on a busy day). Events that overlap, directly or
 * through others, share their day's width in columns: each takes the first
 * column free when it starts (the longer first, at the same start), and
 * stretches right over every column free for all its time. Sets `col`,
 * `cols` and `span` on each item; no two overlapping items share a column.
 */
export function packDay<T extends { topMin: number; endMin: number; col: number; cols: number; span: number }>(items: T[]): T[] {
  const sorted = [...items].sort((a, b) => a.topMin - b.topMin || b.endMin - a.endMin);
  const result: T[] = [];
  let cluster: T[] = [];
  let clusterEnd = -1;
  const overlap = (a: T, b: T) => a.topMin < b.endMin && b.topMin < a.endMin;

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
      let span = 1;
      while (it.col + span < cols && !cluster.some((o) => o.col === it.col + span && overlap(o, it))) span++;
      it.span = span;
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

/** Minutes since midnight on the clock: what the hour lines and atMinutes count. Pure. */
export function wallMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Where a block sits across its day: its columns' share of the width inside a
 * 2 px margin, with a 2 px gap before the next column's block. Pure.
 */
export function blockGeometry(col: number, cols: number, span = 1): { left: string; width: string } {
  if (cols <= 1) return { left: "2px", width: "calc(100% - 4px)" };
  const share = (n: number) => `(100% - 4px) * ${n} / ${cols}`;
  const last = col + span >= cols;
  return { left: col === 0 ? "2px" : `calc(2px + ${share(col)})`, width: last ? `calc(${share(span)})` : `calc(${share(span)} - 2px)` };
}

type Drag =
  | { kind: "create"; day: number; pressMin: number; curMin: number; moved: boolean }
  | {
      kind: "move" | "top" | "bottom";
      uuid: string;
      day: number;
      startMin: number;
      endMin: number;
      pressMin: number;
      pressX: number;
      pressY: number;
      curDay: number;
      curStart: number;
      curEnd: number;
      /** Lifted: a mouse that travelled, a finger held (lib/ui/pressLift), or a grip. */
      active: boolean;
      /** A finger, held for PRESS_LIFT.hold. */
      touch: boolean;
      held: boolean;
      /** Strayed past PRESS_LIFT.slop since the press: let go, it isn't a still hold. */
      moved: boolean;
      el: HTMLElement;
    };

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
  onEventMenu,
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

    const pushTimedOrAllDay = (base: AllDayItem, start: Date, end: Date, allDayEvent = false) => {
      days.forEach((day, di) => {
        const dayStart = startOfDay(day);
        const dayEnd = addDays(dayStart, 1);
        if (end <= dayStart || start >= dayEnd) return;

        const durationMs = end.getTime() - start.getTime();
        const spansFullDay = start <= dayStart && end >= dayEnd;
        const isMultiDay = !isSameDay(start, end) && durationMs >= DAY_MINUTES * 60 * 1000;

        // A Google all-day event is in the rail on its dates, whatever its length.
        if (allDayEvent || spansFullDay || isMultiDay) {
          const span = daySpan({ event_all_day: allDayEvent }, start, end, day);
          allDay[di].push(span.kind === "from" || span.kind === "until" ? { ...base, when: daySpanWords(span) } : base);
          return;
        }

        // By the clock, as the hour lines and the now line are drawn: on a day
        // the clocks change, time elapsed since midnight drew a 10:00 meeting
        // on the 09:00 line, and a drag saved it from there (CAL-BUG-18). A
        // span from another day starts at the top; one into the next ends at
        // the bottom.
        const topMin = start < dayStart ? 0 : wallMinutes(start);
        const endMin = end >= dayEnd ? DAY_MINUTES : wallMinutes(end);
        timed[di].push({
          ...base,
          start,
          end,
          topMin,
          // Drawn at least 20 minutes tall, so its title fits; moved by its own length.
          endMin: Math.max(endMin, topMin + 20),
          // (By the clock too; only an hour the clocks repeat can run it backwards.)
          lenMin: endMin > topMin ? endMin - topMin : Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000)),
          col: 0,
          cols: 1,
          span: 1,
          movable: !!onEventChange && isSameDay(start, end) && (canMove ? canMove(base.uuid) : true),
          carried: start < dayStart,
        });
      });
    };

    if (showEvents) {
      events.forEach((raw) => {
        // Placed by its dates when it is a Google all-day event (CAL-BUG-2).
        const e = placedByDates(raw);
        const start = parseISO(e.event_start_time);
        const end = parseISO(e.event_end_time);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
        pushTimedOrAllDay(
          { uuid: e.event_uuid, title: e.event_title, event_uuid: e.event_uuid, event_is_focus: !!e.event_is_focus, event_is_away: !!e.event_is_away, event_hue: e.event_hue },
          start,
          end,
          !!e.event_all_day,
        );
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

  // On opening, the grid shows what comes next (lib/calendar/openAt): now and
  // the next item when both fit, else that item with an hour above it, with
  // its hour's label clear of the top; never a later day's early event
  // ahead of now (an event at 00:30 on Saturday opened this week at
  // midnight: PTC-8). Until the person scrolls, it follows the items as they
  // land (they usually come after the grid); after that it stays where they
  // put it. The grid is remounted per period, so a new week or day opens the
  // same way.
  const openedAt = useRef(new Date());
  const userMoved = useRef(false);
  const openedTop = useRef<number | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || userMoved.current) return;
    const t = openedAt.current;
    const todayIdx = days.findIndex((d) => isSameDay(d, t));
    const viewMin = el.clientHeight > 0 ? (el.clientHeight / HOUR_HEIGHT) * 60 : DEFAULT_VIEW_MINUTES;
    const min = openingMinute(timedByDay, todayIdx, wallMinutes(t), viewMin);
    const top = Math.max(0, Math.floor(min / 60) * HOUR_HEIGHT - 12);
    if (top === openedTop.current) return;
    const smooth = openedTop.current !== null && !reducedMotion();
    if (el.scrollTo) el.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
    else el.scrollTop = top;
    openedTop.current = top;
  }, [timedByDay, days]);
  const moved = () => {
    userMoved.current = true;
  };

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

  // A live drag holds the pointer with the columns, a create as a move does,
  // and ends without landing on Esc (the block goes back where it started),
  // when the browser takes the pointer back (a scroll on a touch screen), or
  // when the columns lose it without a pointerup. Nothing is sent.
  useEffect(() => {
    if (!drag) return;
    return onDragCancel(() => {
      clearTimeout(holdTimer.current);
      if (dragRef.current) setD(null);
    }, colsRef.current);
    // Only (re)bind when a drag starts or ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag]);

  const onColumnPointerDown = (e: React.PointerEvent<HTMLDivElement>, day: number) => {
    if (e.button !== 0 || !onDraft) return;
    colsRef.current?.setPointerCapture?.(e.pointerId);
    const m = minuteAt(e.clientY);
    setD({ kind: "create", day, pressMin: m, curMin: m, moved: false });
  };

  // A block lifted from its slot holds the pointer: the page doesn't scroll
  // under a finger, and no context menu opens until it lands.
  const lifted = !!drag && drag.kind !== "create" && drag.active;
  useEffect(() => (lifted ? holdLifted() : undefined), [lifted]);

  /**
   * A press on a block (INTERACTION_SPEC §5.1): a mouse lifts it after 5 px of
   * travel, a finger after a 250 ms hold within 8 px (sooner, it is a scroll).
   * Let go having changed nothing, it is a click; a finger held still opens
   * the event's menu (D16).
   */
  const onBlockPointerDown = (e: React.PointerEvent<HTMLElement>, it: TimedItem, day: number, pressed: "move" | "top" | "bottom") => {
    e.stopPropagation();
    if (e.button !== 0 || !it.movable) return;
    colsRef.current?.setPointerCapture?.(e.pointerId);
    const el = e.currentTarget.closest<HTMLElement>("[data-hue-block]") ?? e.currentTarget;
    const touch = e.pointerType === "touch";
    // A 6 px grip is no target for a finger (CA-02): on a touch screen the
    // grips aren't drawn, and a press near the block's edge is a press on the
    // block. A finger changes an event's times in its card.
    const kind = touch ? "move" : pressed;
    const d: Drag = {
      kind,
      uuid: it.uuid,
      day,
      startMin: it.topMin,
      endMin: it.topMin + it.lenMin,
      pressMin: minuteAt(e.clientY),
      pressX: e.clientX,
      pressY: e.clientY,
      curDay: day,
      curStart: it.topMin,
      curEnd: it.topMin + it.lenMin,
      active: kind !== "move",
      touch,
      held: false,
      moved: false,
      el,
    };
    setD(d);
    clearTimeout(holdTimer.current);
    if (touch && kind === "move") {
      holdTimer.current = setTimeout(() => {
        const cur = dragRef.current;
        if (cur && cur.kind === "move" && !cur.active) setD({ ...cur, held: true, active: true });
      }, PRESS_LIFT.hold);
    }
  };

  /**
   * The live drag at a pointer at (x, y): the range a create covers, or where
   * a lifted block now sits. Null when the press isn't (or is no longer) a
   * drag; else whether a finger holds it.
   */
  const place = (x: number, y: number): { touch: boolean } | null => {
    const d = dragRef.current;
    if (!d) return null;
    const m = minuteAt(y);
    if (d.kind === "create") {
      if (Math.abs(m - d.pressMin) < 4 && !d.moved) return null;
      setD({ ...d, curMin: m, moved: true });
      return { touch: false };
    }
    if (!d.active) {
      const now = pressBecomes({ x: d.pressX, y: d.pressY, touch: d.touch, held: d.held }, x, y);
      if (now === "press") return null;
      if (now === "scroll") {
        // A finger that moved before its hold is scrolling the grid: the press is over.
        clearTimeout(holdTimer.current);
        setD(null);
        return null;
      }
    }
    const moved = d.moved || Math.hypot(x - d.pressX, y - d.pressY) > PRESS_LIFT.slop;
    if (d.kind === "move") {
      const r = moveRange(d.startMin, d.endMin, m - d.pressMin);
      setD({ ...d, active: true, moved, curDay: columnAt(x), curStart: r.startMin, curEnd: r.endMin });
    } else {
      const r = resizeRange(d.startMin, d.endMin, d.kind, m);
      setD({ ...d, active: true, moved, curStart: r.startMin, curEnd: r.endMin });
    }
    return { touch: d.touch };
  };

  // Near the grid's top or bottom edge a drag scrolls it (CA-03; the one
  // edge scroll, lib/ui/edgeScroll: 48 px under a pointer, 64 px under a
  // finger, up to 18 px a frame), and goes on from wherever the hours now
  // lie under the still pointer.
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const edge = useRef<ReturnType<typeof edgeScroller> | null>(null);
  const placeAgain = useStableCallback(() => {
    const p = pointer.current;
    if (p) place(p.x, p.y);
  });
  useEffect(() => {
    if (!drag) return;
    const scroller = edgeScroller(scrollRef.current, placeAgain);
    edge.current = scroller;
    return () => {
      scroller.stop();
      edge.current = null;
      pointer.current = null;
    };
    // Only (re)bind when a drag starts or ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag]);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) {
      // The 15-minute band under the pointer, with its time.
      const target = e.target as HTMLElement;
      if (target.closest("[data-hue-block]")) return setHoverMin(null);
      const day = columnAt(e.clientX);
      const min = Math.floor(minuteAt(e.clientY) / 15) * 15;
      if (hoverMin?.day !== day || hoverMin?.min !== min) setHoverMin({ day, min });
      return;
    }
    const live = place(e.clientX, e.clientY);
    if (!live) return;
    pointer.current = { x: e.clientX, y: e.clientY };
    // The grid scrolls by its hours only: a day that fits has nothing to scroll.
    const grid = scrollRef.current;
    if (grid && grid.scrollHeight > grid.clientHeight) edge.current?.follow(e.clientX, e.clientY, live.touch);
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
        // The ghost stays drawn through the draft prop, re-mounted once the
        // draft is set: the card finds it then (its anchor is measured live).
        requestAnimationFrame(() => onDraft(draftRange, null));
      } else onSlotClick?.(draftRange.start);
      return;
    }
    const changed = d.curStart !== d.startMin || d.curEnd !== d.endMin || d.curDay !== d.day;
    if (changed) {
      onEventChange?.(d.uuid, atMinutes(days[d.curDay], d.curStart), atMinutes(days[d.curDay], d.curEnd));
      return;
    }
    // Nothing changed: a click opens the event (CA-01: held or not), and a
    // finger held still opens its menu (D16).
    if (d.touch && d.held && !d.moved && onEventMenu) onEventMenu(d.uuid, d.el);
    else onEventClick(d.uuid, d.el);
  };

  // The keyboard's move (Alt+↑↓ 15 minutes, Alt+←→ a day, Alt+Shift+↑↓ the
  // end): sent as a drag's is, with its toast and Undo. The block is drawn
  // again where it lands (another day's column is another element), so the
  // focus follows it there.
  const refocus = useRef<{ uuid: string; until: number } | null>(null);
  const nudge = (e: React.KeyboardEvent, it: TimedItem, di: number) => {
    const n = keyNudge(e);
    if (!n || !onEventChange) return;
    e.preventDefault();
    e.stopPropagation();
    const start = it.topMin;
    const end = it.topMin + it.lenMin;
    const r = n.end ? resizeRange(start, end, "bottom", end + n.minutes) : moveRange(start, end, n.minutes);
    if (!n.days && r.startMin === start && r.endMin === end) return;
    const day = addDays(days[di], n.days);
    // For a moment: the move is drawn at once, so the block is redrawn within it.
    refocus.current = { uuid: it.uuid, until: Date.now() + 1500 };
    onEventChange(it.uuid, atMinutes(day, r.startMin), atMinutes(day, r.endMin));
  };
  useLayoutEffect(() => {
    const pending = refocus.current;
    if (!pending) return;
    if (Date.now() > pending.until) {
      refocus.current = null;
      return;
    }
    // Only where the redraw took the focus away: never from a dialog the move
    // opened (a booked meeting asks first), and never from anything else.
    const lost = !document.activeElement || document.activeElement === document.body;
    const el = colsRef.current?.querySelector<HTMLElement>(`[data-event-uuid="${CSS.escape(pending.uuid)}"]`);
    if (!lost) return;
    // Past the days shown (the week's edge, or the day view's day), the block
    // is gone: the keyboard stays in the calendar, on its grid. The toast says
    // where the event went, with Undo.
    (el ?? scrollRef.current)?.focus({ preventScroll: !el });
    refocus.current = null;
  });

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
  const ghostLabel = ghost ? clockRange(atMinutes(days[ghost.day], ghost.startMin), atMinutes(days[ghost.day], ghost.endMin)) : "";

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
                data-touch-target=""
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
                    aria-label={`${it.isTask ? "Task" : "Event"}: ${it.title}${it.when ? `, ${it.when}` : ""}`}
                    className={cn("w-full", matches && !matches(it.title) && "opacity-25")}
                  >
                    {it.when ? <span className="shrink-0 text-micro font-[450] tabular-nums opacity-75">{it.when}</span> : null}
                    <span className={cn("line-clamp-2 min-w-0 break-words", it.done && "line-through decoration-ink-4")}>{it.title}</span>
                  </HueBlock>
                ))}
                {more > 0 && railOpen ? (
                  // Past the rail's three: the day's list, as the month's "+N more" opens.
                  // Its list is a chunk of its own (railMore.tsx); until it lands, the same "+N", inert.
                  <Rail.View
                    fallback={<span className="h-5 self-start rounded-sm px-1.5 text-meta font-medium text-ink-2">+{more}</span>}
                    render={(m) => <m.RailMore day={days[i]} items={items} hidden={more} onPick={(it, el) => (it.isTask ? onTaskClick(it.uuid) : onEventClick(it.uuid, el))} />}
                  />
                ) : more > 0 ? (
                  <button
                    type="button"
                    onClick={() => setRailOpen(true)}
                    data-touch-target=""
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
          <div
            ref={scrollRef}
            tabIndex={-1}
            data-week-scroll=""
            data-time-grid-scroll=""
            className="custom-scrollbar flex-1 overflow-y-auto overscroll-contain outline-none"
            // Caught on the way down: a block's own press stops there.
            onWheelCapture={moved}
            onTouchStartCapture={moved}
            onPointerDownCapture={moved}
            onKeyDownCapture={moved}
          >
            <div className="relative flex" style={{ height: `${24 * HOUR_HEIGHT}px` }}>
              {/* Hour gutter: labels on the line, the first hidden. */}
              <div className="shrink-0" style={{ width: GUTTER }}>
                {hours.map((h) => (
                  <div key={h} className="relative" style={{ height: `${HOUR_HEIGHT}px` }}>
                    {/* The hour beside now gives way to now's pill, on today's week only. */}
                    {h > 0 && (todayIndex < 0 || Math.abs(nowTopMin - h * 60) >= 20) ? (
                      <span className="absolute right-2 top-0 -translate-y-1/2 text-micro tabular-nums text-ink-3">
                        {clockHour(new Date(2000, 0, 1, h))}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              <div
                ref={colsRef}
                className={cn("relative flex flex-1", moving && (moving.kind === "move" ? "cursor-grabbing" : "cursor-ns-resize"))}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
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
                        data-hover-band=""
                        className="pointer-events-none absolute inset-x-0 z-[5] h-[14px] bg-brand/6"
                        style={{ transform: `translateY(${(hoverMin.min / 60) * HOUR_HEIGHT}px)` }}
                      >
                        <span className="absolute left-1.5 top-0 text-micro font-medium leading-[14px] tabular-nums text-brand-text">{clockTime(atMinutes(day, hoverMin.min))}</span>
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
                      const geo = isMoving ? { left: "2px", width: "calc(100% - 4px)" } : blockGeometry(it.col, it.cols, it.span);
                      const past = it.end < now;
                      const live = it.start <= now && now < it.end;
                      const time = clockRange(it.start, it.end);
                      const tag = isMoving ? (moving.kind === "move" ? `${format(days[moving.curDay], "EEE")} ${clockTime(atMinutes(days[moving.curDay], startMin))}` : durationLabel(endMin - startMin)) : null;
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
                                return;
                              }
                              if (it.movable) nudge(e, it, di);
                            }}
                            onDoubleClick={() => onEventOpen?.(it.uuid)}
                            style={{ top, height, left: geo.left, width: geo.width, ["--i" as string]: idx }}
                            className={cn(
                              "absolute z-10",
                              height >= 28 ? "py-1" : "justify-center py-0",
                              it.cols > 1 && "outline outline-[1.5px] outline-sheet",
                              revealing && !isMoving && "content-event-in",
                              it.movable && "cursor-grab",
                              // A move lifts the block; a resize stretches it where it is (CA-02).
                              isMoving && (moving.kind === "move" ? "calendar-lift" : "z-40 cursor-ns-resize"),
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
                                {it.title} <span className="font-[450] tabular-nums opacity-75">· {clockTime(it.start)}</span>
                              </span>
                            ) : (
                              <span className="truncate text-micro leading-3">
                                {it.title} <span className="font-[450] tabular-nums opacity-75">{clockTime(it.start)}</span>
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
                                  data-resize-grip="top"
                                  onPointerDown={(e) => onBlockPointerDown(e, it, di, "top")}
                                  className="absolute inset-x-0 top-0 flex h-1.5 cursor-ns-resize justify-center opacity-0 group-hover/hb:opacity-100 [@media(hover:none)]:hidden"
                                >
                                  <span className="mt-0.5 h-[3px] w-4 rounded-[2px] bg-hue-ink/40" />
                                </span>
                                <span
                                  aria-hidden="true"
                                  data-resize-grip="bottom"
                                  onPointerDown={(e) => onBlockPointerDown(e, it, di, "bottom")}
                                  className="absolute inset-x-0 bottom-0 flex h-1.5 cursor-ns-resize items-end justify-center opacity-0 group-hover/hb:opacity-100 [@media(hover:none)]:hidden"
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
                                {format(day, "EEE")} {clockTime(atMinutes(day, moving.curStart))}
                              </span>
                            </HueBlock>
                          );
                        })()
                      : null}

                    {/* The draft ghost: brand at 14 %, a brand bar, a dashed ring. */}
                    {ghost && ghost.day === di ? (
                      <div
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

              {/* Now: brand, with the time in the gutter, in the week that has
                  today. A week ahead drew it too, a 9:46 pill on a Tuesday
                  that hasn't come yet. */}
              {todayIndex >= 0 ? <NowLine top={(nowTopMin / 60) * HOUR_HEIGHT} gutter={GUTTER} columns={dayCount} todayIndex={todayIndex} now={now} /> : null}
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
                    <button type="button" onClick={onNewEvent} data-touch-target="" className="font-medium text-brand-text hover:underline">
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
  const geo = blockGeometry(it.col, it.cols, it.span);
  return (
    <div
      aria-hidden="true"
      data-drag-origin=""
      className={cn("pointer-events-none absolute rounded-md", dragPlaceholderClasses(it))}
      style={{ top, height, left: geo.left, width: geo.width }}
    />
  );
}

