"use client";

import { useMemo, useState, type ReactNode } from "react";
import { addDays, addMonths, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { Check, ChevronLeft, ChevronRight, Ellipsis, Link2, Pin, PinOff, Plus } from "@/lib/icons";
import { DayCell } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IdentityMark } from "@/components/ui/graphics/IdentityMark";
import { HUE_CLASS } from "@/components/ui/graphics/hues";
import type { CampHue } from "@/lib/campHue";
import { cn } from "@/lib/utils/helpers/cn";
import { dayKey, WEEK_STARTS_ON } from "@/components/calendar/calendarLayout";

/**
 * What the second sidebar held, in one popover (content.md C01, C03, C04,
 * C19; owner decision 5): the mini month, the calendar list, the booking
 * pages and Google Calendar. Wide screens may pin it as a rail.
 */

/** The mini month (C03): the shared day cell, today a ring, the week in view a band. */
export function MiniMonth({
  anchor,
  view,
  hasItems,
  onPick,
}: {
  anchor: Date;
  view: "month" | "week" | "day" | "agenda";
  hasItems: (day: Date) => boolean;
  onPick: (day: Date) => void;
}) {
  const [month, setMonth] = useState(() => startOfMonth(anchor));
  const [dir, setDir] = useState<1 | -1>(1);
  const today = new Date();
  const weeks = useMemo(() => {
    const first = startOfWeek(startOfMonth(month), { weekStartsOn: WEEK_STARTS_ON });
    return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)));
  }, [month]);
  const weekOf = startOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON });
  const go = (d: 1 | -1) => {
    setDir(d);
    setMonth((m) => (d > 0 ? addMonths(m, 1) : subMonths(m, 1)));
  };
  return (
    <div className="select-none" data-mini-month="">
      <div className="mb-1.5 flex items-center justify-between pl-1">
        <span className="text-ui-sm font-semibold text-ink">{format(month, "MMMM yyyy")}</span>
        <div className="flex gap-0.5">
          <Button variant="ghost" size="icon-xs" aria-label="Previous month" onClick={() => go(-1)}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label="Next month" onClick={() => go(1)}>
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5 pb-0.5 text-center text-micro font-medium text-ink-3" aria-hidden="true">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="flex h-6 items-center justify-center">
            {d}
          </span>
        ))}
      </div>
      <div key={month.toISOString()} className={cn("grid gap-0.5", dir > 0 ? "content-period-next" : "content-period-prev")}>
        {weeks.map((week, wi) => {
          const band = view === "week" && isSameDay(week[0], weekOf);
          return (
            <div key={wi} className={cn("grid grid-cols-7 gap-0.5 rounded-lg", band && "bg-press")} data-range-band={band || undefined}>
              {week.map((day) => (
                <DayCell
                  key={dayKey(day)}
                  date={day}
                  today={isSameDay(day, today)}
                  selected={view === "day" && isSameDay(day, anchor)}
                  outside={!isSameMonth(day, month)}
                  dot={hasItems(day)}
                  onClick={() => onPick(day)}
                  aria-label={`${format(day, "EEEE d MMMM")}${hasItems(day) ? ", has events" : ""}`}
                  className="mx-auto"
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface CalendarRow {
  id: string;
  name: string;
  hue?: CampHue;
  /** Project marks instead of a hue (Assigned tasks). */
  marks?: string[];
  on: boolean;
  count?: number;
  onToggle: () => void;
  onOnly?: () => void;
  menu?: ReactNode;
}

/** A calendar's row (C04): a colour checkbox, the name, how many this week. */
export function CalendarListRow({ row }: { row: CalendarRow }) {
  return (
    <div className="group/row flex h-8 items-center gap-2.5 rounded-lg px-1.5 hover:bg-hover" data-calendar-row={row.id}>
      <button
        type="button"
        role="checkbox"
        aria-checked={row.on}
        aria-label={row.name}
        onClick={row.onToggle}
        className={cn(
          row.hue ? HUE_CLASS[row.hue] : "",
          "flex size-4 shrink-0 items-center justify-center rounded-[5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1",
          row.hue
            ? row.on
              ? "bg-hue text-white"
              : "ring-[1.5px] ring-inset ring-hue"
            : row.on
              ? "bg-ink-2 text-sheet"
              : "ring-[1.5px] ring-inset ring-line-3",
        )}
      >
        {row.on ? <Check className="size-3 animate-spring" aria-hidden="true" /> : null}
      </button>
      <button type="button" onClick={row.onToggle} className="min-w-0 flex-1 truncate text-left text-ui font-[450] text-ink outline-none">
        {row.name}
      </button>
      {row.marks?.length ? (
        <span className="flex items-center gap-0.5" aria-hidden="true">
          {row.marks.map((m) => (
            <IdentityMark key={m} id={m} variant="square" size={10} />
          ))}
        </span>
      ) : null}
      {row.count !== undefined ? <span className="text-meta tabular-nums text-ink-3 group-hover/row:hidden">{row.count} this week</span> : null}
      {row.onOnly || row.menu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={`${row.name} options`} className="hidden group-hover/row:inline-flex data-[state=open]:inline-flex [@media(hover:none)]:inline-flex">
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {row.onOnly ? <DropdownMenuItem onSelect={row.onOnly}>Show only this</DropdownMenuItem> : null}
            {row.menu}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

/** The popover's (or the pinned rail's) body. */
export function CalendarsPanel({
  anchor,
  view,
  hasItems,
  onPick,
  rows,
  bookingCount,
  onBookingPages,
  googleConnected,
  onConnectGoogle,
  onDisconnectGoogle,
  busy,
  pinned,
  onTogglePin,
  canPin,
}: {
  anchor: Date;
  view: "month" | "week" | "day" | "agenda";
  hasItems: (day: Date) => boolean;
  onPick: (day: Date) => void;
  rows: CalendarRow[];
  bookingCount?: number;
  onBookingPages: () => void;
  googleConnected: boolean;
  onConnectGoogle: () => void;
  onDisconnectGoogle: () => void;
  busy?: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
  canPin?: boolean;
}) {
  return (
    <div className="flex flex-col" data-calendars-panel="">
      <div className="relative">
        <MiniMonth anchor={anchor} view={view} hasItems={hasItems} onPick={onPick} />
        {canPin && onTogglePin ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={pinned ? "Unpin the calendars" : "Pin the calendars as a rail"}
            onClick={onTogglePin}
            className="absolute -top-0.5 right-14"
          >
            {pinned ? <PinOff /> : <Pin />}
          </Button>
        ) : null}
      </div>
      <h2 className="mt-3 px-1.5 pb-1 text-meta font-medium text-ink-2">My calendars</h2>
      <div className="grid">
        {rows.map((r) => (
          <CalendarListRow key={r.id} row={r} />
        ))}
      </div>
      <div className="my-2 h-px bg-line" />
      <button
        type="button"
        onClick={onBookingPages}
        className="flex h-8 items-center gap-2.5 rounded-lg px-1.5 text-left text-ui text-ink outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand"
      >
        <Link2 className="size-4 text-ink-3" aria-hidden="true" />
        <span className="flex-1">Booking pages</span>
        {bookingCount ? <span className="text-meta tabular-nums text-ink-3">{bookingCount}</span> : null}
        <ChevronRight className="size-3.5 text-ink-4" aria-hidden="true" />
      </button>
      {googleConnected ? (
        <button
          type="button"
          onClick={onDisconnectGoogle}
          disabled={busy}
          className="flex h-8 items-center gap-2.5 rounded-lg px-1.5 text-left text-ui text-ink-2 outline-none hover:bg-hover hover:text-danger-ink focus-visible:ring-2 focus-visible:ring-brand"
        >
          <GoogleGlyph />
          Disconnect Google Calendar
        </button>
      ) : (
        <button
          type="button"
          onClick={onConnectGoogle}
          disabled={busy}
          className="flex h-8 items-center gap-2.5 rounded-lg px-1.5 text-left text-ui text-ink outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand"
        >
          <GoogleGlyph />
          <span className="flex-1">Connect Google Calendar</span>
          <Plus className="size-3.5 text-ink-3" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** Google's "G", in its own colours: a brand mark, so it keeps them. */
function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
      <path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9z" />
      <path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6z" />
    </svg>
  );
}
