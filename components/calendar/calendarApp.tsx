"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, addMonths, differenceInCalendarDays, endOfWeek, format, isSameDay, isSameMonth, parseISO, startOfDay, startOfWeek } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Search, X } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DayCell } from "@/components/ui/calendar";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ToastAction } from "@/components/ui/toast";
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch";
import { usePost } from "@/hooks/usePost";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import { useMedia } from "@/context/MediaQueryContext";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import type { UserInfoRawInterface, UserProfileInterface } from "@/types/user";
import type { CalendarEventInterface, CreateEventPayload, GetEventsResponse } from "@/types/calendar";
import { cn } from "@/lib/utils/helpers/cn";
import { shortTime } from "@/lib/utils/date/shortDate";
import { useDispatch } from "react-redux";
import { useRouter } from "next/navigation";
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice";
import { CreateCalendarEventDialog } from "@/components/calendar/createCalendarEventDialog";
import { WeekView, type CalendarDraft } from "@/components/calendar/weekView";
import { MonthView, type MonthItem } from "@/components/calendar/monthView";
import { CalendarAgenda } from "@/components/calendar/calendarAgenda";
import { EventPopover } from "@/components/calendar/eventPopover";
import { QuickCreateCard, type QuickCreateValues } from "@/components/calendar/quickCreateCard";
import { CalendarsPanel, MiniMonth, type CalendarRow } from "@/components/calendar/calendarsPopover";
import { useMinute } from "@/components/calendar/NowLine";
import { HueBlock } from "@/components/calendar/HueBlock";
import { IdentityMark } from "@/components/ui/graphics/IdentityMark";
import { CALENDAR_HUE } from "@/components/calendar/calendarTones";
import { agendaDays, agendaEmptyTitle, agendaTitles, agendaWindowFrom, nextAgendaWindow, previousAgendaWindow, type AgendaWindow } from "@/lib/utils/calendarAgenda";
import { allDayItem, dayKey, itemsByDay, layoutWeek, monthGridRange, placeItems, WEEK_STARTS_ON } from "@/components/calendar/calendarLayout";
import { placeAllByDates } from "@/lib/calendar/allDay";

export type CalendarView = "day" | "week" | "month" | "agenda";
const VIEWS: { id: CalendarView; label: string; key: string }[] = [
    { id: "day", label: "Day", key: "D" },
    { id: "week", label: "Week", key: "W" },
    { id: "month", label: "Month", key: "M" },
    { id: "agenda", label: "Agenda", key: "A" },
];
/** Each view button's width: the thumb slides by whole steps (transform only). */
const SEG = 64;
const PIN_KEY = "onecamp-calendar-pinned";

/** A key press the calendar takes: never while typing, never in a dialog or menu. */
function isTyping(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    if (!t || !t.tagName) return false;
    return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || !!t.closest?.("[role=dialog],[role=menu],[role=listbox]");
}

/** Wide enough to pin the calendars as a rail (≥ 1600 px). */
function useWide(): boolean {
    const [wide, setWide] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia?.("(min-width: 1600px)");
        if (!mq) return;
        const on = () => setWide(mq.matches);
        on();
        mq.addEventListener?.("change", on);
        return () => mq.removeEventListener?.("change", on);
    }, []);
    return wide;
}

/** The period's title: "October 2026", "12 – 18 Oct 2026", "Thu 15 Oct". Pure. */
export function periodTitle(view: CalendarView, anchor: Date): string {
    if (view === "day") return format(anchor, "EEE d MMM");
    if (view === "week") {
        const s = startOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON });
        const e = endOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON });
        return isSameMonth(s, e) ? `${format(s, "d")} – ${format(e, "d MMM yyyy")}` : `${format(s, "d MMM")} – ${format(e, "d MMM yyyy")}`;
    }
    return format(anchor, "MMMM yyyy");
}

