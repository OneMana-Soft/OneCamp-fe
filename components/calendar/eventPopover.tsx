"use client";

import { avatarSeed } from "@/lib/utils/getAvatarColor";
import { useCallback, useMemo, useState } from "react";
import { format, formatDistanceStrict, isSameDay, parseISO } from "date-fns";
import { Calendar as CalendarIcon, Ellipsis, Moon, Pencil, Plane, Users, Video, X } from "@/lib/icons";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IdentityMark } from "@/components/ui/graphics/IdentityMark";
import { HUE_CLASS } from "@/components/ui/graphics/hues";
import { displayNameOf } from "@/lib/personName";
import { cn } from "@/lib/utils/helpers/cn";
import { CALENDAR_HUE, hueOf, kindOf } from "@/components/calendar/calendarTones";
import { allDayItem } from "@/components/calendar/calendarLayout";
import { allDayLastDay, placedByDates } from "@/lib/calendar/allDay";
import type { CalendarEventInterface } from "@/types/calendar";
import type { Answer } from "@/lib/calendar/eventsApi";
import { clockRange, dayAndTime } from "@/lib/utils/date/clock";
import { joinLinkOf, joinOffer } from "@/lib/calendar/joinLink";
import { GoingControl } from "@/components/calendar/rsvp/goingControl";
import { GuestFaces } from "@/components/calendar/rsvp/guestFaces";
import { eventGuests, guestsSummary } from "@/components/calendar/rsvp/eventGuests";
import { sendAnswer, type AnswerSender } from "@/components/calendar/rsvp/sendAnswer";
import { ReminderRow } from "@/components/calendar/rsvp/reminderRow";
import { usePost } from "@/hooks/usePost";

/**
 * Clicking an event opens this (content.md C12, owner decision 4): a 360 px
 * pop card beside the block, so the week you're planning stays in view. The
 * full right panel is for editing: the pencil, "Open" in the menu, or a
 * double-click on the block. On a phone the card is the half sheet.
 *
 * In the order STEP4_PLAN §4 #5 gives: the title, when, Join, the guests with
 * their answers, the calendar and organiser, the notes, and for a guest the
 * footer that asks "Going?".
 */
interface EventPopoverProps {
  event: CalendarEventInterface | null;
  anchor: HTMLElement | null;
  now: Date;
  onClose: () => void;
  /** Open the event in the right panel (to edit, prep or find a better time). */
  onOpenFull: (uuid: string) => void;
  /** The reader, which tells a guest's card from the organiser's. */
  selfId?: string;
  /** The half sheet, on a phone, rather than a card beside the block. */
  phone?: boolean;
  /** Asks which events a guest's answer to one instance is for. */
  askScope?: AnswerSender["askScope"];
  /** The calendar's copy of its events, which shows an answer at once. */
  mutateEvents?: AnswerSender["mutateEvents"];
  /** Kept open while something it opened asks a question (which events an answer is for). */
  holdOpen?: boolean;
}

type SendAnswer = (event: CalendarEventInterface, answer: Answer) => Promise<boolean | null>;

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

/** What the card shows of an event, worked out once per event and minute. */
function cardInfo(event: CalendarEventInterface, now: Date, selfId: string | undefined) {
  // A Google all-day event by its dates, never its instants (CAL-BUG-2).
  const placed = placedByDates(event);
  const start = parseISO(placed.event_start_time);
  const end = parseISO(placed.event_end_time);
  const allDay = allDayItem(placed, start, end);
  const when = whenLabel(start, end, now);
  const link = joinLinkOf(event);
  const google = event.event_uuid.startsWith("gcal-");
  const guests = eventGuests(event, selfId);
  // Yours when you made it (or nobody is named: the calendar's own copy).
  const mine = !event.event_created_by || (!!selfId && event.event_created_by.user_uuid === selfId);
  // A guest answers while the event is still to come or under way, and only
  // where answers are kept (the one store sends them).
  const asks = !google && !mine && guests.answered && guests.mine !== undefined && when.tone !== "ended";
  return { start, end, allDay, when, link, join: joinOffer(link, start, end, now), google, notes: plainNotes(event.event_description), guests, mine, asks };
}

