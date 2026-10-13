"use client";

import { useMemo } from "react";
import { differenceInMinutes, format, formatDistanceStrict, isSameDay, parseISO } from "date-fns";
import { Calendar as CalendarIcon, Ellipsis, Moon, Pencil, Plane, Users, Video, X } from "@/lib/icons";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IdentityMark } from "@/components/ui/graphics/IdentityMark";
import { HUE_CLASS } from "@/components/ui/graphics/hues";
import { displayNameOf } from "@/lib/personName";
import { shortTime } from "@/lib/utils/date/shortDate";
import { cn } from "@/lib/utils/helpers/cn";
import { CALENDAR_HUE, hueOf, kindOf } from "@/components/calendar/calendarTones";
import { allDayItem } from "@/components/calendar/calendarLayout";
import { allDayLastDay, placedByDates } from "@/lib/calendar/allDay";
import type { CalendarEventInterface } from "@/types/calendar";
import { dayAndTime } from "@/lib/utils/date/dayAndTime";

/**
 * Clicking an event opens this (content.md C12, owner decision 4): a 360 px
 * pop card beside the block, so the week you're planning stays in view. The
 * full right panel is for editing: the pencil, "Open" in the menu, or a
 * double-click on the block.
 */
interface EventPopoverProps {
  event: CalendarEventInterface | null;
  anchor: HTMLElement | null;
  now: Date;
  onClose: () => void;
  /** Open the event in the right panel (to edit, prep or find a better time). */
  onOpenFull: (uuid: string) => void;
}

