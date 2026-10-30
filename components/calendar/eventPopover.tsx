"use client";

import { avatarSeed } from "@/lib/utils/getAvatarColor";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { format, formatDistanceStrict, isSameDay, parseISO } from "date-fns";
import { Calendar as CalendarIcon, Ellipsis, Moon, Pencil, Plane, Users, Video, X } from "@/lib/icons";
import { Popover, PopoverAnchor } from "@/components/ui/popover";
import { anchorTo } from "@/components/ui/anchor";
import { BesideBlockContent } from "@/components/ui/besideBlock";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { stayBehindConfirm } from "@/components/ui/overlayFocus";
import { MenuOnDemand } from "@/components/ui/menuOnDemand";
import { copyToClipboard } from "@/hooks/useCopyToClipboard";
import { IdentityMark } from "@/components/ui/graphics/IdentityMark";
import { HUE_CLASS } from "@/components/ui/graphics/hues";
import { displayNameOf } from "@/lib/personName";
import { cn } from "@/lib/utils/helpers/cn";
import { OWN_HUE, hueOf, kindOf } from "@/components/calendar/calendarTones";
import { taskGlyphStatus } from "@/components/calendar/HueBlock";
import { StatusGlyph } from "@/components/ui/graphics/glyphs";
import { GoogleMark } from "@/components/ui/graphics/GoogleMark";
import { isCampHue } from "@/lib/campHue";
import { allDayItem } from "@/components/calendar/calendarLayout";
import { allDayLastDay, placedByDates } from "@/lib/calendar/allDay";
import type { CalendarEventInterface } from "@/types/calendar";
import type { Answer } from "@/lib/calendar/eventsApi";
import { useEventCallActions } from "@/components/calendar/useEventCallActions";
import { dayAndTime } from "@/lib/utils/date/clock";
import { spanLabel } from "@/lib/calendar/spanLabel";
import { ownZoneLine } from "@/lib/calendar/ownZone";
import { browserTZ } from "@/lib/utils/timeZone";
import { eventCallChoice, eventCallOf, joinOffer } from "@/lib/calendar/joinLink";
import { GoingControl } from "@/components/calendar/rsvp/goingControl";
import { GuestFaces } from "@/components/calendar/rsvp/guestRow";
import { asksAnswer, eventGuests, guestsSummary } from "@/components/calendar/rsvp/eventGuests";
import { sendAnswer, type AnswerSender } from "@/components/calendar/rsvp/sendAnswer";
import { ReminderRow } from "@/components/calendar/rsvp/reminderRow";
import { usePost } from "@/hooks/usePost";
import { wantsNewTab } from "@/lib/liveEntity/follow";
import { workRoute } from "@/lib/work/route";

/**
 * Clicking an event opens this (content.md C12, owner decision 4): a 360 px
 * pop card beside the block, so the week you're planning stays in view; by a
 * block that leaves neither side its room (a Day view's event), under or over
 * it (BesideBlockContent). The full right panel is for editing: the pencil,
 * "Open" in the menu, or a double-click on the block. The pencil, Edit event,
 * opens it editing, as Google Calendar's does (V-34); the others open it to
 * read. On a phone the card is a sheet that fits it, and the full view is the
 * event's page.
 *
 * In the order STEP4_PLAN §4 #5 gives: the title, when, Join, the guests with
 * their answers, the calendar and organiser, the notes, and for a guest the
 * footer that asks "Going?".
 */
/** How an event opens in full: `edit` opens it editing (the card's pencil, Edit event). */
export interface OpenHow {
  edit?: boolean;
}