type CardInfo = ReturnType<typeof cardInfo>;

function timeLine(info: CardInfo): string {
  const sameDay = info.start.toDateString() === info.end.toDateString();
  // An all-day item's last day is the one before its end, counted in days:
  // a day the clocks change on is 23 or 25 hours long.
  const lastDay = allDayLastDay(info.start, info.end);
  if (info.allDay) {
    return isSameDay(info.start, lastDay) ? `${format(info.start, "EEE d MMM")} · All day` : `${format(info.start, "EEE d MMM")} – ${format(lastDay, "EEE d MMM")}`;
  }
  return sameDay ? `${format(info.start, "EEE d MMM")} · ${clockRange(info.start, info.end)}` : dayAndTime(info.start, info.end);
}

export function EventPopover({ event, anchor, now, onClose, onOpenFull, selfId, phone = false, askScope, mutateEvents, holdOpen = false }: EventPopoverProps) {
  const post = usePost();
  const onAnswer = useCallback<SendAnswer>((ev, a) => sendAnswer({ post, askScope, mutateEvents, selfId }, ev, a), [post, askScope, mutateEvents, selfId]);
  // The sheet keeps the event it showed while it slides away.
  const [kept, setKept] = useState(event);
  if (phone && event && event !== kept) setKept(event);
  const shown = event ?? (phone ? kept : null);
  const info = useMemo(() => (shown ? cardInfo(shown, now, selfId) : null), [shown, now, selfId]);
  const close = (open: boolean) => {
    if (!open && !holdOpen) onClose();
  };

  if (phone) {
    return (
      <Drawer open={!!event} onOpenChange={close} detent="half">
        {shown && info ? (
          <DrawerContent aria-describedby={undefined} data-event-card="" data-event-sheet="">
            <EventCard event={shown} info={info} phone onClose={onClose} onOpenFull={onOpenFull} onAnswer={onAnswer} mutateEvents={mutateEvents} />
          </DrawerContent>
        ) : null}
      </Drawer>
    );
  }

  if (!event || !info || !anchor) {
    return (
      <Popover open={false}>
        <PopoverAnchor />
      </Popover>
    );
  }
  const titleId = `event-popover-${event.event_uuid}`;
  return (
    <Popover open onOpenChange={close}>
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
        data-event-card=""
        onCloseAutoFocus={(e) => {
          // Back to the block it opened from.
          e.preventDefault();
          anchor?.focus?.();
        }}
      >
        <EventCard event={event} info={info} titleId={titleId} onClose={onClose} onOpenFull={onOpenFull} onAnswer={onAnswer} mutateEvents={mutateEvents} />
      </PopoverContent>
    </Popover>
  );
}