/** The first link in an event's notes: a call to join. */
export function joinLinkOf(event: Pick<CalendarEventInterface, "event_description">): string | null {
  const m = (event.event_description || "").match(/https?:\/\/[^\s"'<>]+/);
  return m ? m[0] : null;
}

/** Notes as plain text (they're stored as rich text). */
function plainNotes(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** "in 2 hours", "now", "ended". */
export function whenLabel(start: Date, end: Date, now: Date): { text: string; tone: "soon" | "now" | "ended" } {
  if (now >= start && now < end) return { text: "now", tone: "now" };
  if (now >= end) return { text: "ended", tone: "ended" };
  return { text: `in ${formatDistanceStrict(start, now, { roundingMethod: "floor" })}`, tone: "soon" };
}

function guestLine(names: string[]): string {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} other${names.length - 2 === 1 ? "" : "s"}`;
}

export function EventPopover({ event, anchor, now, onClose, onOpenFull }: EventPopoverProps) {
  const open = !!event && !!anchor;
  const info = useMemo(() => {
    if (!event) return null;
    // A Google all-day event by its dates, never its instants (CAL-BUG-2).
    const placed = placedByDates(event);
    const start = parseISO(placed.event_start_time);
    const end = parseISO(placed.event_end_time);
    const allDay = allDayItem(placed, start, end);
    const when = whenLabel(start, end, now);
    const link = joinLinkOf(event);
    const minutesToStart = differenceInMinutes(start, now);
    const google = event.event_uuid.startsWith("gcal-");
    return { start, end, allDay, when, link, joinLive: !!link && minutesToStart <= 10 && now < end, google, notes: plainNotes(event.event_description) };
  }, [event, now]);

  if (!event || !info) {
    return (
      <Popover open={false}>
        <PopoverAnchor />
      </Popover>
    );
  }
  const kind = kindOf(event);
  const titleId = `event-popover-${event.event_uuid}`;
  const guests = event.event_participants ?? [];
  const names = guests.map((g) => displayNameOf(g) || "Someone");
  const sameDay = info.start.toDateString() === info.end.toDateString();
  // An all-day item's last day is the one before its end, counted in days:
  // a day the clocks change on is 23 or 25 hours long.
  const lastDay = allDayLastDay(info.start, info.end);
  const time = info.allDay
    ? isSameDay(info.start, lastDay)
      ? `${format(info.start, "EEE d MMM")} · All day`
      : `${format(info.start, "EEE d MMM")} – ${format(lastDay, "EEE d MMM")}`
    : sameDay
      ? `${format(info.start, "EEE d MMM")} · ${shortTime(info.start)} – ${shortTime(info.end)}`
      : dayAndTime(info.start, info.end);

  return (
    <Popover open={open} onOpenChange={(o) => !o && onClose()}>
      <PopoverAnchor virtualRef={{ current: { getBoundingClientRect: () => anchor?.getBoundingClientRect() ?? new DOMRect() } }} />
      <PopoverContent
        role="dialog"
        aria-labelledby={titleId}
        side="right"
        align="start"
        sideOffset={12}
        collisionPadding={12}
        className="content-float w-[360px] rounded-xl bg-pop p-0 shadow-e3"
        data-event-popover=""
        onCloseAutoFocus={(e) => {
          // Back to the block it opened from.
          e.preventDefault();
          anchor?.focus?.();
        }}
      >
        <div className="flex items-start gap-2.5 px-4 pb-2 pt-4">
          {kind === "focus" ? (
            <Moon className="mt-1 size-3 shrink-0 text-ink-3" aria-hidden="true" />
          ) : kind === "away" ? (
            <Plane className="mt-1 size-3 shrink-0 text-ink-3" aria-hidden="true" />
          ) : (
            <span aria-hidden="true" className={cn(HUE_CLASS[hueOf(event)], "mt-1 size-3 shrink-0 rounded-[3px] bg-hue")} />
          )}
          <h2 id={titleId} className="line-clamp-2 min-w-0 flex-1 text-heading text-ink">
            {event.event_title}
          </h2>
          <div className="-mr-2 -mt-1 flex shrink-0 items-center">
            <Button variant="ghost" size="icon-sm" aria-label="Edit event" onClick={() => onOpenFull(event.event_uuid)}>
              <Pencil />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="More">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onSelect={() => onOpenFull(event.event_uuid)}>Open</DropdownMenuItem>
                {info.link ? (
                  <DropdownMenuItem
                    onSelect={() => {
                      void navigator.clipboard?.writeText(info.link!).catch(() => {});
                    }}
                  >
                    Copy call link
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
              <X />
            </Button>
          </div>
        </div>

        <p className="flex items-baseline gap-2 px-4 pl-[38px] text-ui-sm font-[450] text-ink">
          <span className="tabular-nums">{time}</span>
          <span className={cn("text-meta", info.when.tone === "now" ? "font-medium text-success-ink" : "text-ink-3")}>{info.when.text}</span>
        </p>

        {info.link ? (
          <div className="px-4 pt-3">
            {info.joinLive ? (
              <Button asChild size="sm" className="w-full">
                <a href={info.link} target="_blank" rel="noopener noreferrer">
                  <Video />
                  Join call
                </a>
              </Button>
            ) : (
              <Button asChild size="sm" variant="secondary" className="w-full">
                <a href={info.link} target="_blank" rel="noopener noreferrer">
                  <Video />
                  Join call · starts {info.when.text}
                </a>
              </Button>
            )}
          </div>
        ) : null}

        <dl className="grid gap-0 px-4 pb-2 pt-3">
          {guests.length > 0 ? (
            <div className="flex min-h-7 items-center gap-2.5">
              <dt className="sr-only">Guests</dt>
              <Users className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
              <dd className="flex min-w-0 items-center gap-2 text-ui-sm text-ink">
                <span className="flex shrink-0 -space-x-1.5">
                  {guests.slice(0, 3).map((g) => (
                    <IdentityMark key={g.user_uuid} variant="avatar" size={22} id={g.user_uuid} label={displayNameOf(g) || "Someone"} className="ring-2 ring-pop" />
                  ))}
                </span>
                <span className="truncate">{guestLine(names)}</span>
              </dd>
            </div>
          ) : null}
          <div className="flex min-h-7 items-center gap-2.5">
            <dt className="sr-only">Calendar</dt>
            <CalendarIcon className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
            <dd className="flex items-center gap-1.5 text-ui-sm text-ink">
              {info.google ? "Google Calendar" : "OneCamp · Personal"}
              <IdentityMark hue={info.google ? CALENDAR_HUE.google : CALENDAR_HUE.onecamp} variant="dot" size={6} />
            </dd>
          </div>
          {event.event_created_by ? (
            <div className="flex min-h-7 items-center gap-2.5">
              <dt className="sr-only">Created by</dt>
              <IdentityMark variant="avatar" size={16} id={event.event_created_by.user_uuid} label={displayNameOf(event.event_created_by) || "Someone"} />
              <dd className="truncate text-ui-sm text-ink-2">Created by {displayNameOf(event.event_created_by) || "someone"}</dd>
            </div>
          ) : null}
        </dl>

        {info.notes ? <p className="line-clamp-4 whitespace-pre-line px-4 pb-3 pl-[38px] text-ui-sm text-ink-2">{info.notes}</p> : null}

        <div className="flex items-center justify-end gap-1 border-t border-line px-3 py-2">
          <Button variant="ghost" size="xs" onClick={() => onOpenFull(event.event_uuid)}>
            Open details
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