interface EventPopoverProps {
  event: CalendarEventInterface | null;
  anchor: HTMLElement | null;
  now: Date;
  onClose: () => void;
  /** Open the event in full, the right panel or a phone's page (to read, prep or find a better time), or editing. */
  onOpenFull: (uuid: string, how?: OpenHow) => void;
  /** Opens a task as the calendar opens one: a task block's card links to its task. */
  onOpenTask?: (uuid: string) => void;
  /** The reader, which tells a guest's card from the organiser's. */
  selfId?: string;
  /** A sheet, on a phone, rather than a card beside the block. */
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
  // Its own call (calendar B11), else the link in its notes.
  const call = eventCallOf(event, window.location.origin);
  const link = call?.join ?? null;
  const google = event.event_uuid.startsWith("gcal-");
  const guests = eventGuests(event, selfId);
  // Yours when you made it (or nobody is named: the calendar's own copy).
  const mine = !event.event_created_by || (!!selfId && event.event_created_by.user_uuid === selfId);
  const asks = asksAnswer(event, guests, selfId, when.tone === "ended");
  // On a calendar you subscribe to (B8): yours to see, changed only where it's published.
  const readOnly = !!event.event_read_only;
  // Its own time, where it keeps a zone you aren't in (calendar head 6).
  const ownZone = ownZoneLine(event, start, end, browserTZ());
  return { start, end, allDay, when, ownZone, link, call, join: joinOffer(link, start, end, now), google, notes: plainNotes(event.event_description), guests, mine, asks, readOnly };
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
  return sameDay ? `${format(info.start, "EEE d MMM")} · ${spanLabel(info.start, info.end)}` : dayAndTime(info.start, info.end);
}

