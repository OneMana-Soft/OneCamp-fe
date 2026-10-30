"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { addDays, format, isSameDay, isWeekend, parseISO, startOfDay } from "date-fns";
import { cn } from "@/lib/utils/helpers/cn";
import { useStableRows } from "@/lib/ui/stableRows";
import { ChevronDown, Repeat } from "@/lib/icons";
import { SpotCalendar } from "@/components/ui/graphics/spots";
import { lazyView } from "@/lib/lazy/lazyView";
import { HueBlock, dragPlaceholderClasses, hueBlock } from "@/components/calendar/HueBlock";
import { useProjectHues } from "@/lib/projectHue";
import { NowLine, useMinute } from "@/components/calendar/NowLine";
import { kindOf, type CalendarItemLike } from "@/components/calendar/calendarTones";
import { atMinutes, clickRange, createRange, durationLabel, keyNudge, minutesAt, moveRange, resizeRange, DAY_MINUTES } from "@/lib/calendar/calendarDrag";
import type { CalendarEventInterface } from "@/types/calendar";
import type { TaskInfoInterface } from "@/types/task";
import type { ViewChoices } from "@/lib/calendar/choices";
import { clockHour, clockRange, clockTime } from "@/lib/utils/date/clock";
import { spanLabel } from "@/lib/calendar/spanLabel";
import { placedByDates } from "@/lib/calendar/allDay";
import { DEFAULT_VIEW_MINUTES, openingMinute } from "@/lib/calendar/openAt";
import { daySpan, daySpanWords } from "@/components/calendar/calendarLayout";
import { onDragCancel } from "@/lib/ui/dragCancel";
import { PRESS_LIFT, holdLifted, pressBecomes } from "@/lib/ui/pressLift";
import type { edgeScroller } from "@/lib/ui/edgeScroll";
import { useStableCallback } from "@/hooks/useStableCallback";
import { swallowReleaseClick } from "@/lib/ui/releaseClick";
import { once } from "@/lib/lazy/once";

/** The edge scroll's code (lib/ui/edgeScroll), a chunk of its own: off the calendar's first load, asked for by a press. */
let edgeScroll: { edgeScroller: typeof edgeScroller } | null = null;
const loadEdgeScroll = once(() => import("@/lib/ui/edgeScroll").then((m) => (edgeScroll = m)));
// A press that came while its chunk failed scrolls nothing; the next press asks again.
const askEdgeScroll = () => loadEdgeScroll().catch(() => undefined);

/** The rail's "+N" list, loaded when a day first has more than the rail holds. */
const Rail = lazyView(() => import("@/components/calendar/railMore"));

/** Other zones' columns (head 6): fetched only for someone who keeps one. */
const ZoneColumns = lazyView(() => import("@/components/calendar/zoneColumns"));

/** px per hour, comfortable: 15 minutes is 14 px (content.md C07). */
export const HOUR_HEIGHT = 56;
/** Compact's hour (15 minutes in 10 px), the least any density draws; fit's most. */
const COMPACT = 40;
const FIT_MOST = 144;
const GUTTER = 56;
/** An other zone's column, as wide as yours: its hours short ("12:30pm" fits). */
const ZONE_COL = 56;
/** Your hours' gutter and a column per other zone. */
export const gutterWidth = (otherZones: number) => GUTTER + otherZones * ZONE_COL;
/** Working hours: outside them the grid sits on sunken, so the day's shape reads. */
const WORK_START = 9;
const WORK_END = 18;
const MAX_RAIL_TRACKS = 3;

/**
 * Density (B1, gcal-2): the hour's height is one CSS variable on the week,
 * --cal-hour, and everything on the hours is drawn from it in calc(), so a
 * density chosen, or fit following the screen, moves the grid by CSS alone
 * and draws no block again. Fit: your working day (calendar A3; 9 to 6 for
 * someone who keeps no hours) fills the scroller, its start 8 px under the
 * top and its end over the foot (the hours' labels clear).
 */