export function CalendarApp() {
    const dispatch = useDispatch();
    const { isMobile } = useMedia();
    const router = useRouter();
    const wide = useWide();
    const now = useMinute();
    const { toast } = useToast();
    const confirm = useConfirm();
    const post = usePost();

    const [anchor, setAnchor] = useState(() => new Date());
    const [view, setView] = useState<CalendarView>("week");
    // Phones open on the agenda until the person picks a view themselves; a
    // phone has no week grid, so a week there is its day.
    const [viewChosen, setViewChosen] = useState(false);
    const shownView: CalendarView = !viewChosen && isMobile ? "agenda" : isMobile && view === "week" ? "day" : view;
    // Which way the period moved, for its slide.
    const [dir, setDir] = useState<1 | -1>(1);
    // The desktop agenda's window once it has been paged; until then it runs
    // from the chosen day to the month's end (CAL-BUG-19).
    const [agendaPage, setAgendaPage] = useState<AgendaWindow | null>(null);
    const deskAgenda = shownView === "agenda" && !isMobile;
    const agendaWindow = useMemo(() => agendaPage ?? agendaWindowFrom(anchor), [agendaPage, anchor]);

    const [showEvents, setShowEvents] = useState(true);
    const [showGoogle, setShowGoogle] = useState(true);
    const [showTasks, setShowTasks] = useState(true);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [calendarsOpen, setCalendarsOpen] = useState(false);
    const [pinned, setPinned] = useState(false);
    useEffect(() => {
        try {
            setPinned(localStorage.getItem(PIN_KEY) === "1");
        } catch {
            /* storage blocked: unpinned */
        }
    }, []);
    const togglePin = () => {
        setPinned((p) => {
            try {
                localStorage.setItem(PIN_KEY, p ? "0" : "1");
            } catch {
                /* storage blocked */
            }
            return !p;
        });
        setCalendarsOpen(false);
    };
    const railShown = pinned && wide && !isMobile;

    // The open popover (an event clicked), the draft and its card, the full dialog.
    const [selected, setSelected] = useState<{ uuid: string; el: HTMLElement } | null>(null);
    const [draft, setDraft] = useState<CalendarDraft | null>(null);
    const [draftAnchor, setDraftAnchor] = useState<HTMLElement | null>(null);
    const [fullOpen, setFullOpen] = useState(false);
    const [fullInitial, setFullInitial] = useState<QuickCreateValues | null>(null);

    // What is asked for: always the month grid around the date. A week or a
    // day of that month is part of the same answer, so switching views asks
    // for nothing and waits for nothing. A new month keeps the last one on
    // screen until its answer comes.
    const { start: gridStart, end: gridEnd } = useMemo(() => monthGridRange(anchor), [anchor]);
    const rangeQuery = `startDate=${gridStart.toISOString()}&endDate=${gridEnd.toISOString()}`;
    const keep = { keepPreviousData: true };
    const { data: eventsRes, isLoading: isLoadingEvents, isError: eventsError, mutate: mutateEvents } = useFetch<GetEventsResponse>(
        `${GetEndpointUrl.GoogleCalendarEvents}?${rangeQuery}`, undefined, keep
    );
    const { data: tasksRes, isLoading: isLoadingTasks, isError: tasksError, mutate: mutateTasks } = useFetch<UserInfoRawInterface>(
        `${GetEndpointUrl.GetUserTaskList}?pageIndex=0&pageSize=100&${rangeQuery}`, undefined, keep
    );
    const { data: gcalStatus, mutate: mutateGcalStatus } = useFetch<{ data: { isConnected: boolean } }>(GetEndpointUrl.GoogleCalendarStatus);
    const { data: bookingRes } = useFetch<{ data: unknown[] }>(calendarsOpen || railShown ? GetEndpointUrl.GetBookingPages : "");
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile);
    const selfId = selfProfile?.data?.data?.user_uuid;
    const loading = isLoadingEvents || isLoadingTasks;
    // A failed load is not a free month: every view says so, in one place.
    const failed = !loading && !!(eventsError || tasksError);
    const retry = () => {
        void mutateEvents();
        void mutateTasks();
    };
    const googleConnected = !!gcalStatus?.data?.isConnected;

    const handleConnectGCal = async () => {
        const res = await post.makeRequest<undefined, { url: string }>({ method: "GET", apiEndpoint: GetEndpointUrl.GoogleCalendarAuthUrl as unknown as PostEndpointUrl });
        if (res?.url) window.location.href = res.url;
    };
    const handleUnlinkGCal = async () => {
        await post.makeRequest({ apiEndpoint: PostEndpointUrl.GoogleCalendarUnlink });
        mutateGcalStatus();
        mutateEvents((cur: GetEventsResponse | undefined) => (cur?.data ? { ...cur, data: cur.data.filter((e) => !e.event_uuid.startsWith("gcal-")) } : cur), { revalidate: true });
    };
    // Disconnecting takes every Google event off this calendar, so it asks first.
    const askUnlinkGCal = () =>
        confirm({
            title: "Disconnect Google Calendar?",
            description: "Its events leave this calendar, and new OneCamp events stop going to Google. You can connect it again at any time.",
            confirmText: "Disconnect Google Calendar",
            destructive: true,
            onConfirm: handleUnlinkGCal,
        });

    // Google all-day events are placed by their dates from here on (CAL-BUG-2).
    const allEvents = useMemo(() => placeAllByDates(eventsRes?.data || []), [eventsRes]);
    const events = useMemo(() => allEvents.filter((e) => (e.event_uuid.startsWith("gcal-") ? showGoogle : showEvents)), [allEvents, showEvents, showGoogle]);
    const tasks = useMemo(() => tasksRes?.data?.user_tasks || [], [tasksRes]);
    const q = searchQuery.trim().toLowerCase();
    // Search dims what doesn't match on the grids (content.md C02); the agenda lists only matches.
    const matches = useCallback((title: string) => !q || title.toLowerCase().includes(q), [q]);

    const placed = useMemo(() => {
        const items: MonthItem[] = events.map((e) => ({ ...e, isTask: false }));
        if (showTasks) {
            for (const t of tasks) {
                const startStr = t.task_start_date || t.task_due_date;
                const endStr = t.task_due_date || t.task_start_date;
                if (!startStr || !endStr) continue;
                items.push({ event_uuid: t.task_uuid, event_title: t.task_name, event_start_time: startStr, event_end_time: endStr, isTask: true, task_project: t.task_project, task_status: t.task_status });
            }
        }
        return placeItems(items);
    }, [events, tasks, showTasks]);
    const byDay = useMemo(() => itemsByDay(placed, gridStart, gridEnd), [placed, gridStart, gridEnd]);
    const weeks = useMemo(() => {
        if (shownView !== "month") return [];
        const out = [];
        for (let ws = gridStart; ws <= gridEnd; ws = addDays(ws, 7)) {
            out.push({ weekStart: ws, days: Array.from({ length: 7 }, (_, i) => addDays(ws, i)), tracks: layoutWeek(ws, placed) });
        }
        return out;
    }, [shownView, gridStart, gridEnd, placed]);

    const monthKey = format(anchor, "yyyy-MM");
    const monthBlank = shownView === "month" && !loading && !failed && ![...byDay.keys()].some((k) => k.startsWith(monthKey));
    const weekStart = startOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON });
    const weekCount = (pred: (it: MonthItem) => boolean) => {
        const seen = new Set<string>();
        for (let i = 0; i < 7; i++) for (const it of byDay.get(dayKey(addDays(weekStart, i))) || []) if (pred(it)) seen.add(it.event_uuid);
        return seen.size;
    };

    // ---- moving through time ------------------------------------------------

    const goTo = useCallback((d: Date) => {
        setDir(d >= anchor ? 1 : -1);
        setAnchor(d);
        setAgendaPage(null);
        setSelected(null);
    }, [anchor]);
    const step = useCallback((s: 1 | -1) => {
        if (deskAgenda) {
            // The agenda pages by what it listed: Next starts the day after its
            // last day, Previous ends the day before its first. A month from the
            // chosen day skipped the days between (CAL-BUG-19).
            const w = s > 0 ? nextAgendaWindow(agendaWindow) : previousAgendaWindow(agendaWindow);
            setDir(s);
            setAnchor(w.from);
            setAgendaPage(w);
            setSelected(null);
            return;
        }
        goTo(shownView === "day" ? addDays(anchor, s) : shownView === "week" ? addDays(anchor, 7 * s) : addMonths(anchor, s));
    }, [deskAgenda, agendaWindow, shownView, anchor, goTo]);
    const pickView = useCallback((v: CalendarView) => {
        setView(v);
        setViewChosen(true);
        setAgendaPage(null);
        setSelected(null);
    }, []);
    const newEvent = useCallback(() => {
        // A new event without a slot: the full dialog, at the next round hour.
        setDraft(null);
        setFullInitial(null);
        setFullOpen(true);
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return;
            const k = e.key.toLowerCase();
            const v = VIEWS.find((x) => x.key.toLowerCase() === k);
            if (v) pickView(v.id);
            else if (k === "t") goTo(new Date());
            else if (k === "j") step(1);
            else if (k === "k") step(-1);
            else if (k === "c") newEvent();
            else if (k === "/") setSearchOpen(true);
            else return;
            // Taken: the key must not also land in a field it opened (C typed a "c" into the new title).
            e.preventDefault();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [pickView, goTo, step, newEvent]);

    // ---- opening and changing events ----------------------------------------

    const openFull = useCallback((uuid: string) => {
        setSelected(null);
        if (isMobile) {
            router.push(`/app/calendar/event/${uuid}`);
            return;
        }
        // The panel loads the event by its id, showing the calendar's copy meanwhile.
        dispatch(openRightPanel({ eventUUID: uuid }));
    }, [isMobile, router, dispatch]);
    const openTask = useCallback((uuid: string) => {
        if (isMobile) router.push(`/app/task/${uuid}`);
        else dispatch(openRightPanel({ taskUUID: uuid }));
    }, [isMobile, router, dispatch]);
    const clickItem = useCallback((item: { event_uuid: string; isTask?: boolean }, el: HTMLElement) => {
        if (item.isTask) return openTask(item.event_uuid);
        if (isMobile) return openFull(item.event_uuid);
        setDraft(null);
        setSelected((cur) => (cur?.uuid === item.event_uuid ? null : { uuid: item.event_uuid, el }));
    }, [openTask, openFull, isMobile]);
    const selectedEvent = selected ? allEvents.find((e) => e.event_uuid === selected.uuid) ?? null : null;

    // Only your own OneCamp events move; a Google event is changed in Google.
    const canMove = useCallback((uuid: string) => {
        if (uuid.startsWith("gcal-")) return false;
        const e = allEvents.find((x) => x.event_uuid === uuid);
        return !!e && (!e.event_created_by || e.event_created_by.user_uuid === selfId);
    }, [allEvents, selfId]);

    /** An event's new times, through the existing update call. */
    const sendTimes = useCallback((e: CalendarEventInterface, start: Date, end: Date) =>
        post.makeRequest<CreateEventPayload>({
            apiEndpoint: (PostEndpointUrl.UpdateCalendarEvent + `/${e.event_uuid}`) as PostEndpointUrl,
            payload: {
                title: e.event_title,
                description: e.event_description,
                startTime: start.toISOString(),
                endTime: end.toISOString(),
                participants: (e.event_participants || []).map((p) => p.user_uuid),
                isFocus: !!e.event_is_focus,
                isAway: !!e.event_is_away,
            },
        }), [post]);

    /**
     * A move or a resize: drawn at once, sent, and put back if it fails. Once
     * it lands, a toast says where it went, with Undo.
     */
    const changeTimes = useCallback(async (uuid: string, start: Date, end: Date, undoing = false): Promise<void> => {
        const e = allEvents.find((x) => x.event_uuid === uuid);
        if (!e) return;
        const before = { start: e.event_start_time, end: e.event_end_time };
        const patch = (s: string, en: string) => (cur: GetEventsResponse | undefined) =>
            cur?.data ? { ...cur, data: cur.data.map((x) => (x.event_uuid === uuid ? { ...x, event_start_time: s, event_end_time: en } : x)) } : cur;
        void mutateEvents(patch(start.toISOString(), end.toISOString()), { revalidate: false });
        let saved = false;
        try {
            saved = (await sendTimes(e, start, end)) !== undefined;
        } catch {
            saved = false;
        }
        if (!saved) {
            void mutateEvents(patch(before.start, before.end), { revalidate: true });
            toast({ title: `Couldn't move “${e.event_title}”`, description: "It's back where it was.", variant: "destructive" });
            return;
        }
        void mutateEvents();
        if (undoing) return;
        toast({
            title: `Moved “${e.event_title}”`,
            description: `${format(start, "EEE d MMM")}, ${shortTime(start)} – ${shortTime(end)}`,
            action: (
                <ToastAction altText="Undo the move" onClick={() => void changeTimes(uuid, parseISO(before.start), parseISO(before.end), true)}>
                    Undo
                </ToastAction>
            ),
        });
    }, [allEvents, mutateEvents, sendTimes, toast]);

    const moveDays = useCallback((item: MonthItem, days: number) => {
        void changeTimes(item.event_uuid, addDays(parseISO(item.event_start_time), days), addDays(parseISO(item.event_end_time), days));
    }, [changeTimes]);

    const onDraft = useCallback((d: CalendarDraft, el: HTMLElement | null) => {
        setSelected(null);
        // On a phone, a day tapped in the month opens that day.
        if (isMobile && shownView === "month") {
            goTo(d.start);
            pickView("day");
            return;
        }
        if (isMobile) {
            setFullInitial({ title: "", start: d.start, end: d.end, isFocus: false, guests: [] });
            setFullOpen(true);
            return;
        }
        setDraft(d);
        setDraftAnchor(el);
    }, [isMobile, shownView, goTo, pickView]);

    // ---- what the toolbar says ----------------------------------------------

    const title = deskAgenda ? agendaTitles(agendaWindow)[0] : periodTitle(shownView, anchor);
    const unit = shownView === "day" ? "day" : shownView === "week" ? "week" : "month";
    const viewIndex = VIEWS.findIndex((v) => v.id === shownView);
    const periodKey = `${shownView}:${shownView === "day" ? dayKey(anchor) : shownView === "week" ? dayKey(weekStart) : deskAgenda ? dayKey(agendaWindow.from) : monthKey}`;

    const only = (ev: boolean, g: boolean, t: boolean) => () => {
        setShowEvents(ev);
        setShowGoogle(g);
        setShowTasks(t);
    };
    const rows: CalendarRow[] = [
        { id: "onecamp", name: "Personal", hue: CALENDAR_HUE.onecamp, on: showEvents, count: weekCount((i) => !i.isTask && !i.event_uuid.startsWith("gcal-")), onToggle: () => setShowEvents((v) => !v), onOnly: only(true, false, false) },
        ...(googleConnected
            ? [{ id: "google", name: "Google Calendar", hue: CALENDAR_HUE.google, on: showGoogle, count: weekCount((i) => i.event_uuid.startsWith("gcal-")), onToggle: () => setShowGoogle((v) => !v), onOnly: only(false, true, false) }]
            : []),
        {
            id: "tasks",
            name: "Assigned tasks",
            on: showTasks,
            count: weekCount((i) => !!i.isTask),
            marks: [...new Set(tasks.map((t) => t.task_project?.project_uuid).filter(Boolean) as string[])].slice(0, 3),
            onToggle: () => setShowTasks((v) => !v),
            onOnly: only(false, false, true),
        },
    ];
    const panel = (
        <CalendarsPanel
            anchor={anchor}
            view={shownView}
            hasItems={(d) => byDay.has(dayKey(d))}
            onPick={(d) => {
                goTo(d);
                if (shownView === "month" || shownView === "agenda") pickView("day");
                setCalendarsOpen(false);
            }}
            rows={rows}
            bookingCount={bookingRes?.data?.length}
            onBookingPages={() => {
                setCalendarsOpen(false);
                router.push("/app/calendar/booking");
            }}
            googleConnected={googleConnected}
            onConnectGoogle={handleConnectGCal}
            onDisconnectGoogle={askUnlinkGCal}
            busy={post.isSubmitting}
            canPin={wide}
            pinned={pinned}
            onTogglePin={togglePin}
        />
    );

    // A task sits on its due day in a list; drawn on every day it spans, one task filled a week.
    const agendaItems = (day: Date) =>
        (byDay.get(dayKey(day)) || []).filter((item) => (!item.isTask || isSameDay(parseISO(item.event_end_time), day)) && matches(item.event_title));

    const dayItems = byDay.get(dayKey(anchor)) || [];
    const dayRail = (
        <div className="flex flex-col gap-4 p-4">
            <MiniMonth anchor={anchor} view="day" hasItems={(d) => byDay.has(dayKey(d))} onPick={goTo} />
            <div>
                <h2 className="pb-1.5 text-meta font-medium text-ink-2">
                    {isSameDay(anchor, now) ? "Today" : format(anchor, "EEEE")} · {dayItems.length} {dayItems.length === 1 ? "item" : "items"}
                </h2>
                <div className="grid gap-0.5">
                    {dayItems.map((it) => (
                        <HueBlock key={it.event_uuid} item={it} variant="row" past={parseISO(it.event_end_time) < now} onClick={(e) => clickItem(it, e.currentTarget)} className="w-full">
                            <span className="min-w-0 flex-1 truncate">{it.event_title}</span>
                            {!it.isTask ? (
                                <span className="shrink-0 text-meta font-[450] tabular-nums opacity-75">
                                    {allDayItem(it, parseISO(it.event_start_time), parseISO(it.event_end_time)) ? "All day" : shortTime(parseISO(it.event_start_time))}
                                </span>
                            ) : null}
                        </HueBlock>
                    ))}
                    {dayItems.length === 0 ? <p className="text-ui-sm text-ink-3">A clear day.</p> : null}
                </div>
            </div>
        </div>
    );

    return (
        <div className="relative flex h-full w-full overflow-hidden bg-sheet" data-calendar="">
            <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
                <h1 className="sr-only">Calendar</h1>
                {isMobile ? (
                    <PhoneBar
                        title={title}
                        anchor={anchor}
                        view={shownView}
                        now={now}
                        hasItems={(d) => byDay.has(dayKey(d))}
                        onToday={() => goTo(new Date())}
                        onPickDay={(d) => {
                            goTo(d);
                            pickView("day");
                        }}
                        onView={pickView}
                        onNew={newEvent}
                        onStep={(s) => goTo(addDays(anchor, 7 * s))}
                        loading={loading}
                    />
                ) : (
                    <header className="relative z-20 flex h-[52px] shrink-0 items-center gap-2 border-b border-line bg-sheet px-4" data-calendar-header="">
                        {/* Where you are: the period, then back, forward and today. */}
                        <div className="flex min-w-0 items-center gap-1.5">
                            <span className="min-w-0 truncate font-display text-title-3 font-semibold tabular-nums text-ink" aria-live="polite">
                                {title}
                            </span>
                            {loading ? (
                                <LoadingDot className="ml-0.5" />
                            ) : null}
                            <div className="ml-1 flex shrink-0 items-center">
                                <Button variant="ghost" size="icon-sm" onClick={() => step(-1)} aria-label={`Previous ${unit}`} title={`Previous ${unit} · K`}>
                                    <ChevronLeft />
                                </Button>
                                <Button variant="ghost" size="icon-sm" onClick={() => step(1)} aria-label={`Next ${unit}`} title={`Next ${unit} · J`}>
                                    <ChevronRight />
                                </Button>
                            </div>
                            <Button variant="secondary" size="xs" onClick={() => goTo(new Date())} title="Today · T">
                                Today
                            </Button>
                        </div>

                        <div className="ml-auto flex shrink-0 items-center gap-1.5">
                            {/* Search: an icon that opens into a field; matches stay, the rest dim. */}
                            {searchOpen ? (
                                <div className="content-view-in flex h-7 w-56 items-center gap-1.5 rounded-lg bg-raised px-2 shadow-e1">
                                    <Search className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
                                    <input
                                        autoFocus
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Escape") {
                                                setSearchQuery("");
                                                setSearchOpen(false);
                                            }
                                        }}
                                        placeholder="Search events"
                                        aria-label="Search events"
                                        className="min-w-0 flex-1 bg-transparent text-ui-sm text-ink outline-none placeholder:text-ink-3"
                                    />
                                    <button
                                        type="button"
                                        aria-label="Close search"
                                        onClick={() => {
                                            setSearchQuery("");
                                            setSearchOpen(false);
                                        }}
                                        className="text-ink-3 hover:text-ink"
                                    >
                                        <X className="size-3.5" />
                                    </button>
                                </div>
                            ) : (
                                <Button variant="ghost" size="icon-sm" aria-label="Search events" title="Search · /" onClick={() => setSearchOpen(true)}>
                                    <Search />
                                </Button>
                            )}
                            {!railShown ? (
                                <Popover open={calendarsOpen} onOpenChange={setCalendarsOpen}>
                                    <PopoverTrigger asChild>
                                        <Button variant="ghost" size="sm" data-calendars-trigger="">
                                            <CalendarDays />
                                            Calendars
                                            {/* The calendars on show, as their colours. */}
                                            <span className="flex items-center gap-0.5" aria-hidden="true">
                                                {showEvents ? <IdentityMark hue={CALENDAR_HUE.onecamp} variant="dot" size={6} className="!size-1.5" /> : null}
                                                {googleConnected && showGoogle ? <IdentityMark hue={CALENDAR_HUE.google} variant="dot" size={6} className="!size-1.5" /> : null}
                                            </span>
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent align="end" className="content-float w-[300px] rounded-xl bg-pop p-3 shadow-e3">
                                        {panel}
                                    </PopoverContent>
                                </Popover>
                            ) : null}
                            {/* The view switch: four buttons over one sliding thumb. */}
                            <div role="group" aria-label="View" data-calendar-views="" className="relative flex rounded-lg bg-sunken p-0.5">
                                <span
                                    aria-hidden="true"
                                    data-thumb=""
                                    className="calendar-thumb absolute bottom-0.5 left-0.5 top-0.5 rounded-md bg-raised shadow-e1"
                                    style={{ width: SEG, transform: `translateX(${Math.max(viewIndex, 0) * SEG}px)` }}
                                />
                                {VIEWS.map((v) => (
                                    <button
                                        key={v.id}
                                        type="button"
                                        aria-pressed={shownView === v.id}
                                        onClick={() => pickView(v.id)}
                                        title={`${v.label} · ${v.key}`}
                                        style={{ width: SEG }}
                                        className={cn(
                                            "relative h-6 rounded-md text-ui-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand",
                                            shownView === v.id ? "text-ink" : "text-ink-3 hover:text-ink",
                                        )}
                                    >
                                        {v.label}
                                    </button>
                                ))}
                            </div>
                            <Button size="sm" onClick={newEvent} title="New event · C">
                                <Plus />
                                New event
                                <kbd className="kbd" aria-hidden="true">
                                    C
                                </kbd>
                            </Button>
                        </div>
                    </header>
                )}

                <div className="custom-scrollbar relative min-h-0 flex-1 overflow-auto overscroll-contain bg-sheet" aria-busy={loading || undefined}>
                    {failed ? (
                        // Over the grid, where an empty view says it is empty.
                        <div className="absolute inset-0 z-40 flex items-start justify-center bg-sheet/90 pt-16" data-calendar-failed="">
                            <ErrorState subject="your calendar" onRetry={retry} />
                        </div>
                    ) : null}
                    {/* One wrapper per period: a new period slides in from the side it came from. */}
                    <div key={periodKey} className={cn("h-full", dir > 0 ? "content-period-next" : "content-period-prev")} data-period={periodKey}>
                        {shownView === "agenda" ? (
                            loading && !eventsRes ? (
                                <AgendaSkeleton />
                            ) : failed ? null : (
                                <CalendarAgenda
                                    desktop={!isMobile}
                                    now={now}
                                    days={isMobile ? agendaDays(gridStart, gridEnd, agendaItems) : agendaDays(agendaWindow.from, agendaWindow.to, agendaItems, now, false)}
                                    onOpen={(item, el) => clickItem(item, el)}
                                    onNewEvent={newEvent}
                                    emptyTitle={isMobile ? undefined : agendaEmptyTitle(agendaWindow, now)}
                                />
                            )
                        ) : shownView === "week" || shownView === "day" ? (
                            <div className={cn("h-full", shownView === "week" && "min-w-[760px]")}>
                                <WeekView
                                    weekStart={shownView === "day" ? startOfDay(anchor) : weekStart}
                                    dayCount={shownView === "day" ? 1 : 7}
                                    events={events}
                                    tasks={tasks}
                                    showEvents
                                    showTasks={showTasks}
                                    draft={draft}
                                    onDraft={onDraft}
                                    onEventClick={(uuid, el) => clickItem({ event_uuid: uuid }, el)}
                                    onEventOpen={openFull}
                                    onTaskClick={openTask}
                                    onEventChange={(uuid, s, e) => void changeTimes(uuid, s, e)}
                                    canMove={canMove}
                                    selectedId={selected?.uuid ?? null}
                                    matches={q ? matches : undefined}
                                    rail={shownView === "day" && !isMobile ? dayRail : undefined}
                                    loading={loading}
                                    onNewEvent={newEvent}
                                />
                            </div>
                        ) : (
                            <MonthView
                                month={anchor}
                                weeks={weeks}
                                byDay={byDay}
                                now={now}
                                onItemClick={clickItem}
                                onItemOpen={(it) => (it.isTask ? openTask(it.event_uuid) : openFull(it.event_uuid))}
                                onDraft={onDraft}
                                onMoveDays={moveDays}
                                canMove={(it) => canMove(it.event_uuid)}
                                selectedId={selected?.uuid ?? null}
                                matches={q ? matches : undefined}
                                blank={monthBlank}
                                onNewEvent={newEvent}
                                compact={isMobile}
                            />
                        )}
                    </div>
                </div>
            </main>

            {railShown ? (
                <aside className="w-[300px] shrink-0 overflow-y-auto border-l border-line bg-sheet p-3" data-calendars-rail="">
                    {panel}
                </aside>
            ) : null}

            <EventPopover event={selectedEvent} anchor={selected?.el ?? null} now={now} onClose={() => setSelected(null)} onOpenFull={openFull} />
            <QuickCreateCard
                draft={draft}
                anchor={draftAnchor}
                onDraftChange={(d) => {
                    setDraft(d);
                    // The parse moved the draft: show its period, and let the card follow the ghost.
                    if (shownView === "day" && !isSameDay(d.start, anchor)) setAnchor(d.start);
                    if (shownView === "week") {
                        const off = differenceInCalendarDays(d.start, weekStart);
                        if (off < 0 || off > 6) setAnchor(d.start);
                    }
                    requestAnimationFrame(() => {
                        const g = document.querySelector<HTMLElement>("[data-calendar-ghost]");
                        if (g) setDraftAnchor(g);
                    });
                }}
                onClose={() => setDraft(null)}
                onCreated={() => {
                    setDraft(null);
                    void mutateEvents();
                }}
                onMoreOptions={(v) => {
                    setDraft(null);
                    setFullInitial(v);
                    setFullOpen(true);
                }}
            />
            <CreateCalendarEventDialog
                open={fullOpen}
                onOpenChange={setFullOpen}
                onSuccess={() => mutateEvents()}
                initial={fullInitial ?? undefined}
                isGCalConnected={googleConnected}
            />
        </div>
    );
}

