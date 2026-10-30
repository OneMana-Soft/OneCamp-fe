"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { addDays, addMonths, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { ArrowDownToLine, ArrowUpDown, Check, ChevronLeft, ChevronRight, Ellipsis, Globe, Link2, Pin, PinOff, Plug, Plus } from "@/lib/icons";
import { dayCell } from "@/components/ui/dayCell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HUE_CLASS } from "@/components/ui/graphics/hues";
import type { CampHue } from "@/lib/campHue";
import { cn } from "@/lib/utils/helpers/cn";
import { dayKey, WEEK_STARTS_ON } from "@/components/calendar/calendarLayout";
import { ProjectTile } from "@/components/ui/graphics/ProjectTile";
import { Progress } from "@/components/ui/progress";
import { googleSyncLine, googleSyncNext, useGoogleSync } from "@/lib/calendar/googleSync";
import { SaysLoadFailure } from "@/lib/http/loadFailure";
import { GoogleMark } from "@/components/ui/graphics/GoogleMark";
import { OWN_HUE } from "@/components/calendar/calendarTones";
import { PeoplePicker, type PickedPerson } from "@/components/common/peoplePicker";
import { apiErrorMessage } from "@/lib/utils/apiError";
import { lazyView } from "@/lib/lazy/lazyView";
import { CAMP_SWATCHES } from "@/components/ui/campSwatches";
import { calendarListUrl, type CalendarView } from "@/lib/calendar/calendarList";
import type { CalendarView as ShownView } from "@/components/calendar/calendarApp";
import { refreshSubscription, subscriptionWords, unsubscribe, useSubscriptions } from "@/lib/calendar/subscriptions";
import { useSWRConfig } from "swr";
import { teammateCalendar } from "@/lib/calendar/otherCalendars";
import { usePost } from "@/hooks/usePost";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import type { KeyedMutator } from "swr";
import type { GetEventsResponse } from "@/types/calendar";