const at = (min: number) => `calc(var(--cal-hour)*${+(min / 60).toFixed(4)})`;
const tall = (min: number, least: number) => `max(${at(min)} - 2px, ${least}px)`;
const FIT_AIR = 8;
const fitOf = (height: number, [from, to]: [number, number]) => Math.min(FIT_MOST, Math.max(COMPACT, Math.floor((height - 2 * FIT_AIR) / ((to - from) / 60))));
const workTop = (hour: number, [from]: [number, number]) => (from / 60) * hour - FIT_AIR;
/** Fit's last hour, so the next period's week opens at it. */
let fitHour = HOUR_HEIGHT;

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
  /** A date a repeating task comes due next (head 9): drawn with the repeat glyph, never carried onto the hours. */
  ahead?: boolean;
}

/** A draft on the grid: the ghost a drag or click drew, while its quick-create card is open. */
export interface CalendarDraft {
  start: Date;
  end: Date;
  allDay?: boolean;
}

type WorkWeek = Record<string, { start: string; end: string }[]>;

const minutesOf = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);

/** A day's minutes outside your working hours (calendar A3), else 9 to 18. Pure. */
export function offHours(day: Date, week?: WorkWeek | null): [number, number][] {
  if (!week) return [[0, WORK_START * 60], [WORK_END * 60, 1440]];
  const out: [number, number][] = [];
  let edge = 0;
  for (const s of [...(week[String(day.getDay())] ?? [])].sort((a, b) => minutesOf(a.start) - minutesOf(b.start))) {
    if (minutesOf(s.start) > edge) out.push([edge, minutesOf(s.start)]);
    edge = Math.max(edge, minutesOf(s.end));
  }
  if (edge < 1440) out.push([edge, 1440]);
  return out;
}

/** The working day Fit fills, in minutes: from the earliest of these days' hours to the latest, else 9 to 18. Pure. */
export function workSpan(days: Date[], week?: WorkWeek | null): [number, number] {
  const ranges = week ? days.flatMap((d) => week[String(d.getDay())] ?? []) : [];
  if (ranges.length === 0) return [WORK_START * 60, WORK_END * 60];
  return [Math.min(...ranges.map((r) => minutesOf(r.start))), Math.max(...ranges.map((r) => minutesOf(r.end)))];
}