function EventCard({
  event,
  info,
  titleId,
  phone = false,
  onClose,
  onOpenFull,
  onAnswer,
  mutateEvents,
}: {
  event: CalendarEventInterface;
  info: CardInfo;
  titleId?: string;
  phone?: boolean;
  onClose: () => void;
  onOpenFull: (uuid: string) => void;
  onAnswer: SendAnswer;
  mutateEvents?: AnswerSender["mutateEvents"];
}) {
  const kind = kindOf(event);
  const others = info.guests.faces.filter((f) => !f.organiser);
  const organiser = event.event_created_by;
  // On the sheet, vaul's Title gives the heading its id: an id left undefined
  // here would take it away.
  const title = (
    <h2 {...(titleId ? { id: titleId } : {})} className="line-clamp-2 min-w-0 flex-1 text-heading text-ink">
      {event.event_title}
    </h2>
  );

  return (
    <>
      <div className="flex items-start gap-2.5 px-4 pb-2 pt-4">
        {kind === "focus" ? (
          <Moon className="mt-1 size-3 shrink-0 text-ink-3" aria-hidden="true" />
        ) : kind === "away" ? (
          <Plane className="mt-1 size-3 shrink-0 text-ink-3" aria-hidden="true" />
        ) : (
          <span aria-hidden="true" className={cn(HUE_CLASS[hueOf(event)], "mt-1 size-3 shrink-0 rounded-[3px] bg-hue")} />
        )}
        {/* The sheet is named by the title itself, which keeps its look. */}
        {phone ? <DrawerTitle asChild>{title}</DrawerTitle> : title}
        <div className="-mr-2 -mt-1 flex shrink-0 items-center" data-touch-group="">
          {/* A guest's copy isn't theirs to change: they answer it. */}
          {info.mine ? (
            <Button variant="ghost" size="icon-sm" aria-label="Edit event" onClick={() => onOpenFull(event.event_uuid)}>
              <Pencil />
            </Button>
          ) : null}
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
        <span className="tabular-nums">{timeLine(info)}</span>
        <span className={cn("text-meta", info.when.tone === "now" ? "font-medium text-success-ink" : "text-ink-3")}>{info.when.text}</span>
      </p>

      {/* The card's first action, while there is a call to join
          (lib/calendar/joinLink): the primary from ten minutes before. */}
      {info.link && info.join ? (
        <div className="px-4 pt-3">
          <Button asChild size="sm" variant={info.join === "primary" ? "default" : "secondary"} className="w-full">
            <a href={info.link} target="_blank" rel="noopener noreferrer">
              <Video />
              Join call
            </a>
          </Button>
        </div>
      ) : null}

      {/* One column the card's width: a long line wraps, never runs out of the card. */}
      <dl className="grid grid-cols-1 gap-0 px-4 pb-2 pt-3">
        {others.length > 0 ? (
          <div className="flex min-h-7 min-w-0 items-start gap-2.5" data-card-guests="">
            <dt className="sr-only">Guests</dt>
            <Users className="mt-2 size-4 shrink-0 text-ink-3" aria-hidden="true" />
            <dd className="min-w-0 flex-1 py-1">
              <GuestFaces guests={info.guests.faces} summary={guestsSummary(info.guests, info.mine)} />
            </dd>
          </div>
        ) : null}
        {/* Each person's own reminders (calendar A5), where the calendar keeps
            them, while there is something to be reminded of: not once it's
            over, nor for a guest who said no (nobody is reminded of those). */}
        {event.event_reminders && !info.google && info.when.tone !== "ended" && (info.mine || info.guests.mine !== "declined") ? (
          <div className="flex min-w-0" data-card-reminders="">
            <dt className="sr-only">Reminders</dt>
            <dd className="min-w-0">
              {/* Beside the row on a computer, never over the card's title; a sheet of its own on a phone. */}
              <ReminderRow event={event} mutateEvents={mutateEvents} phone={phone} side="left" />
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
        {organiser ? (
          <div className="flex min-h-7 items-center gap-2.5">
            <dt className="sr-only">Organiser</dt>
            <IdentityMark variant="avatar" size={16} id={avatarSeed(organiser)} label={displayNameOf(organiser) || "Someone"} />
            <dd className="truncate text-ui-sm text-ink-2">Organised by {info.mine ? "you" : displayNameOf(organiser) || "someone"}</dd>
          </div>
        ) : null}
      </dl>

      {info.notes ? <p className="line-clamp-4 whitespace-pre-line px-4 pb-3 pl-[38px] text-ui-sm text-ink-2">{info.notes}</p> : null}

      {info.asks ? (
        // On a phone the question stays at the sheet's foot while the rest scrolls.
        <div className={cn("border-t border-line px-4 py-2", phone && "sticky bottom-0 mt-auto bg-pop")} data-card-footer="">
          <GoingControl answer={info.guests.mine} onAnswer={(a) => onAnswer(event, a)} touch={phone} />
        </div>
      ) : (
        <div className={cn("flex items-center justify-end gap-1 border-t border-line px-3 py-2", phone && "mt-auto")} data-card-footer="">
          <Button variant="ghost" size="xs" onClick={() => onOpenFull(event.event_uuid)}>
            Open details
          </Button>
        </div>
      )}
    </>
  );
}