// The panel's dialogs, each a chunk of its own; the calendar holds them open (onDialog).
const ImportExportPart = lazyView(() => import("@/components/calendar/importExport/importExportDialog"));
const SharePart = lazyView(() => import("@/components/calendar/sharing/shareCalendarDialog"));
const FeedPart = lazyView(() => import("@/components/calendar/sharing/feedDialog"));
const SubscribePart = lazyView(() => import("@/components/calendar/sharing/subscribeDialog"));


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
  view: ShownView;
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
        <div className="flex gap-0.5" data-touch-group="24">
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
          const band = (view === "week" || view === "custom") && isSameDay(week[0], weekOf);
          return (
            <div key={wi} className={cn("grid grid-cols-7 gap-0.5 rounded-lg", band && "bg-press")} data-range-band={band || undefined}>
              {/* Elements, not 42 DayCell components: the day view draws them on each switch to it. */}
              {week.map((day) => (
                <Fragment key={dayKey(day)}>
                  {dayCell({
                    date: day,
                    today: isSameDay(day, today),
                    selected: view === "day" && isSameDay(day, anchor),
                    outside: !isSameMonth(day, month),
                    dot: hasItems(day),
                    onClick: () => onPick(day),
                    "aria-label": `${format(day, "EEEE d MMMM")}${hasItems(day) ? ", has events" : ""}`,
                    className: "mx-auto",
                  })}
                </Fragment>
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
  /** Its source's mark beside its name (Google's G). */
  mark?: ReactNode;
  on: boolean;
  count?: number;
  /** Why a calendar read from an address couldn't be read, said in place of its count (B8). */
  warning?: string;
  /** Its events couldn't be loaded: said in place of its count, which would read as free (F2). */
  failed?: boolean;
  onToggle: () => void;
  onOnly?: () => void;
  menu?: ReactNode;
}

/** What a week's items are counted by: the calendar's own count of them (calendarApp's weekCount). */
type WeekCount = (keep: (i: { isTask?: boolean; event_uuid: string; calendar_hue?: string }) => boolean) => number;

/**
 * Your own rows, first under My calendars (A6): your calendar's events,
 * Google's when it is connected, and the tasks assigned to you, each shown
 * or hidden among the other calendars' choices (hidden). Built here, in the
 * panel's chunk, from what the calendar knows.
 */
export function ownRows(o: {
  hidden: string[];
  others?: OtherCalendars;
  google: boolean;
  weekCount: WeekCount;
  tasks: { task_project?: { project_uuid?: string } | null }[];
}): CalendarRow[] {
  const own = (id: string) => ({ on: !o.hidden.includes(id), onToggle: () => o.others?.toggle(id), onOnly: () => o.others?.only(id) });
  return [
    { id: "onecamp", name: "Personal", hue: OWN_HUE, count: o.weekCount((i) => !i.isTask && !i.event_uuid.startsWith("gcal-") && !i.calendar_hue), ...own("onecamp") },
    ...(o.google ? [{ id: "google", name: "Google Calendar", mark: <GoogleMark className="size-3.5 shrink-0" />, count: o.weekCount((i) => i.event_uuid.startsWith("gcal-")), ...own("google") }] : []),
    {
      id: "tasks",
      name: "Assigned tasks",
      count: o.weekCount((i) => !!i.isTask),
      marks: [...new Set(o.tasks.map((t) => t.task_project?.project_uuid).filter(Boolean) as string[])].slice(0, 3),
      ...own("tasks"),
    },
  ];
}

/** A calendar's row (C04): a colour checkbox, the name, how many this week. */
export function CalendarListRow({ row }: { row: CalendarRow }) {
  return (
    <div className="group/row flex h-8 items-center gap-2.5 rounded-lg px-1.5 hover:bg-hover pointer-coarse:h-11" data-calendar-row={row.id}>
      <button
        type="button"
        role="checkbox"
        aria-checked={row.on}
        aria-label={row.name}
        onClick={row.onToggle}
        data-touch-target=""
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
      <button type="button" onClick={row.onToggle} className="min-w-0 flex-1 truncate rounded-sm text-left text-ui font-[450] text-ink">
        {row.name}
      </button>
      {row.mark}
      {row.marks?.length ? (
        <span className="flex items-center gap-0.5" aria-hidden="true">
          {row.marks.map((m) => (
            <ProjectTile key={m} id={m} size={14} />
          ))}
        </span>
      ) : null}
      {row.warning ? (
        <span className="shrink-0 text-meta text-danger-ink group-hover/row:hidden group-focus-within/row:hidden" title={row.warning} data-calendar-warning="">
          Couldn&apos;t be read
        </span>
      ) : row.failed ? (
        <span className="shrink-0 text-meta text-ink-3 group-hover/row:hidden group-focus-within/row:hidden" data-calendar-unloaded="">
          Couldn&apos;t load
          <SaysLoadFailure />
        </span>
      ) : row.count !== undefined ? (
        <span className="text-meta tabular-nums text-ink-3 group-hover/row:hidden group-focus-within/row:hidden">{row.count} this week</span>
      ) : null}
      {row.onOnly || row.menu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={`${row.name} options`} className="hidden group-hover/row:inline-flex group-focus-within/row:inline-flex data-[state=open]:inline-flex [@media(hover:none)]:inline-flex">
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
  googleAccount,
  refreshGoogle,
  mutateEvents,
  confirm,
  pinned,
  onTogglePin,
  canPin,
  onImported,
  onDialog,
  others,
  countOf,
}: {
  anchor: Date;
  view: ShownView;
  hasItems: (day: Date) => boolean;
  onPick: (day: Date) => void;
  rows: CalendarRow[];
  bookingCount?: number;
  onBookingPages: () => void;
  googleConnected: boolean;
  /** The Google account linked, when the server says which. */
  googleAccount?: string;
  /** Reads Google's link again, once it is made or undone. */
  refreshGoogle?: () => unknown;
  /** The calendar's events: Google's leave them at once when it is disconnected. */
  mutateEvents?: KeyedMutator<GetEventsResponse>;
  /** Asks before something is lost (disconnecting Google, removing a subscribed calendar): the app's confirm. */
  confirm?: (o: { title: string; description: string; confirmText?: string; destructive?: boolean; onConfirm: () => void | Promise<void> }) => void;
  pinned?: boolean;
  onTogglePin?: () => void;
  canPin?: boolean;
  /** An import brought events in: the calendar reads them. */
  onImported?: () => void;
  /** Opens one of the panel's dialogs (Import and export, Share): the calendar holds it, so it outlives the panel. */
  onDialog?: (open: (close: () => void) => ReactNode) => void;
  /** Calendars beside your own one (A6): yours an import made, projects', shared ones and teammates' laid over yours. */
  others?: OtherCalendars;
  /** How many of a calendar's events are in the week shown. */
  countOf?: (calendarId: string) => number;
}) {
  const post = usePost();
  const busy = post.isSubmitting;
  // Google's consent screen, through the connectors flow (CAL-BUG-8).
  const connectGoogle = async () => {
    const res = await post.makeRequest<undefined, { url: string }>({ method: "GET", apiEndpoint: GetEndpointUrl.GoogleCalendarAuthUrl as unknown as string });
    if (res?.url) window.location.href = res.url;
  };
  // Disconnecting takes every Google event off this calendar, so it asks first.
  const disconnectGoogle = () =>
    confirm?.({
      title: "Disconnect Google Calendar?",
      description: "Its events leave this calendar, and new OneCamp events stop going to Google. You can connect it again at any time.",
      confirmText: "Disconnect Google Calendar",
      destructive: true,
      onConfirm: async () => {
        await post.makeRequest({ apiEndpoint: PostEndpointUrl.GoogleCalendarUnlink });
        void refreshGoogle?.();
        void mutateEvents?.((cur) => (cur?.data ? { ...cur, data: cur.data.filter((e) => !e.event_uuid.startsWith("gcal-")) } : cur), { revalidate: true });
      },
    });
  const share = (calendar?: { id: string; name: string }) =>
    onDialog?.((close) => <SharePart.View fallback={null} render={(m) => <m.default calendar={calendar} onClose={close} />} />);
  // A calendar in Google Calendar, Apple Calendar or Outlook (B8): its secret link.
  const elsewhere = (calendar?: { id: string; name: string }) =>
    onDialog?.((close) => <FeedPart.View fallback={null} render={(m) => <m.default calendar={calendar} onClose={close} />} />);
  // Calendars read from an address (B8): added, read now, removed; the list and
  // the events read again after each, and once a first read has brought its events.
  const subs = useSubscriptions(!!others?.mine.some((c) => c.kind === "subscribed"), onImported);
  const { mutate } = useSWRConfig();
  const reread = () => {
    void mutate(calendarListUrl);
    subs.refresh();
    onImported?.();
  };
  const subscribeTo = () =>
    onDialog?.((close) => (
      <SubscribePart.View
        fallback={null}
        render={(m) => (
          <m.default
            onClose={close}
            onAdded={(added) => {
              close();
              others?.show([added.calendar_id]);
              reread();
            }}
          />
        )}
      />
    ));
  const subscribedMenu = (c: CalendarView) => (
    <>
      <DropdownMenuItem disabled className="whitespace-normal text-meta text-ink-3" data-subscription-words="">
        {subscriptionWords(subs.byCalendar.get(c.id)) || "Read from its address"}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => void refreshSubscription(c.id).finally(reread)}>Read it now</DropdownMenuItem>
    </>
  );
  const removeSubscribed = (c: CalendarView) =>
    confirm?.({
      title: `Remove “${c.name}”?`,
      description: "Its events go from your calendar. You can subscribe to it again.",
      confirmText: "Remove calendar",
      destructive: true,
      onConfirm: async () => {
        await unsubscribe(c.id);
        reread();
      },
    });
  // A calendar's row: shown or not, only it, its colour on this device, and Share for one you may share.
  const rowOf = (c: CalendarView, extra?: ReactNode): CalendarRow => ({
    id: c.id,
    name: c.name,
    hue: others?.hueOf(c),
    on: !others?.hidden.includes(c.id),
    count: countOf?.(c.id),
    // Only the calendars beside yours that were shown are in that read.
    failed: !!others?.error && !c.mine && !others.hidden.includes(c.id),
    onToggle: () => others?.toggle(c.id),
    onOnly: () => others?.only(c.id),
    warning: c.kind === "subscribed" ? subs.byCalendar.get(c.id)?.error : undefined,
    menu:
      c.kind === "subscribed" ? (
        // Its events are its address's: read it now, colour it, or remove it.
        <>
          {subscribedMenu(c)}
          {others ? <ColourMenu value={others.hues[c.id] ?? ""} onChange={(h) => others.recolour(c.id, h)} /> : null}
          <DropdownMenuItem className="text-danger-ink" onSelect={() => removeSubscribed(c)}>
            Remove calendar
          </DropdownMenuItem>
        </>
      ) : (
        <>
          {c.access === "manage" && !c.container_kind && onDialog ? <DropdownMenuItem onSelect={() => share(c.mine && c.kind === "personal" ? undefined : c)}>Share</DropdownMenuItem> : null}
          {onDialog ? <DropdownMenuItem onSelect={() => elsewhere(c)}>Show in another app</DropdownMenuItem> : null}
          {others ? <ColourMenu value={others.hues[c.id] ?? ""} onChange={(h) => others.recolour(c.id, h)} /> : null}
          {extra}
        </>
      ),
  });
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
        {rows.map((r, i) => (
          <Fragment key={r.id}>
            <CalendarListRow
              row={{
                ...r,
                menu:
                  r.id === "onecamp" && onDialog ? (
                    <>
                      <DropdownMenuItem onSelect={() => share()}>Share</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => elsewhere()}>Show in another app</DropdownMenuItem>
                    </>
                  ) : (
                    r.menu
                  ),
              }}
            />
            {i === 0 ? others?.mine.filter((c) => c.kind !== "subscribed").map((c) => <CalendarListRow key={c.id} row={rowOf(c)} />) : null}
          </Fragment>
        ))}
      </div>
      {others ? <OtherCalendarsList others={others} rowOf={rowOf} onSubscribe={onDialog ? subscribeTo : undefined} /> : null}
      <div className="my-2 h-px bg-line" />
      <button
        type="button"
        onClick={onBookingPages}
        className="flex h-8 items-center gap-2.5 rounded-lg px-1.5 text-left text-ui text-ink outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand pointer-coarse:h-11"
      >
        <Link2 className="size-4 text-ink-3" aria-hidden="true" />
        <span className="flex-1">Booking pages</span>
        {bookingCount ? <span className="text-meta tabular-nums text-ink-3">{bookingCount}</span> : null}
        <ChevronRight className="size-3.5 text-ink-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onDialog?.((close) => <ImportExportPart.View fallback={null} render={(m) => (
            <m.default
              onClose={close}
              onImported={onImported}
              onShow={(day, ids) => {
                others?.show(ids);
                onPick(day);
              }}
            />
          )} />)}
        className="flex h-8 items-center gap-2.5 rounded-lg px-1.5 text-left text-ui text-ink outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand pointer-coarse:h-11"
      >
        <ArrowUpDown className="size-4 text-ink-3" aria-hidden="true" />
        <span className="flex-1">Import and export</span>
      </button>
      {googleConnected ? <GoogleSection account={googleAccount} busy={busy} onConnect={connectGoogle} onDisconnect={disconnectGoogle} onMoved={onImported} /> : null}
      {googleConnected ? null : (
        <button
          type="button"
          onClick={connectGoogle}
          disabled={busy}
          className="flex h-8 items-center gap-2.5 rounded-lg px-1.5 text-left text-ui text-ink outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand pointer-coarse:h-11"
        >
          <GoogleMark className="size-4 shrink-0" />
          <span className="flex-1">Connect Google Calendar</span>
          <Plus className="size-3.5 text-ink-3" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/**
 * Google Calendar once connected (calendar B6): its mark and name, with the
 * account and how it stands (the move's progress, then how long since both
 * were in step) as its status line; moving everything from Google while
 * nothing has moved, or, once it stopped answering (C9), the line says so
 * in danger ink and connecting Google again is the one thing to do, in brand
 * ink; and Disconnect, last and quiet.
 */
function GoogleSection({ account, busy, onConnect, onDisconnect, onMoved }: { account?: string; busy?: boolean; onConnect: () => void; onDisconnect: () => void; onMoved?: () => void }) {
  const { sync, ready, starting, error, start, words } = useGoogleSync(onMoved);
  const moving = sync?.state === "moving";
  const status = googleSyncLine(account, sync);
  const next = googleSyncNext(sync);
  return (
    <div className="grid" data-google-sync={sync?.state ?? "none"}>
      <div className="flex items-start gap-2.5 px-1.5 py-1.5">
        <span className="flex h-5 items-center">
          <GoogleMark className="size-4 shrink-0" />
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <p className="text-ui leading-5 text-ink">Google Calendar</p>
          {status ? (
            <p className={cn("line-clamp-2 break-words text-meta", sync?.state === "broken" ? "text-danger-ink" : "text-ink-3")} role="status" data-google-account="">
              {status}
            </p>
          ) : null}
          {moving ? <Progress value={sync.progress} className="mt-1 h-1" aria-label="Moving from Google" /> : null}
        </div>
      </div>
      {next ? (
        <button
          type="button"
          onClick={next.reconnect ? onConnect : start}
          disabled={starting || !ready || (next.reconnect && busy)}
          aria-busy={starting || undefined}
          className={cn(
            "flex h-8 items-center gap-2.5 rounded-lg px-1.5 text-left text-ui outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60 pointer-coarse:h-11",
            next.reconnect ? "font-medium text-brand-text" : "text-ink",
          )}
        >
          {next.reconnect ? <Plug className="size-4" aria-hidden="true" /> : <ArrowDownToLine className="size-4 text-ink-3" aria-hidden="true" />}
          <span className="flex-1">{next.label}</span>
        </button>
      ) : null}
      {error || (sync?.state === "failed" && words) ? <p role="alert" className="pl-8 pr-1.5 text-meta text-danger-ink">{error || words}</p> : null}
      <button
        type="button"
        onClick={onDisconnect}
        disabled={busy}
        className="flex h-7 items-center rounded-lg pl-8 pr-1.5 text-left text-meta text-ink-3 outline-none hover:bg-hover hover:text-danger-ink focus-visible:ring-2 focus-visible:ring-brand pointer-coarse:h-11"
      >
        Disconnect Google Calendar
      </button>
    </div>
  );
}

/** What the panel shows of the calendars beside your own one (lib/calendar/otherCalendars). */
export interface OtherCalendars {
  /** Yours an import or the move from Google made. */
  mine: CalendarView[];
  calendars: CalendarView[];
  people: { id: string; name: string }[];
  hidden: string[];
  /** The read of their events, when it failed: their rows say so rather than a week with none (F2). */
  error?: unknown;
  /** Colours chosen on this device, by calendar. */
  hues: Record<string, CampHue>;
  hueOf: (c: CalendarView) => CampHue;
  toggle: (id: string) => void;
  /** Shows these again: an import's calendars, once Show them is pressed. */
  show: (ids: string[]) => void;
  only: (id?: string) => void;
  recolour: (id: string, hue: CampHue | "") => void;
  addPerson: (o: { id: string; name: string }) => void;
  removePerson: (id: string) => void;
}

/** A calendar's colour on this device: one of the six, or its own again. */
function ColourMenu({ value, onChange }: { value: string; onChange: (hue: CampHue | "") => void }) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>Colour</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-40">
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as CampHue | "")}>
          <DropdownMenuRadioItem value="">Its own colour</DropdownMenuRadioItem>
          {CAMP_SWATCHES.map((s) => (
            <DropdownMenuRadioItem key={s.hue} value={s.hue} className="gap-2">
              <span aria-hidden="true" className={cn(HUE_CLASS[s.hue], "size-3 rounded-[4px] bg-hue")} />
              {s.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/**
 * Other calendars (A6): each project's you're on, in its project's colour,
 * calendars shared with you, and teammates laid over yours (busy unless they
 * share more), with a way to add one.
 */
function OtherCalendarsList({ others, rowOf, onSubscribe }: { others: OtherCalendars; rowOf: (c: CalendarView, extra?: ReactNode) => CalendarRow; onSubscribe?: () => void }) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const add = async (picked: PickedPerson[]) => {
    const p = picked.at(-1);
    if (!p?.uuid) return;
    setError("");
    try {
      others.addPerson({ id: await teammateCalendar(p.uuid), name: p.name });
      setAdding(false);
    } catch (err) {
      setError(apiErrorMessage(err, "Their calendar couldn't be added."));
    }
  };
  const rows: CalendarRow[] = [
    ...others.calendars.map((c) => rowOf(c)),
    // Yours to read only, published by someone else: with the others, where they were added (as Google groups them).
    ...others.mine.filter((c) => c.kind === "subscribed").map((c) => rowOf(c)),
    ...others.people.map((p) =>
      rowOf(
        // In the colour its events are drawn in: one from its id, never your own's (calendarHue).
        { id: p.id, name: p.name, kind: "person", access: "view" },
        <DropdownMenuItem onSelect={() => others.removePerson(p.id)}>Remove from my calendar</DropdownMenuItem>,
      ),
    ),
  ];
  return (
    <div data-other-calendars="">
      <h2 className="mt-2 px-1.5 pb-1 text-meta font-medium text-ink-2">Other calendars</h2>
      <div className="grid">
        {rows.map((r) => (
          <CalendarListRow key={r.id} row={r} />
        ))}
      </div>
      {adding ? (
        <div className="grid gap-1 px-1.5 pt-1">
          <PeoplePicker value={[]} onChange={(v) => void add(v)} placeholder="Add a teammate's calendar" showChosen={false} />
          {error ? <p role="alert" className="text-meta text-danger-ink">{error}</p> : <p className="text-meta text-ink-3">You see when they&apos;re busy, and more if they share it.</p>}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex h-8 w-full items-center gap-2.5 rounded-lg px-1.5 text-left text-ui text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand pointer-coarse:h-11"
        >
          <Plus className="size-4 text-ink-3" aria-hidden="true" />
          Add a teammate&apos;s calendar
        </button>
      )}
      {onSubscribe ? (
        <button
          type="button"
          onClick={onSubscribe}
          className="flex h-8 w-full items-center gap-2.5 rounded-lg px-1.5 text-left text-ui text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand pointer-coarse:h-11"
          data-subscribe=""
        >
          <Globe className="size-4 text-ink-3" aria-hidden="true" />
          Subscribe to a calendar
        </button>
      ) : null}
    </div>
  );
}