/**
 * The phone's calendar bar (content.md C21): the period and its actions on
 * one row, a strip of the week's days under it, and the views as a segmented
 * row. The agenda is the default; tapping a day opens its grid.
 */
function PhoneBar({
    title,
    anchor,
    view,
    now,
    hasItems,
    onToday,
    onPickDay,
    onView,
    onNew,
    onStep,
    loading,
}: {
    title: string;
    anchor: Date;
    view: CalendarView;
    now: Date;
    hasItems: (d: Date) => boolean;
    onToday: () => void;
    onPickDay: (d: Date) => void;
    onView: (v: CalendarView) => void;
    onNew: () => void;
    onStep: (s: 1 | -1) => void;
    loading: boolean;
}) {
    const start = startOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON });
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const phoneViews: CalendarView[] = ["agenda", "day", "month"];
    return (
        <header className="shrink-0 border-b border-line bg-sheet" data-calendar-header="" data-phone-bar="">
            <div className="flex h-12 items-center gap-1.5 px-3">
                <span className="min-w-0 flex-1 truncate font-display text-title-3 font-semibold tabular-nums text-ink" aria-live="polite">
                    {title}
                </span>
                {loading ? (
                    <LoadingDot />
                ) : null}
                <Button variant="secondary" size="sm" onClick={onToday} className="extend-touch-target">
                    Today
                </Button>
                <Button size="icon" aria-label="New event" onClick={onNew} className="extend-touch-target">
                    <Plus />
                </Button>
            </div>
            {view !== "month" ? (
                <div className="flex items-center px-1 pb-2">
                    <Button variant="ghost" size="icon-sm" aria-label="Previous week" onClick={() => onStep(-1)} className="extend-touch-target">
                        <ChevronLeft />
                    </Button>
                    <div className="grid flex-1 grid-cols-7" data-week-strip="">
                        {days.map((d) => (
                            <div key={d.toISOString()} className="flex flex-col items-center gap-0.5">
                                <span className="text-micro font-medium text-ink-3">{format(d, "EEEEE")}</span>
                                <DayCell date={d} today={isSameDay(d, now)} selected={view === "day" && isSameDay(d, anchor)} dot={hasItems(d)} onClick={() => onPickDay(d)} aria-label={format(d, "EEEE d MMMM")} />
                            </div>
                        ))}
                    </div>
                    <Button variant="ghost" size="icon-sm" aria-label="Next week" onClick={() => onStep(1)} className="extend-touch-target">
                        <ChevronRight />
                    </Button>
                </div>
            ) : null}
            <div role="group" aria-label="View" data-calendar-views="" className="mx-3 mb-2 grid grid-cols-3 rounded-lg bg-sunken p-0.5">
                {phoneViews.map((v) => (
                    <button
                        key={v}
                        type="button"
                        aria-pressed={view === v}
                        onClick={() => onView(v)}
                        className={cn("h-8 rounded-md text-ui-sm font-medium capitalize outline-none focus-visible:ring-2 focus-visible:ring-brand", view === v ? "bg-raised text-ink shadow-e1" : "text-ink-3")}
                    >
                        {v}
                    </button>
                ))}
            </div>
        </header>
    );
}