export function EventPopover({ event, anchor, now, onClose, onOpenFull, onOpenTask, selfId, phone = false, askScope, mutateEvents, holdOpen = false }: EventPopoverProps) {
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

  // The block it opened from, or the block drawn in its place (a move, a
  // refetch): a block that left the page measures zeros (components/ui/anchor).
  const uuid = event?.event_uuid;
  const at = useMemo(
    () => ({ current: anchorTo(anchor, () => (uuid ? document.querySelector(`[data-calendar] [data-event-uuid="${CSS.escape(uuid)}"]`) : null)) }),
    [anchor, uuid],
  );

  if (phone) {
    return (
      <Drawer open={!!event} onOpenChange={close} detent="medium">
        {shown && info ? (
          <DrawerContent aria-describedby={undefined} data-event-card="" data-event-sheet="" onInteractOutside={stayBehindConfirm}>
            <EventCard event={shown} info={info} phone onClose={onClose} onOpenFull={onOpenFull} onOpenTask={onOpenTask} onAnswer={onAnswer} mutateEvents={mutateEvents} />
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
      <PopoverAnchor virtualRef={at} />
      <BesideBlockContent
        at={at.current}
        role="dialog"
        aria-labelledby={titleId}
        className="content-float w-[360px] rounded-xl bg-pop p-0 shadow-e3"
        data-event-popover=""
        data-event-card=""
        onInteractOutside={stayBehindConfirm}
        onCloseAutoFocus={(e) => {
          // Back to the block it opened from.
          e.preventDefault();
          (at.current.contextElement as HTMLElement | undefined)?.focus?.();
        }}
      >
        <EventCard event={event} info={info} titleId={titleId} onClose={onClose} onOpenFull={onOpenFull} onOpenTask={onOpenTask} onAnswer={onAnswer} mutateEvents={mutateEvents} />
      </BesideBlockContent>
    </Popover>
  );
}

/**
 * The card of the event open in the calendar, found among its events (as the
 * grid draws it, else as read), with its block marked open where it is drawn
 * now (HueBlock's data-[selected]), so the week isn't drawn for it (C3).
 */
export function OpenCard({ uuid, events, allEvents, ...rest }: Omit<EventPopoverProps, "event"> & { uuid?: string; events: CalendarEventInterface[]; allEvents: CalendarEventInterface[] }) {
  const event = uuid ? (events.find((e) => e.event_uuid === uuid) ?? allEvents.find((e) => e.event_uuid === uuid) ?? null) : null;
  const { anchor } = rest;
  useLayoutEffect(() => {
    const el = !uuid ? null : anchor?.isConnected ? anchor : document.querySelector(`[data-calendar] [data-event-uuid="${CSS.escape(uuid)}"]`);
    el?.setAttribute("data-selected", "true");
    return () => el?.removeAttribute("data-selected");
  }, [uuid, anchor]);
  return <EventPopover event={event} {...rest} />;
}

function EventCard({
  event,
  info,
  titleId,
  phone = false,
  onClose,
  onOpenFull,
  onOpenTask,
  onAnswer,
  mutateEvents,
}: {
  event: CalendarEventInterface;
  info: CardInfo;
  titleId?: string;
  phone?: boolean;
  onClose: () => void;
  onOpenFull: (uuid: string, how?: OpenHow) => void;
  onOpenTask?: (uuid: string) => void;
  onAnswer: SendAnswer;
  mutateEvents?: AnswerSender["mutateEvents"];
}) {
  const kind = kindOf(event);
  const others = info.guests.faces.filter((f) => !f.organiser);
  // Its own call is its organiser's to add and take off here (calendar B11),
  // as its edits are: never on a subscribed calendar's copy or Google's.
  const callChoice = eventCallChoice(event, { mayChange: info.mine && !info.readOnly, google: info.google, ended: info.when.tone === "ended" });
  const callActions = useEventCallActions(event.event_uuid, () => mutateEvents?.());
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
        ) : kind === "block" ? (
          <StatusGlyph status={taskGlyphStatus(event.event_task?.task_status)} size={12} className="mt-1 shrink-0" />
        ) : kind === "away" ? (
          <Plane className="mt-1 size-3 shrink-0 text-ink-3" aria-hidden="true" />
        ) : (
          <span aria-hidden="true" className={cn(HUE_CLASS[hueOf(event)], "mt-1 size-3 shrink-0 rounded-[3px] bg-hue")} />
        )}
        {/* The sheet is named by the title itself, which keeps its look. */}
        {phone ? <DrawerTitle asChild>{title}</DrawerTitle> : title}
        <div className="-mr-2 -mt-1 flex shrink-0 items-center" data-touch-group="">
          {/* A guest's copy isn't theirs to change: they answer it. */}
          {info.mine && !info.readOnly ? (
            <Button variant="ghost" size="icon-sm" aria-label="Edit event" onClick={() => onOpenFull(event.event_uuid, { edit: true })}>
              <Pencil />
            </Button>
          ) : null}
          <MenuOnDemand
            menu={(own) => (
              <DropdownMenuContent {...own} align="end" className="w-44">
                <DropdownMenuItem onSelect={() => onOpenFull(event.event_uuid)}>Open</DropdownMenuItem>
                {info.call ? <DropdownMenuItem onSelect={() => void copyToClipboard(info.call!.share, "Call link copied.")}>Copy call link</DropdownMenuItem> : null}
                {callChoice === "remove" ? <DropdownMenuItem onSelect={callActions.remove}>Remove call</DropdownMenuItem> : null}
              </DropdownMenuContent>
            )}
          >
            <Button variant="ghost" size="icon-sm" aria-label="More">
              <Ellipsis />
            </Button>
          </MenuOnDemand>
          <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
            <X />
          </Button>
        </div>
      </div>

      <p className="flex items-baseline gap-2 px-4 pl-[38px] text-ui-sm font-[450] text-ink">
        <span className="tabular-nums">{timeLine(info)}</span>
        <span className={cn("text-meta", info.when.tone === "now" ? "font-medium text-success-ink" : "text-ink-3")}>{info.when.text}</span>
      </p>
      {info.ownZone ? (
        <p className="px-4 pl-[38px] text-meta tabular-nums text-ink-2" data-own-zone="">
          {info.ownZone}
        </p>
      ) : null}

      {/* The card's first action, while there is a call to join
          (lib/calendar/joinLink): the primary from ten minutes before. */}
      {info.link && info.join ? (
        <div className="px-4 pt-3">
          <Button asChild size="sm" variant={info.join === "primary" ? "default" : "secondary"} className="w-full">
            {/* Its own call opens here in the app; a link in its notes, beside it. */}
            <a href={info.link} {...(info.call?.own ? {} : { target: "_blank", rel: "noopener noreferrer" })}>
              <Video />
              Join call
            </a>
          </Button>
        </div>
      ) : callChoice === "add" ? (
        <div className="px-4 pt-3">
          <Button size="sm" variant="secondary" className="w-full" busy={callActions.adding} onClick={() => void callActions.add()}>
            <Video />
            Add a call
          </Button>
        </div>
      ) : null}

      {/* One column the card's width: a long line wraps, never runs out of the card. */}
      <dl className="grid grid-cols-1 gap-0 px-4 pb-2 pt-3">
        {/* A task block: the task it is time for, where it stands, and its project (B1). */}
        {event.event_task ? (
          <div className="flex min-h-7 min-w-0 items-start gap-2.5" data-card-task="">
            <dt className="sr-only">Task</dt>
            <StatusGlyph status={taskGlyphStatus(event.event_task.task_status)} size={16} className="mt-1.5 shrink-0" />
            <dd className="min-w-0 flex-1 py-1 text-ui-sm text-ink-2">
              {event.event_task.task_name ? (
                <>
                  Time for{" "}
                  {/* The work itself: the task opens as the calendar opens one, and the card makes way. A new tab's click is the browser's. */}
                  <a
                    href={workRoute({ task: event.event_task.task_uuid })}
                    onClick={(e) => {
                      if (wantsNewTab(e) || !onOpenTask) return;
                      e.preventDefault();
                      onClose();
                      onOpenTask(event.event_task!.task_uuid);
                    }}
                    className="rounded-[4px] font-medium text-ink underline decoration-ink-4 underline-offset-[3px] outline-none transition-colors hover:decoration-ink-2 focus-visible:ring-2 focus-visible:ring-brand"
                    data-touch-target=""
                  >
                    {event.event_task.task_name}
                  </a>
                  {event.event_task.project_name ? <span className="text-ink-3"> · {event.event_task.project_name}</span> : null}
                </>
              ) : (
                <span className="text-ink-3">Time for a task you can no longer see</span>
              )}
            </dd>
          </div>
        ) : null}
        {others.length > 0 ? (
          <div className="flex min-h-7 min-w-0 items-start gap-2.5" data-card-guests="">
            <dt className="sr-only">Guests</dt>
            <Users className="mt-2 size-4 shrink-0 text-ink-3" aria-hidden="true" />
            <dd className="min-w-0 flex-1 py-1">
              <GuestFaces key={event.event_uuid} guests={info.guests.faces} summary={guestsSummary(info.guests, info.mine)} />
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
            {info.google ? "Google Calendar" : event.calendar_name || "OneCamp · Personal"}
            {info.google ? <GoogleMark className="size-3.5 shrink-0" /> : <IdentityMark hue={isCampHue(event.calendar_hue) ? event.calendar_hue : OWN_HUE} variant="dot" size={6} />}
          </dd>
        </div>
        {organiser && !info.readOnly ? (
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
        <div className={cn("border-t border-line px-4 py-2", phone && "sticky bottom-0 bg-pop")} data-card-footer="">
          <GoingControl answer={info.guests.mine} onAnswer={(a) => onAnswer(event, a)} touch={phone} />
        </div>
      ) : (
        <div className="flex items-center justify-end gap-1 border-t border-line px-3 py-2" data-card-footer="">
          <Button variant="ghost" size="xs" onClick={() => onOpenFull(event.event_uuid)}>
            Open details
          </Button>
        </div>
      )}
    </>
  );
}
