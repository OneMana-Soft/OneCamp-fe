"use client";

import { Fragment, memo, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { addDays, format, getDaysInMonth, isSameDay, isWeekend, parseISO, startOfWeek, type Day } from "date-fns";
import { cn } from "@/lib/utils/helpers/cn";
import { DAY_CELL_BASE, DAY_CELL_TODAY } from "@/components/ui/dayCell";
import { HUE_CLASS } from "@/components/ui/graphics/hues";
import { hueBlock } from "@/components/calendar/HueBlock";
import { OWN_HUE, kindOf } from "@/components/calendar/calendarTones";
import { dayKey, dayListTime } from "@/components/calendar/calendarLayout";
import type { MonthItem } from "@/components/calendar/monthView";

/**
 * The year (B1, gcal-2; Google's Year, Y or 6): twelve months, each day
 * shaded by how much is on it (your events and every calendar shown, a
 * project's included, and tasks on the day they're due), with the days you
 * are away outlined. Hovering or focusing a day lists what is on it; a day
 * opens its day view, a month's name its month.
 *
 * One component draws the year: its days are plain buttons in the shared day
 * cell's look (components/ui/dayCell), so switching to it draws a handful of
 * components (fluid-10), and the list a day shows is a card of its own,
 * drawn without the year drawing again.
 */

/** How busy a day reads: nothing, 1, 2 or 3, 4 or 5, 6 and more. Pure. */
export function heatOf(count: number): 0 | 1 | 2 | 3 | 4 {
  return count <= 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 5 ? 3 : 4;
}

/** What a day holds in the year: what's on it, a task only on the day it's due. Pure. */
export function yearItems(byDay: ReadonlyMap<string, MonthItem[]>, day: Date): MonthItem[] {
  return (byDay.get(dayKey(day)) || []).filter((it) => !it.isTask || isSameDay(parseISO(it.event_end_time), day));
}

// The calendar's own hue (sun), its tint stronger with each step; the busiest
// days in its strong cut, ink on it. A hover darkens a day in both themes: more
// hue on light paper, less on dark, where the hue is the light end. Every
// number reads at 4.5:1 or more, hovered too (DESIGN-BUILD-22, 27 Oct: the
// busiest day's hue ink read 4.0:1 and less). Literal classes, so the
// stylesheet keeps them.
const HEAT = [
  "",
  "bg-[color-mix(in_oklab,var(--hue-tint)_45%,var(--sheet))] text-hue-ink hover:bg-[color-mix(in_oklab,var(--hue-tint)_65%,var(--sheet))]",
  "bg-[color-mix(in_oklab,var(--hue-tint)_80%,var(--sheet))] text-hue-ink hover:bg-hue-tint",
  "bg-hue-tint text-hue-ink font-semibold hover:bg-[color-mix(in_oklab,var(--hue)_30%,var(--hue-tint))]",
  "bg-[color-mix(in_oklab,var(--hue)_40%,var(--hue-tint))] text-ink font-semibold hover:bg-[color-mix(in_oklab,var(--hue)_50%,var(--hue-tint))] dark:hover:bg-[color-mix(in_oklab,var(--hue)_32%,var(--hue-tint))]",
] as const;
const AWAY = "after:pointer-events-none after:absolute after:inset-0.5 after:rounded-md after:border after:border-dashed after:border-line-3 after:content-['']";

interface YearViewProps {
  /** Any day of the year shown. */
  year: Date;
  byDay: ReadonlyMap<string, MonthItem[]>;
  /** Today's key (dayKey): a new day draws the year again, a new minute doesn't. */
  today: string;
  weekStartsOn: Day;
  onDay: (day: Date) => void;
  onMonth: (first: Date) => void;
}

export const YearView = memo(function YearView({ year, byDay, today, weekStartsOn, onDay, onMonth }: YearViewProps) {
  const y = year.getFullYear();
  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, m) => {
        const first = new Date(y, m, 1);
        // The month's days after the blanks before its first, in the week's order.
        const lead = (first.getDay() - weekStartsOn + 7) % 7;
        return { first, lead, days: Array.from({ length: getDaysInMonth(first) }, (_, d) => new Date(y, m, d + 1)) };
      }),
    [y, weekStartsOn],
  );
  const initials = useMemo(() => Array.from({ length: 7 }, (_, i) => format(addDays(startOfWeek(year, { weekStartsOn }), i), "EEEEE")), [year, weekStartsOn]);
  // The one day a Tab lands on: today in this year, else the date shown.
  const tabDay = today.startsWith(`${y}-`) ? today : dayKey(year);
  const root = useRef<HTMLDivElement>(null);
  const card = useRef<(at: HTMLElement | null) => void>(() => {});
  const dayOf = (el: HTMLElement) => parseISO(el.dataset.yearDay!);

  // Arrows go a day or a week, within the year.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-year-day]");
    const by = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!el || !by) return;
    e.preventDefault();
    root.current?.querySelector<HTMLElement>(`[data-year-day="${dayKey(addDays(dayOf(el), by))}"]`)?.focus();
  };
  const near = (target: EventTarget) => (target as HTMLElement).closest?.<HTMLElement>("[data-year-day]") ?? null;

  return (
    <div
      ref={root}
      className="relative mx-auto max-w-[1180px] px-6 pb-10 pt-4"
      data-year={y}
      onKeyDown={onKeyDown}
      onPointerOver={(e) => card.current(near(e.target))}
      onPointerLeave={() => card.current(null)}
      onFocus={(e) => card.current(near(e.target))}
      onBlur={() => card.current(null)}
    >
      <div className="mb-3 flex items-center justify-end gap-1.5 text-micro text-ink-3" aria-hidden="true">
        Quiet
        {HEAT.map((h, i) => (
          <span key={i} className={cn(HUE_CLASS[OWN_HUE], "size-3 rounded-[3px] border border-line", h)} />
        ))}
        Busy
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(236px,1fr))] gap-x-8 gap-y-6">
        {months.map(({ first, lead, days }) => (
          <section key={first.getMonth()} aria-label={format(first, "MMMM yyyy")} data-year-month={first.getMonth() + 1}>
            <button
              type="button"
              onClick={() => onMonth(first)}
              className="mb-1 rounded-md px-1 text-ui font-semibold text-ink outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand"
            >
              {format(first, "MMMM")}
            </button>
            <div className="grid grid-cols-7 gap-0.5 text-center text-micro font-medium text-ink-3" aria-hidden="true">
              {initials.map((d, i) => (
                <span key={i} className="flex h-6 items-center justify-center">
                  {d}
                </span>
              ))}
            </div>
            <div className={cn("grid grid-cols-7 gap-0.5", HUE_CLASS[OWN_HUE])}>
              {lead ? <span style={{ gridColumn: `span ${lead}` }} /> : null}
              {days.map((day) => {
                const key = dayKey(day);
                const items = yearItems(byDay, day);
                const away = items.some((it) => kindOf(it) === "away");
                const heat = heatOf(items.length);
                return (
                  <button
                    key={key}
                    type="button"
                    data-year-day={key}
                    data-heat={heat || undefined}
                    data-away={away || undefined}
                    tabIndex={key === tabDay ? 0 : -1}
                    aria-current={key === today ? "date" : undefined}
                    aria-label={`${format(day, "EEEE d MMMM")}: ${items.length ? `${items.length} ${items.length === 1 ? "item" : "items"}` : "nothing on"}${away ? ", away" : ""}`}
                    onClick={() => onDay(day)}
                    className={cn(DAY_CELL_BASE, "mx-auto", !heat && isWeekend(day) && "text-ink-3", HEAT[heat], key === today && DAY_CELL_TODAY, away && AWAY)}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <DayCard bind={card} root={root} byDay={byDay} today={today} />
    </div>
  );
});

/**
 * What a day holds, beside it while it is hovered or focused: five at most,
 * then how many more. A component of its own, so showing it draws only it.
 */
function DayCard({ bind, root, byDay, today }: { bind: RefObject<(at: HTMLElement | null) => void>; root: RefObject<HTMLDivElement | null>; byDay: ReadonlyMap<string, MonthItem[]>; today: string }) {
  const [at, setAt] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    bind.current = (el) => setAt((cur) => (cur === el ? cur : el));
  }, [bind]);
  if (!at || !root.current) return null;
  const day = parseISO(at.dataset.yearDay!);
  const items = yearItems(byDay, day);
  const box = at.getBoundingClientRect();
  const frame = root.current.getBoundingClientRect();
  const left = Math.max(0, Math.min(box.left - frame.left - 104, frame.width - 248));
  // Under the day, or over it where the screen ends too soon below.
  const over = window.innerHeight - box.bottom < 240;
  return (
    <div
      aria-hidden="true"
      data-year-card=""
      className="content-float pointer-events-none absolute z-30 w-[248px] rounded-xl bg-pop p-1.5 shadow-e3"
      style={{ left, top: over ? box.top - frame.top - 6 : box.bottom - frame.top + 6, transform: over ? "translateY(-100%)" : undefined }}
    >
      <p className={cn("px-1.5 pb-1 pt-0.5 text-ui-sm font-semibold", dayKey(day) === today ? "text-brand-text" : "text-ink")}>{format(day, "EEE d MMM")}</p>
      {items.length ? (
        <div className="grid gap-0.5">
          {items.slice(0, 5).map((it) => (
            <Fragment key={it.event_uuid}>
              {hueBlock({
                as: "div",
                item: it,
                variant: "row",
                className: "w-full",
                children: (
                  <>
                    <span className="min-w-0 flex-1 truncate">{it.event_title}</span>
                    {!it.isTask ? <span className="shrink-0 text-meta font-[450] tabular-nums">{dayListTime(it, day)}</span> : null}
                  </>
                ),
              })}
            </Fragment>
          ))}
          {items.length > 5 ? <p className="px-1.5 pt-0.5 text-meta font-medium text-ink-3">{`+${items.length - 5} more`}</p> : null}
        </div>
      ) : (
        <p className="px-1.5 pb-1 text-ui-sm text-ink-3">Nothing on</p>
      )}
    </div>
  );
}

export default YearView;