/** Loading, said as a breathing dot beside the period (content.md C02), never a bar. */
function LoadingDot({ className }: { className?: string }) {
    return (
        <span role="status" className={cn("flex items-center", className)} data-calendar-loading="">
            <span className="sr-only">Loading…</span>
            <span aria-hidden="true" className="calendar-loading-dot size-1.5 rounded-full bg-ink-3" />
        </span>
    );
}

/** The agenda's shape while it loads: a day heading and rows the size of its own. */
function AgendaSkeleton() {
    return (
        <div role="status" aria-label="Loading the agenda" data-agenda-skeleton="" className="mx-auto w-full max-w-[720px]">
            {[3, 2].map((rows, d) => (
                <div key={d} aria-hidden="true">
                    <div className="px-4 pb-1.5 pt-4">
                        <Skeleton className="h-3 w-20" />
                    </div>
                    {Array.from({ length: rows }).map((_, i) => (
                        <div key={i} className="flex min-h-[52px] items-center gap-3 px-4 py-2">
                            <Skeleton className="h-3 w-12" />
                            <Skeleton className="h-8 w-[3px] shrink-0" />
                            <div className="min-w-0 flex-1 space-y-1.5">
                                <Skeleton className={cn("h-3.5", i % 2 ? "w-2/5" : "w-3/5")} />
                                <Skeleton className="h-3 w-24" />
                            </div>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}