interface WeekViewProps {
  workHours?: WorkWeek | null;
  /** Zones kept beside the reader's own (head 6): a column each. */
  zones?: { zone: string; label?: string }[];
  weekStart: Date;
  /** 7 for a week, 1 for a day. */
  dayCount?: number;
  /** The days to draw, in place of weekStart and dayCount: a hidden weekend left out. */
  days?: Date[];
  /** The week's number in the corner over the hours ("W44"). */
  weekLabel?: string;
  /** The hour's height: comfortable (the default), compact, or the working day fitting the screen. */
  density?: ViewChoices["density"];
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
  /** A task carried from the all-day lane onto the hours: block that time for it. */
  onTaskBlock?: (taskUUID: string, start: Date, end: Date) => void;
  /** Commit a move or a resize (the existing update call). */
  onEventChange?: (uuid: string, start: Date, end: Date) => void;
  /** Whether an event may be moved here (its organiser's). */
  canMove?: (uuid: string) => boolean;
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
  | { kind: "create"; day: number; pressMin: number; curMin: number; moved: boolean; touch: boolean }
  // A task carried from the all-day lane: lifted as a block is, an hour about the pointer.
  | {
      kind: "task";
      uuid: string;
      title: string;
      pressX: number;
      pressY: number;
      touch: boolean;
      held: boolean;
      active: boolean;
      over: boolean;
      curDay: number;
      curStart: number;
      curEnd: number;
    }
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

export const WeekView = memo(function WeekView({
  weekStart,
  dayCount = 7,
  days: daysGiven,
  weekLabel,
  density,
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
  onTaskBlock,
  onEventChange,
  canMove,
  matches,
  rail,
  loading = false,
  onNewEvent,
  onSlotClick,
  workHours,
  zones = [],
}: WeekViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const days = useMemo(() => daysGiven ?? Array.from({ length: dayCount }, (_, i) => addDays(startOfDay(weekStart), i)), [daysGiven, weekStart, dayCount]);
  // The hour's height (density); in fit, measured from the scroller as it
  // changes, so the working day of the days drawn fills it.
  const [spanFrom, spanTo] = useMemo(() => workSpan(days, workHours), [days, workHours]);
  const [fit, setFit] = useState(fitHour);
  const hour = density === "compact" ? COMPACT : density === "fit" ? fit : HOUR_HEIGHT;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (density !== "fit" || !el) return;
    const measure = () => el.clientHeight > 0 && setFit((fitHour = fitOf(el.clientHeight, [spanFrom, spanTo])));
    measure();
    const seen = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    seen?.observe(el);
    return () => seen?.disconnect();
  }, [density, spanFrom, spanTo]);
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
          { uuid: e.event_uuid, title: e.event_title, event_uuid: e.event_uuid, event_is_focus: !!e.event_is_focus, event_is_away: !!e.event_is_away, event_hue: e.event_hue, calendar_hue: e.calendar_hue, event_task: e.event_task },
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
                ahead: !!t.task_ahead,
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
  // same way. Fit opens on the working day it fills.
  const openedAt = useRef(new Date());
  const userMoved = useRef(false);
  const openedTop = useRef<number | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || userMoved.current) return;
    const t = openedAt.current;
    const todayIdx = days.findIndex((d) => isSameDay(d, t));
    const viewMin = el.clientHeight > 0 ? (el.clientHeight / hour) * 60 : DEFAULT_VIEW_MINUTES;
    const min = openingMinute(timedByDay, todayIdx, wallMinutes(t), viewMin);
    const top = density === "fit" ? workTop(hour, [spanFrom, spanTo]) : Math.max(0, Math.floor(min / 60) * hour - 12);
    if (top === openedTop.current) return;
    const smooth = openedTop.current !== null && !reducedMotion();
    if (el.scrollTo) el.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
    else el.scrollTop = top;
    openedTop.current = top;
    // The hour as this render drew it; a new hour moves the view below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timedByDay, days]);
  const moved = () => {
    userMoved.current = true;
  };
  // A new hour's height keeps the time at the top of the view where it was
  // (as last scrolled: a shorter grid has already cut scrollTop); fit, when
  // chosen or as the screen changes until the person scrolls, shows the
  // working day.
  const drawnAt = useRef({ hour, density });
  const scrolled = useRef(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const was = drawnAt.current;
    drawnAt.current = { hour, density };
    if (!el || (was.hour === hour && was.density === density)) return;
    el.scrollTop = density === "fit" && (was.density !== density || !userMoved.current) ? workTop(hour, [spanFrom, spanTo]) : (scrolled.current / was.hour) * hour;
    // The working day moves the view only with the hour it gives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hour, density]);

  const blank = !loading && allDayByDay.every((d) => d.length === 0) && timedByDay.every((d) => d.length === 0);
  const todayIndex = days.findIndex((d) => isSameDay(d, now));
  const nowTopMin = now.getHours() * 60 + now.getMinutes();
  const gutter = gutterWidth(zones.length);
  const single = days.length === 1;
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
  // The hour as drawn: the 24 hours' column measured, whatever the density.
  const minuteAt = (clientY: number): number => {
    const r = colsRef.current?.getBoundingClientRect();
    return r ? minutesAt(clientY - r.top, r.height / 24 || hour) : 0;
  };
  // A press is kept here alone until it shows (a create that has moved, a
  // block lifted or stretched): a tap draws no week, at its press or at its
  // release (each was a draw of the whole week, C3's trace).
  //
  // From its press, a drag holds the pointer with the columns and ends
  // without landing on Esc (the block goes back where it started), when the
  // browser takes the pointer back (a scroll on a touch screen), or when the
  // columns lose it without a pointerup. Nothing is sent.
  //
  // Near the grid's top or bottom edge a live drag scrolls it (CA-03; the one
  // edge scroll, lib/ui/edgeScroll: 48 px under a pointer, 64 px under a
  // finger, up to 18 px a frame), and goes on from wherever the hours now lie
  // under the still pointer. It starts with the drag's first live move, which
  // comes before the drag is drawn, and ends with the drag. Its code is a
  // chunk of its own, asked for by the press (askEdgeScroll).
  const unbind = useRef<(() => void) | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const edge = useRef<ReturnType<typeof edgeScroller> | null>(null);
  const setD = (d: Drag | null, show = true) => {
    dragRef.current = d;
    if (d) {
      void askEdgeScroll();
      unbind.current ??= onDragCancel(() => {
        clearTimeout(holdTimer.current);
        if (dragRef.current) setD(null);
      }, colsRef.current);
    } else {
      unbind.current?.();
      unbind.current = null;
      edge.current?.stop();
      edge.current = null;
      pointer.current = null;
    }
    if (show || !d) setDrag(d);
  };
  useEffect(
    () => () => {
      unbind.current?.();
      edge.current?.stop();
    },
    [],
  );

  const onColumnPointerDown = (e: React.PointerEvent<HTMLDivElement>, day: number) => {
    if (e.button !== 0 || !onDraft) return;
    colsRef.current?.setPointerCapture?.(e.pointerId);
    const m = minuteAt(e.clientY);
    setD({ kind: "create", day, pressMin: m, curMin: m, moved: false, touch: e.pointerType === "touch" }, false);
  };

  // The columns hold the pointer, so the carry reaches the hours' handlers.
  const onLanePointerDown = (e: React.PointerEvent<HTMLElement>, it: AllDayItem) => {
    if (e.button !== 0 || !it.isTask || !onTaskBlock) return;
    e.stopPropagation();
    colsRef.current?.setPointerCapture?.(e.pointerId);
    const touch = e.pointerType === "touch";
    setD({ kind: "task", uuid: it.uuid, title: it.title, pressX: e.clientX, pressY: e.clientY, touch, held: false, active: false, over: false, curDay: 0, curStart: 0, curEnd: 60 }, false);
    clearTimeout(holdTimer.current);
    if (touch) {
      holdTimer.current = setTimeout(() => {
        const cur = dragRef.current;
        if (cur && cur.kind === "task" && !cur.active) setD({ ...cur, held: true, active: true });
      }, PRESS_LIFT.hold);
    }
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
    // A grip stretches the block at once; a press on it moves nothing until it lifts.
    setD(d, kind !== "move");
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
    if (d.kind === "task") {
      if (!d.active) {
        const now = pressBecomes({ x: d.pressX, y: d.pressY, touch: d.touch, held: d.held }, x, y);
        if (now === "press") return null;
        if (now === "scroll") {
          clearTimeout(holdTimer.current);
          setD(null);
          return null;
        }
      }
      const g = scrollRef.current?.getBoundingClientRect();
      const c = colsRef.current?.getBoundingClientRect();
      const over = !!g && !!c && y >= g.top && y <= g.bottom && x >= c.left && x <= c.right;
      const r = moveRange(0, 60, m - 30);
      const curDay = columnAt(x);
      if (!d.active || over !== d.over || curDay !== d.curDay || r.startMin !== d.curStart) {
        setD({ ...d, active: true, over, curDay, curStart: r.startMin, curEnd: r.endMin });
      }
      return { touch: d.touch };
    }
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
    const r = d.kind === "move" ? moveRange(d.startMin, d.endMin, m - d.pressMin) : resizeRange(d.startMin, d.endMin, d.kind, m);
    const curDay = d.kind === "move" ? columnAt(x) : d.curDay;
    // Within the quarter hour it is in, nothing is drawn again.
    if (!d.active || moved !== d.moved || curDay !== d.curDay || r.startMin !== d.curStart || r.endMin !== d.curEnd) {
      setD({ ...d, active: true, moved, curDay, curStart: r.startMin, curEnd: r.endMin });
    }
    return { touch: d.touch };
  };

  const placeAgain = useStableCallback(() => {
    const p = pointer.current;
    if (p) place(p.x, p.y);
  });

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
    if (grid && grid.scrollHeight > grid.clientHeight) follow(grid, e.clientX, e.clientY, live.touch);
  };

  // A move before the edge scroll's chunk is in follows once it lands, while the drag goes on.
  const follow = (grid: HTMLElement, x: number, y: number, touch: boolean) => {
    if (!edgeScroll) return void askEdgeScroll().then(() => dragRef.current && follow(grid, x, y, touch));
    (edge.current ??= edgeScroll.edgeScroller(grid, placeAgain)).follow(x, y, touch);
  };

  const onPointerUp = () => {
    clearTimeout(holdTimer.current);
    const d = dragRef.current;
    setD(null);
    if (!d) return;
    if (d.kind === "task") {
      // A tap opens the task.
      if (d.active && d.over) onTaskBlock?.(d.uuid, atMinutes(days[d.curDay], d.curStart), atMinutes(days[d.curDay], d.curEnd));
      else if (!d.active) onTaskClick(d.uuid);
      return;
    }
    if (d.kind === "create") {
      const r = d.moved ? createRange(d.pressMin, d.curMin) : clickRange(d.pressMin);
      const draftRange = { start: atMinutes(days[d.day], r.startMin), end: atMinutes(days[d.day], r.endMin) };
      // The draft's sheet rises a frame after a finger's release. On a slow
      // phone that frame comes before the tap's click, which then lands on the
      // sheet and closes it (V-50; staged with V-38, dropped when a quiet run
      // passed): swallowed, as an event's tap is.
      if (d.touch) swallowReleaseClick();
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
    if (d.touch && d.held && !d.moved && onEventMenu) {
      onEventMenu(d.uuid, d.el);
      return;
    }
    // The click a finger's release is followed by lands on the sheet this
    // opens and closes it (V-38): swallowed, as a long press's is.
    if (d.touch) swallowReleaseClick();
    onEventClick(d.uuid, d.el);
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

  // Stable handlers and items, so the blocks stay drawn while the week redraws.
  const actDown = useStableCallback(onBlockPointerDown);
  const actClick = useStableCallback((uuid: string, el: HTMLElement) => onEventClick(uuid, el));
  const actOpen = useStableCallback((uuid: string) => onEventOpen?.(uuid));
  const actNudge = useStableCallback(nudge);
  const act = useMemo<BlockActions>(() => ({ down: actDown, click: actClick, open: actOpen, nudge: actNudge }), [actDown, actClick, actOpen, actNudge]);
  // Each block's item kept while it reads the same: a read redraws only the blocks it changed.
  const blocks = useMemo(() => timedByDay.flatMap((d, di) => d.map((it) => ({ di, it }))), [timedByDay]);
  const kept = useStableRows(blocks, (b) => `${b.di} ${b.it.uuid}`, sameBlock);
  const columns = timedByDay.length;
  const stableDays = useMemo(() => {
    const out = Array.from({ length: columns }, (): TimedItem[] => []);
    for (const b of kept) out[b.di].push(b.it);
    return out;
  }, [kept, columns]);

  // What the ghost shows: a live create drag, or the draft held for its card.
  const ghost = (() => {
    if (drag?.kind === "task") return drag.active && drag.over ? { day: drag.curDay, startMin: drag.curStart, endMin: drag.curEnd } : null;
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

  const moving = drag && drag.kind !== "create" && drag.kind !== "task" && drag.active ? drag : null;

  return (
    <div className="flex h-full overflow-hidden" style={{ ["--cal-hour" as string]: `${hour}px` }}>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Day headers: 56 px, sticky. Today's date in a brand ring. */}
        <div className="sticky top-0 z-20 flex border-b border-line bg-sheet">
          {/* Other zones' names; yours under the week number. */}
          {zones.length > 0 ? <ZoneColumns.View fallback={<div className="shrink-0" style={{ width: zones.length * ZONE_COL }} />} render={(m) => <m.ZoneNames zones={zones} width={ZONE_COL} />} /> : null}
          <div
            className={cn("flex shrink-0 flex-col justify-end pb-1.5 text-micro font-medium tabular-nums text-ink-3", zones.length > 0 ? "items-end pr-2" : "items-center")}
            style={{ width: GUTTER }}
            data-week-number={weekLabel ? "" : undefined}
          >
            {weekLabel}
            {zones.length > 0 ? <ZoneColumns.View fallback={null} render={(m) => <m.OwnZoneName />} /> : null}
          </div>
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
                    <span aria-hidden="true" className="calendar-plus" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* All-day rail: 32 px plus 24 px per extra track, three at most, then "+N". */}
        <div className="relative flex border-b border-line-2 bg-sheet" data-all-day-rail="">
          <div className="relative flex shrink-0 items-start justify-end gap-0.5 pr-2 pt-2 text-micro text-ink-3" style={{ width: gutter }}>
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
                data-weekend={isWeekend(days[i]) || undefined}
                className={cn("flex flex-1 flex-col gap-0.5 border-l border-line px-1 py-[5px]", !single && "min-w-[90px]", isWeekend(days[i]) && "bg-sunken")}
                style={{ minHeight: 32 + (railShown - 1) * 24 }}
              >
                {shown.map((it) => (
                  <HueBlock
                    key={`${it.uuid}-${i}`}
                    item={it}
                    variant="chip"
                    onPointerDown={it.isTask && !it.ahead && onTaskBlock ? (e) => onLanePointerDown(e, it) : undefined}
                    onClick={(e) => (it.isTask ? (e.detail === 0 || !onTaskBlock || it.ahead) && onTaskClick(it.uuid) : onEventClick(it.uuid, e.currentTarget))}
                    aria-label={`${it.isTask ? (it.ahead ? "Repeating task, comes due" : "Task") : "Event"}: ${it.title}${it.when ? `, ${it.when}` : ""}`}
                    data-task-ahead={it.ahead || undefined}
                    className={cn("w-full", matches && !matches(it.title) && "opacity-25")}
                  >
                    {it.when ? <span className="shrink-0 text-micro font-[450] tabular-nums">{it.when}</span> : null}
                    {it.ahead ? <Repeat className="size-3 shrink-0" aria-hidden="true" /> : null}
                    <span className={cn(it.when ? "min-w-0 truncate" : "line-clamp-2 min-w-0 break-words", it.done && "line-through decoration-ink-4")}>{it.title}</span>
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
            onScroll={(e) => void (scrolled.current = e.currentTarget.scrollTop)}
          >
            <div className="relative flex h-[calc(var(--cal-hour)*24)]">
              {zones.length > 0 ? (
                <ZoneColumns.View
                  fallback={<div className="shrink-0" style={{ width: zones.length * ZONE_COL }} />}
                  render={(m) => <m.ZoneHours zones={zones} day={days[Math.max(todayIndex, 0)]} hours={hours} width={ZONE_COL} />}
                />
              ) : null}
              {/* Hour gutter: labels on the line, the first hidden. */}
              <div className="shrink-0" style={{ width: GUTTER }}>
                {hours.map((h) => (
                  <div key={h} className="relative h-[var(--cal-hour)]">
                    {/* The hour beside now gives way to now's pill, on today's week only; on paper, with no pill, it prints (calendar.css). */}
                    {h > 0 ? (
                      <span
                        data-beside-now={(todayIndex >= 0 && Math.abs(nowTopMin - h * 60) < 20) || undefined}
                        className="absolute right-2 top-0 -translate-y-1/2 text-micro tabular-nums text-ink-3 data-[beside-now]:invisible"
                      >
                        {clockHour(new Date(2000, 0, 1, h))}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              <div
                ref={colsRef}
                data-reveal={revealing || undefined}
                data-dragging={moving ? "" : undefined}
                className={cn("group/cols relative flex flex-1", moving && (moving.kind === "move" ? "cursor-grabbing" : "cursor-ns-resize"))}
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
                    {/* Outside working hours: the weekend's shade, so "not working" reads one way. */}
                    {offHours(day, workHours).map(([from, to]) => (
                      <div key={from} data-off-hours="" aria-hidden="true" className="pointer-events-none absolute inset-x-0 bg-sunken" style={{ top: at(from), height: at(to - from) }} />
                    ))}
                    {/* Hour hairlines, and a dashed half-hour line at half strength. */}
                    {hours.map((h) => (
                      <div key={h} className="pointer-events-none relative h-[var(--cal-hour)] border-b border-line">
                        <span data-half-hour="" aria-hidden="true" className="absolute inset-x-0 top-1/2 border-t border-dashed border-line opacity-50" />
                      </div>
                    ))}

                    {/* The 15-minute band under the pointer, with its time. */}
                    {!drag && hoverMin?.day === di && onDraft ? (
                      <div
                        aria-hidden="true"
                        data-hover-band=""
                        className="pointer-events-none absolute inset-x-0 z-[5] h-[calc(var(--cal-hour)/4)] bg-brand/6"
                        style={{ transform: `translateY(${at(hoverMin.min)})` }}
                      >
                        <span className="absolute left-1.5 top-0 text-micro font-medium leading-[14px] tabular-nums text-brand-text">{clockTime(atMinutes(day, hoverMin.min))}</span>
                      </div>
                    ) : null}

                    {/* Timed events */}
                    {stableDays[di].map((it, idx) => (
                      <TimedBlock
                        key={it.uuid}
                        it={it}
                        di={di}
                        idx={idx}
                        past={it.end < now}
                        live={it.start <= now && now < it.end}
                        dim={!!matches && !matches(it.title)}
                        lift={moving?.uuid === it.uuid && moving.day === di ? moving : undefined}
                        days={days}
                        act={act}
                      />
                    ))}

                    {/* The draft ghost: brand at 14 %, a brand bar, a dashed ring. */}
                    {ghost && ghost.day === di ? (
                      <div
                        data-calendar-ghost=""
                        className="pointer-events-none absolute inset-x-[2px] z-30 overflow-hidden rounded-md border border-dashed border-brand bg-brand/14 py-1 pl-[9px] pr-1.5"
                        style={{ top: at(ghost.startMin), height: tall(ghost.endMin - ghost.startMin, 12) }}
                      >
                        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-brand" />
                        <span key={ghostLabel} className="content-ghost-pulse block origin-left text-meta font-semibold tabular-nums text-[color-mix(in_oklab,var(--brand-text)_85%,var(--ink))]">
                          {ghostLabel}
                        </span>
                        {drag?.kind === "task" ? <span className="block truncate text-meta font-medium text-[color-mix(in_oklab,var(--brand-text)_85%,var(--ink))]">{drag.title}</span> : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              {/* Now: brand, with the time in the gutter, in the week that has
                  today. A week ahead drew it too, a 9:46 pill on a Tuesday
                  that hasn't come yet. */}
              {todayIndex >= 0 ? <NowLine top={at(nowTopMin)} gutter={gutter} columns={days.length} todayIndex={todayIndex} now={now} /> : null}
            </div>
          </div>
          {/* A week or a day with nothing in it says so, small, in the middle of
              its days in view, clear of the hours; the slots under it still take a click. */}
          {blank && (
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 flex flex-col items-center justify-center gap-2" style={{ left: gutter }} data-calendar-blank="">
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
});

interface BlockActions {
  down: (e: React.PointerEvent<HTMLElement>, it: TimedItem, day: number, pressed: "move" | "top" | "bottom") => void;
  click: (uuid: string, el: HTMLElement) => void;
  open: (uuid: string) => void;
  nudge: (e: React.KeyboardEvent, it: TimedItem, di: number) => void;
}

/** An item's JSON, once per item: what "the same" is for a block. */
const jsonOf = new WeakMap<object, string>();
const json = (o: object) => {
  let j = jsonOf.get(o);
  if (j === undefined) jsonOf.set(o, (j = JSON.stringify(o)));
  return j;
};
const sameBlock = (a: { it: TimedItem }, b: { it: TimedItem }) => json(a.it) === json(b.it);

/**
 * One timed block, drawn again only when it changes (a drag drew every block
 * on every move). Lifted, it stays the element pressed, drawn over the day it
 * is carried to, so its card and its menu open from it.
 */
const TimedBlock = memo(function TimedBlock({
  it,
  di,
  idx,
  past,
  live,
  dim,
  lift,
  days,
  act,
}: {
  it: TimedItem;
  di: number;
  idx: number;
  past: boolean;
  live: boolean;
  dim: boolean;
  lift?: Extract<Drag, { kind: "move" | "top" | "bottom" }>;
  days: Date[];
  act: BlockActions;
}) {
  const startMin = lift ? lift.curStart : it.topMin;
  const endMin = lift ? lift.curEnd : it.endMin;
  // Carried, it spans a column, moved by whole columns (each with its 1 px rule).
  const geo = lift ? { left: lift.curDay === di ? "2px" : `calc(${lift.curDay - di} * (100% + 1px) + 2px)`, width: "calc(100% - 4px)" } : blockGeometry(it.col, it.cols, it.span);
  // Carried or stretched, it says when it would land, as Google's blocks do;
  // a stretch keeps its length beside it, which the range doesn't spell out.
  const to = days[lift ? lift.curDay : di];
  const start = lift ? atMinutes(to, startMin) : it.start;
  const time = spanLabel(start, lift ? atMinutes(to, endMin) : it.end);
  const tag = lift && lift.kind !== "move" ? durationLabel(endMin - startMin) : null;
  // One component a block: the block's element, drawn here rather than by
  // HueBlock, which is a second (fluid-10). The project hues are read here.
  useProjectHues();
  const block = hueBlock({
    as: "div",
    role: "button",
    tabIndex: 0,
    item: it,
    variant: "block",
    past,
    live,
    "aria-label": `${it.title}, ${time}`,
    // Under 45 minutes its words may be cut at some density: all of them on hover.
    title: endMin - startMin < 45 ? `${it.title} · ${time}` : undefined,
    onPointerDown: (e) => act.down(e, it, di, "move"),
    onClick: (e) => {
      // A movable block's pointer click is handled on pointer up.
      if (e.detail === 0 || !it.movable) act.click(it.uuid, e.currentTarget as HTMLElement);
    },
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        act.click(it.uuid, e.currentTarget as HTMLElement);
        return;
      }
      if (it.movable) act.nudge(e, it, di);
    },
    onDoubleClick: () => act.open(it.uuid),
    style: { top: at(startMin), height: tall(endMin - startMin, 14), left: geo.left, width: geo.width, ["--i" as string]: idx },
    className: cn(
      "cal-block absolute",
      it.cols > 1 && "outline outline-[1.5px] outline-sheet",
      it.movable && "cursor-grab",
      // A move lifts the block; a resize stretches it where it is (CA-02).
      lift ? (lift.kind === "move" ? "calendar-lift" : "z-40 cursor-ns-resize") : "z-10 group-data-[reveal]/cols:content-event-in",
      kindOf(it) === "focus" && live && "focus-running",
      dim && "opacity-25",
    ),
    children: (
      <>
        {/* As much as its height holds, at any density (calendar.css). */}
        <span className="cal-block-text">
          <span className="cal-block-title">{it.title}</span> <span className="cal-block-at">{clockTime(start)}</span>
          <span className="cal-block-when">{time}</span>
        </span>
        {tag ? (
          <span key={tag} className="content-ghost-pulse absolute bottom-1 right-1 rounded-[5px] bg-pop px-1 text-micro font-semibold tabular-nums text-ink shadow-e1">
            {tag}
          </span>
        ) : null}
        {it.movable ? (
          <>
            <span
              aria-hidden="true"
              data-resize-grip="top"
              onPointerDown={(e) => act.down(e, it, di, "top")}
              className="absolute inset-x-0 top-0 flex h-1.5 cursor-ns-resize justify-center opacity-0 group-hover/hb:opacity-100 group-data-[dragging]/cols:hidden [@media(hover:none)]:hidden"
            >
              <span className="mt-0.5 h-[3px] w-4 rounded-[2px] bg-hue-ink/40" />
            </span>
            <span
              aria-hidden="true"
              data-resize-grip="bottom"
              onPointerDown={(e) => act.down(e, it, di, "bottom")}
              className="absolute inset-x-0 bottom-0 flex h-1.5 cursor-ns-resize items-end justify-center opacity-0 group-hover/hb:opacity-100 group-data-[dragging]/cols:hidden [@media(hover:none)]:hidden"
            >
              <span className="mb-0.5 h-[3px] w-4 rounded-[2px] bg-hue-ink/40" />
            </span>
          </>
        ) : null}
      </>
    ),
  });
  return (
    <>
      {lift ? <Origin it={it} /> : null}
      {block}
    </>
  );
});

/** Where a moved block came from: a dashed outline in its hue. */
function Origin({ it }: { it: TimedItem }) {
  const geo = blockGeometry(it.col, it.cols, it.span);
  return (
    <div
      aria-hidden="true"
      data-drag-origin=""
      className={cn("pointer-events-none absolute rounded-md", dragPlaceholderClasses(it))}
      style={{ top: at(it.topMin), height: tall(it.endMin - it.topMin, 14), left: geo.left, width: geo.width }}
    />
  );
}

