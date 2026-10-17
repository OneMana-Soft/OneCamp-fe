"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import { addDays, addMonths, differenceInCalendarDays, endOfWeek, format, isSameDay, isSameMonth, parseISO, startOfDay, startOfWeek } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Search, X } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { FitLabel } from "@/components/common/FitLabel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DayCell } from "@/components/ui/dayCell";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ToastAction } from "@/components/ui/toast";
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch";
import { useAssignedTasks } from "@/hooks/useAssignedTasks";
import { OWN_ERRORS } from "@/lib/axiosInstance";
import { usePost } from "@/hooks/usePost";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import { useMedia } from "@/context/MediaQueryContext";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import type { UserProfileInterface } from "@/types/user";
import type { CalendarEventInterface, CreateEventPayload, GetEventsResponse } from "@/types/calendar";
import { cn } from "@/lib/utils/helpers/cn";
import { useDispatch, useSelector } from "react-redux";
import { useRouter, useSearchParams } from "next/navigation";
import { closeRightPanel, openRightPanel } from "@/store/slice/desktopRightPanelSlice";
import type { RootState } from "@/store/store";
import { app_calendar_path } from "@/types/paths";
import { calendarPlace, calendarRoute } from "@/lib/calendar/route";
import { calendarKeyHint, calendarKeyRow, type CalendarCommand } from "@/lib/calendar/keys";
import { isMacLike } from "@/lib/keys/chord";
import { isTyping } from "@/lib/goKeys";
import { deleteEventConfirm, deleteEventRequest } from "@/lib/calendar/confirmDelete";
import { useStableCallback } from "@/hooks/useStableCallback";
import { WeekView, type CalendarDraft } from "@/components/calendar/weekView";
import type { MonthItem } from "@/components/calendar/monthView";
import { CalendarAgenda } from "@/components/calendar/calendarAgenda";
import { joinLinkOf } from "@/lib/calendar/joinLink";
import type { EventMenuAt } from "@/components/calendar/eventMenu";
import { duplicateOf, type EventDraftValues } from "@/lib/calendar/duplicate";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import type { CalendarRow } from "@/components/calendar/calendarsPopover";
import { lazyView } from "@/components/task/LazyView";
import { useWhenIdle } from "@/hooks/useWhenIdle";
import { useMinute } from "@/components/calendar/NowLine";
import { HueBlock } from "@/components/calendar/HueBlock";
import { IdentityMark } from "@/components/ui/graphics/IdentityMark";
import { CALENDAR_HUE } from "@/components/calendar/calendarTones";
import { agendaDays, agendaEmptyTitle, agendaTitles, agendaWindowFrom, nextAgendaWindow, previousAgendaWindow, type AgendaWindow } from "@/lib/utils/calendarAgenda";
import { dayKey, dayListTime, itemsByDay, layoutWeek, monthGridRange, placeItems, WEEK_STARTS_ON } from "@/components/calendar/calendarLayout";
import { placeAllByDates } from "@/lib/calendar/allDay";
import { bookedMeetingConfirm } from "@/lib/calendar/bookedMeeting";
import { dayAndTime } from "@/lib/utils/date/clock";

export type CalendarView = "day" | "week" | "month" | "agenda";
const VIEWS: { id: CalendarView; label: string }[] = [
    { id: "day", label: "Day" },
    { id: "week", label: "Week" },
    { id: "month", label: "Month" },
    { id: "agenda", label: "Agenda" },
];
/** A move as it was before: what its Undo puts back. */
type Move = { uuid: string; start: string; end: string };
/** Each view button's width: the thumb slides by whole steps (transform only). */
const SEG = 64;
const PIN_KEY = "onecamp-calendar-pinned";

// What opens on first use, each a chunk of its own, so the route brings the
// grid alone (PM-3): quick create, the full dialog, the Calendars panel (and
// the day's mini month), Go to with the parser, an event's pop card and its
// right-click menu, and the month view (the week or the agenda opens first).
// Their code is fetched
// when the page has a quiet moment, and when the pointer heads for one, so
// by the time it opens it is in and draws at once (lazyView holds no
// fallback on screen once a chunk is loaded).
const QuickCreate = lazyView(() => import("@/components/calendar/quickCreateCard"));
const EventDialog = lazyView(() => import("@/components/calendar/createCalendarEventDialog"));
const Calendars = lazyView(() => import("@/components/calendar/calendarsPopover"));
const GoTo = lazyView(() => import("@/components/calendar/goToDate"));
const Menu = lazyView(() => import("@/components/calendar/eventMenu"));
const Card = lazyView(() => import("@/components/calendar/eventPopover"));
const Month = lazyView(() => import("@/components/calendar/monthView"));
/** Fetches a surface's code ahead of its first use; a failure here says nothing, the surface asks when it opens. */
const ahead = (surface: { warm: () => Promise<unknown> }) => () => void surface.warm().catch(() => {});

/**
 * Whether a key press belongs to something else: a field, or a dialog, menu or
 * list over the calendar, the delete question included. The event's own card
 * is the calendar's: E opens it, Delete deletes it.
 */
function keysElsewhere(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    if (!t || !t.tagName) return false;
    if (isTyping(t)) return true;
    const layer = t.closest?.("[role=dialog],[role=alertdialog],[role=menu],[role=listbox]");
    return !!layer && !layer.hasAttribute("data-event-popover");
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

/**
 * The period's title, said longest first: the header shows the first one
 * that fits ("12 – 18 Oct 2026", then "12 – 18 Oct", then "12–18 Oct"), so
 * it drops the year or tightens before it ever truncates. Pure.
 */
export function periodTitles(view: CalendarView, anchor: Date): string[] {
    if (view === "day") return [format(anchor, "EEEE d MMMM yyyy"), format(anchor, "EEE d MMM yyyy"), format(anchor, "EEE d MMM"), format(anchor, "d MMM")];
    if (view === "week") {
        const s = startOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON });
        const e = endOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON });
        if (isSameMonth(s, e)) return [`${format(s, "d")} – ${format(e, "d MMM yyyy")}`, `${format(s, "d")} – ${format(e, "d MMM")}`, `${format(s, "d")}–${format(e, "d MMM")}`];
        // A week across the new year names both years while there is room.
        if (s.getFullYear() !== e.getFullYear()) return [`${format(s, "d MMM yyyy")} – ${format(e, "d MMM yyyy")}`, `${format(s, "d MMM")} – ${format(e, "d MMM yyyy")}`, `${format(s, "d MMM")} – ${format(e, "d MMM")}`, `${format(s, "d MMM")}–${format(e, "d MMM")}`];
        return [`${format(s, "d MMM")} – ${format(e, "d MMM yyyy")}`, `${format(s, "d MMM")} – ${format(e, "d MMM")}`, `${format(s, "d MMM")}–${format(e, "d MMM")}`];
    }
    return [format(anchor, "MMMM yyyy"), format(anchor, "MMM yyyy"), format(anchor, "MMM")];
}

/** The period's title in full: "October 2026", "12 – 18 Oct 2026", "Thursday 15 October 2026". Pure. */
export function periodTitle(view: CalendarView, anchor: Date): string {
    return periodTitles(view, anchor)[0];
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

    // Where it opens: the place its address names (a reload, Back, a link to a
    // day), else this week (FE-F-2).
    const [opened] = useState(() => calendarPlace(new URLSearchParams(typeof window === "undefined" ? "" : window.location.search)));
    const [anchor, setAnchor] = useState(() => opened.date ?? new Date());
    const [view, setView] = useState<CalendarView>(opened.view ?? "week");
    // Phones open on the agenda until the person picks a view themselves; a
    // phone has no week grid, so a week there is its day.
    const [viewChosen, setViewChosen] = useState(!!opened.view);
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
    const [fullInitial, setFullInitial] = useState<EventDraftValues | null>(null);
    // A phone opens the full dialog alone (no quick create, Calendars or Go to
    // there; an event opens at its own page, so no pop card either), and its
    // month view.
    useWhenIdle(() => (isMobile ? [EventDialog, Month] : [QuickCreate, EventDialog, Calendars, GoTo, Menu, Card, Month]).forEach((surface) => ahead(surface)()));
    // Quick create and the dialog stay mounted from their first use on, so
    // each keeps its state and plays its closing motion.
    const [quickUsed, setQuickUsed] = useState(false);
    if (draft && !quickUsed) setQuickUsed(true);
    const [dialogUsed, setDialogUsed] = useState(false);
    if (fullOpen && !dialogUsed) setDialogUsed(true);
    const [cardUsed, setCardUsed] = useState(false);
    if (selected && !cardUsed) setCardUsed(true);

    // What is asked for: always the month grid around the date. A week or a
    // day of that month is part of the same answer, so switching views asks
    // for nothing and waits for nothing. A new month keeps the last one on
    // screen until its answer comes.
    const { start: gridStart, end: gridEnd } = useMemo(() => monthGridRange(anchor), [anchor]);
    const rangeQuery = `startDate=${gridStart.toISOString()}&endDate=${gridEnd.toISOString()}`;
    const keep = { keepPreviousData: true };
    // The calendar says a failed load itself (over the grid, with Try
    // again), so the global error toast stays quiet: it doubled the message.
    const { data: eventsRes, isLoading: isLoadingEvents, isError: eventsError, mutate: mutateEvents } = useFetch<GetEventsResponse>(
        `${GetEndpointUrl.GoogleCalendarEvents}?${rangeQuery}`, undefined, keep, OWN_ERRORS
    );
    // Every task of the grid, page by page: it asked for 100 and showed them as the month (FE-F-1).
    const { data: tasksRes, isLoading: isLoadingTasks, isError: tasksError, mutate: mutateTasks } = useAssignedTasks(rangeQuery, OWN_ERRORS);
    const { data: gcalStatus, mutate: mutateGcalStatus } = useFetch<{ data: { isConnected: boolean; accountEmail?: string } }>(GetEndpointUrl.GoogleCalendarStatus);
    const { data: bookingRes } = useFetch<{ data: unknown[] }>(calendarsOpen || railShown ? GetEndpointUrl.GetBookingPages : "");
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile);
    const selfId = selfProfile?.data?.data?.user_uuid;
    const loading = isLoadingEvents || isLoadingTasks;
    // A failed load is not a free month: every view says so, in one place.
    const failed = !loading && !!(eventsError || tasksError);
    // R, and Try again: asked again, with the dot by the period meanwhile.
    const [refreshing, setRefreshing] = useState(false);
    const refresh = useCallback(() => {
        if (refreshing) return;
        setRefreshing(true);
        void Promise.allSettled([mutateEvents(), mutateTasks()]).finally(() => setRefreshing(false));
    }, [refreshing, mutateEvents, mutateTasks]);
    const googleConnected = !!gcalStatus?.data?.isConnected;
    // Which Google account it is ("" for a link made before the server said).
    const googleAccount = gcalStatus?.data?.accountEmail || undefined;

    // Back from Google's consent screen: the server's connectors callback lands
    // here with ?connector=success|error (CAL-BUG-8). Said once, then dropped
    // from the address.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const status = params.get("connector");
        const provider = params.get("provider");
        if (!status || (provider && provider !== "google_calendar")) return;
        if (status === "success") {
            void Promise.resolve(mutateGcalStatus()).then((res) => {
                const who = res?.data?.accountEmail;
                toast({ title: "Google Calendar is connected", description: who ? `Connected as ${who}.` : "Its events show here now.", tone: "success" });
            });
            void mutateEvents();
        } else if (status === "error") {
            toast({ title: "Couldn't connect Google Calendar", description: "The sign-in didn't finish. Try again from Calendars.", variant: "destructive" });
        }
        window.history.replaceState({}, document.title, window.location.pathname);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on landing
    }, []);

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
    /**
     * The full dialog, empty or with what it opens on. Its chunk is asked for
     * each time: one that failed to load (offline for a moment) loads now, and
     * the dialog draws when it lands.
     */
    const openDialog = useCallback((initial: EventDraftValues | null) => {
        setFullInitial(initial);
        setFullOpen(true);
        ahead(EventDialog)();
    }, []);
    const newEvent = useCallback(() => {
        // A new event without a slot: the full dialog, at the next round hour.
        setDraft(null);
        openDialog(null);
    }, [openDialog]);

    // ---- opening and changing events ----------------------------------------

    const openFull = useCallback((uuid: string) => {
        setSelected(null);
        if (isMobile) {
            router.push(calendarRoute({ event: uuid }));
            return;
        }
        // The panel loads the event by its id, showing the calendar's copy meanwhile.
        dispatch(openRightPanel({ eventUUID: uuid }));
    }, [isMobile, router, dispatch]);
    const openTask = useCallback((uuid: string) => {
        if (isMobile) router.push(`/app/task/${uuid}`);
        else dispatch(openRightPanel({ taskUUID: uuid }));
    }, [isMobile, router, dispatch]);

    // ---- the address --------------------------------------------------------

    // The event an address names opens whatever the panel had: the address
    // wins. On a phone it opens at its own page, and the address drops it
    // first, so Back comes to the calendar rather than to the event again.
    const openNamed = useCallback((uuid: string) => {
        if (!isMobile) return openFull(uuid);
        const here = new URL(window.location.href);
        here.searchParams.delete("event");
        window.history.replaceState(null, "", here.pathname + here.search);
        openFull(uuid);
    }, [isMobile, openFull]);
    useEffect(() => {
        if (opened.event) openNamed(opened.event);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on opening
    }, []);

    // The address says where you are: the day, the view once one is chosen,
    // and the event open beside the calendar. It is written as the place
    // changes, never on opening (the place is then what the address said, or
    // the panel's event a link opened). history.replaceState, not the
    // router's replace, which fetched the page again: Next follows it itself.
    const rightPanel = useSelector((s: RootState) => s.rightPanel.rightPanelState);
    const panelEvent = !isMobile && rightPanel.isOpen ? rightPanel.data.eventUUID || null : null;
    const shownPlace = `${dayKey(anchor)} ${viewChosen ? view : ""} ${panelEvent ?? ""}`;
    const writtenPlace = useRef(shownPlace);
    const ourAddress = useRef<string | null>(null);
    useEffect(() => {
        if (shownPlace === writtenPlace.current || window.location.pathname !== app_calendar_path) return;
        writtenPlace.current = shownPlace;
        const here = new URLSearchParams(window.location.search);
        const url = calendarRoute({ date: anchor, view: viewChosen ? view : null, event: panelEvent }, here);
        const search = new URL(url, window.location.href).searchParams.toString();
        if (search === here.toString()) return;
        ourAddress.current = search;
        window.history.replaceState(null, "", url);
    }, [shownPlace, anchor, view, viewChosen, panelEvent]);

    // A link to a day or an event while the calendar is open, or Back: the
    // calendar goes where the address now says.
    const followAddress = useCallback((place: ReturnType<typeof calendarPlace>) => {
        if (place.date && dayKey(place.date) !== dayKey(anchor)) goTo(place.date);
        if (place.view && (place.view !== view || !viewChosen)) pickView(place.view);
        if (place.event && place.event !== panelEvent) openNamed(place.event);
    }, [anchor, view, viewChosen, panelEvent, goTo, pickView, openNamed]);
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

    // The last move, which Z and ⌘Z undo as its toast's Undo does (VD-31).
    const lastMove = useRef<Move | null>(null);
    /** Puts a move back, the last one unless a toast names its own; false when there is none. */
    const undoMove = useStableCallback((move: Move | null = lastMove.current): boolean => {
        if (!move) return false;
        if (lastMove.current === move) lastMove.current = null;
        void changeTimes(move.uuid, parseISO(move.start), parseISO(move.end), true);
        return true;
    });

    /**
     * A move or a resize: drawn at once, sent, and put back if it fails. Once
     * it lands, a toast says where it went, with Undo; an undo says where it
     * went back to. A booked meeting asks first, naming its guest and whether
     * they'll be told (CAL-BUG-4).
     */
    const changeTimes = useCallback(async (uuid: string, start: Date, end: Date, undoing = false, confirmed = false): Promise<void> => {
        const e = allEvents.find((x) => x.event_uuid === uuid);
        if (!e) return;
        if (e.event_booking && !confirmed) {
            confirm({
                ...bookedMeetingConfirm(e.event_booking, "move", start, end),
                onConfirm: () => changeTimes(uuid, start, end, undoing, true),
            });
            return;
        }
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
        if (undoing) {
            toast({ title: `Moved “${e.event_title}” back`, description: dayAndTime(start, end) });
            return;
        }
        const move = { uuid, start: before.start, end: before.end };
        lastMove.current = move;
        toast({
            title: `Moved “${e.event_title}”`,
            description: dayAndTime(start, end),
            action: (
                <ToastAction altText="Undo the move" onClick={() => undoMove(move)}>
                    Undo
                </ToastAction>
            ),
        });
    }, [allEvents, mutateEvents, sendTimes, toast, confirm, undoMove]);

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
            openDialog({ title: "", start: d.start, end: d.end, isFocus: false, guests: [] });
            return;
        }
        setDraft(d);
        setDraftAnchor(el);
    }, [isMobile, shownView, goTo, pickView, openDialog]);

    // Delete, from its key (and the menu): only your own OneCamp events, asked
    // first and sent as the event's panel asks and sends it.
    const removeEvent = useCallback(async (ev: CalendarEventInterface) => {
        try {
            await post.makeRequest(deleteEventRequest(ev.event_uuid));
        } catch {
            return; // The toast said why.
        }
        setSelected((cur) => (cur?.uuid === ev.event_uuid ? null : cur));
        if (panelEvent === ev.event_uuid) dispatch(closeRightPanel());
        void mutateEvents((cur: GetEventsResponse | undefined) => (cur?.data ? { ...cur, data: cur.data.filter((x) => x.event_uuid !== ev.event_uuid) } : cur), { revalidate: true });
    }, [post, panelEvent, dispatch, mutateEvents]);
    const askDelete = useCallback((ev: CalendarEventInterface) => {
        if (!canMove(ev.event_uuid)) {
            toast(
                ev.event_uuid.startsWith("gcal-")
                    ? { title: "This event is in Google Calendar", description: "Delete it there, and it goes from here too." }
                    : { title: "Only its organiser can delete it", description: "You can leave it from its details instead." },
            );
            return;
        }
        confirm({ ...deleteEventConfirm(ev), destructive: true, onConfirm: () => removeEvent(ev) });
    }, [canMove, toast, confirm, removeEvent]);

    // Duplicate (⌘D and the menu): the full dialog with a copy, never the call link (EV-58).
    const duplicate = useCallback((ev: CalendarEventInterface) => {
        setSelected(null);
        setDraft(null);
        openDialog(duplicateOf(ev, joinLinkOf(ev), selfId));
    }, [selfId, openDialog]);
    const { copy } = useCopyToClipboard();

    // An event's menu: a right-click on it, or the menu key on its block.
    // Tasks and empty time keep the browser's own menu.
    const [menu, setMenu] = useState<{ at: EventMenuAt; event: CalendarEventInterface; open: boolean } | null>(null);
    /** Opens the menu of the event a block draws: at the pointer, else under the block (the keyboard, a held finger). */
    const openMenu = (from: HTMLElement, pointer?: { x: number; y: number }): boolean => {
        const event = allEvents.find((x) => x.event_uuid === from.dataset.eventUuid);
        if (!event) return false;
        const box = from.getBoundingClientRect();
        setSelected(null);
        setMenu({ at: { ...(pointer ?? { x: box.left, y: box.bottom }), from }, event, open: true });
        return true;
    };
    const onContextMenu = (e: ReactMouseEvent) => {
        const from = (e.target as HTMLElement).closest?.<HTMLElement>("[data-event-uuid]");
        if (from && openMenu(from, e.clientX || e.clientY ? { x: e.clientX, y: e.clientY } : undefined)) e.preventDefault();
    };
    const menuItems = (ev: CalendarEventInterface) => [
        { label: "Open", onSelect: () => openFull(ev.event_uuid) },
        { label: "Duplicate", onSelect: () => duplicate(ev) },
        { label: "Copy link", onSelect: () => void copy(new URL(calendarRoute({ event: ev.event_uuid }), window.location.origin).toString(), "Link copied") },
        ...(canMove(ev.event_uuid) ? [{ label: "Delete", destructive: true, onSelect: () => askDelete(ev) }] : []),
    ];

    // ---- keys ---------------------------------------------------------------

    // Go to (G): open by the period's title while this holds it.
    const [goToAt, setGoToAt] = useState<HTMLElement | null>(null);

    /** What E and Delete act on: the event whose card is open, else the event or task that has the focus. */
    const picked = (): { event?: CalendarEventInterface; task?: string } | null => {
        const uuid = selected?.uuid ?? (document.activeElement as HTMLElement | null)?.closest?.<HTMLElement>("[data-calendar] [data-event-uuid]")?.dataset.eventUuid;
        if (!uuid) return null;
        const event = allEvents.find((e) => e.event_uuid === uuid);
        if (event) return { event };
        return tasks.some((t) => t.task_uuid === uuid) ? { task: uuid } : null;
    };

    /**
     * The calendar's keys, from one table (lib/calendar/keys): the one the
     * shortcut list shows and the toolbar's hints name. Each command says
     * whether it took the key; a key taken goes no further, so it never lands
     * in a field it opened (C typed a "c" into the new title).
     */
    const runKey = useStableCallback((command: CalendarCommand): boolean => {
        const took = (run: () => void) => {
            run();
            return true;
        };
        const commands: Record<CalendarCommand, () => boolean> = {
            next: () => took(() => step(1)),
            previous: () => took(() => step(-1)),
            today: () => took(() => goTo(new Date())),
            goTo: () => {
                const title = document.querySelector<HTMLElement>("[data-calendar-header] [data-period-title]");
                return !!title && took(() => setGoToAt(title));
            },
            day: () => took(() => pickView("day")),
            week: () => took(() => pickView("week")),
            month: () => took(() => pickView("month")),
            agenda: () => took(() => pickView("agenda")),
            newEvent: () => took(newEvent),
            open: () => {
                const it = picked();
                if (it?.task) return took(() => openTask(it.task!));
                return !!it?.event && took(() => openFull(it.event!.event_uuid));
            },
            duplicate: () => {
                const ev = picked()?.event;
                return !!ev && took(() => duplicate(ev));
            },
            delete: () => {
                const ev = picked()?.event;
                return !!ev && took(() => askDelete(ev));
            },
            undo: () => undoMove(),
            refresh: () => took(refresh),
            search: () => took(() => setSearchOpen(true)),
        };
        return commands[command]();
    });
    useEffect(() => {
        const mac = isMacLike();
        const onKey = (e: KeyboardEvent) => {
            if (e.defaultPrevented || e.isComposing || keysElsewhere(e)) return;
            const command = calendarKeyRow(e, mac)?.command;
            if (command && runKey(command)) e.preventDefault();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [runKey]);

    // ---- what the toolbar says ----------------------------------------------

    const titles = deskAgenda ? agendaTitles(agendaWindow) : periodTitles(shownView, anchor);
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
        <Calendars.View
            fallback={<div role="status" aria-label="Loading your calendars" className="h-[420px]" />}
            render={(m) => (
                <m.CalendarsPanel
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
                    googleAccount={googleAccount}
                    onConnectGoogle={handleConnectGCal}
                    onDisconnectGoogle={askUnlinkGCal}
                    busy={post.isSubmitting}
                    canPin={wide}
                    pinned={pinned}
                    onTogglePin={togglePin}
                />
            )}
        />
    );

    // A task sits on its due day in a list; drawn on every day it spans, one task filled a week.
    const agendaItems = (day: Date) =>
        (byDay.get(dayKey(day)) || []).filter((item) => (!item.isTask || isSameDay(parseISO(item.event_end_time), day)) && matches(item.event_title));

    const dayItems = byDay.get(dayKey(anchor)) || [];
    const dayRail = (
        <div className="flex flex-col gap-4 p-4">
            <Calendars.View
                fallback={<div aria-hidden="true" className="h-[258px]" />}
                render={(m) => <m.MiniMonth anchor={anchor} view="day" hasItems={(d) => byDay.has(dayKey(d))} onPick={goTo} />}
            />
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
                                    {dayListTime(it, anchor)}
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
        <div className="relative flex h-full w-full overflow-hidden bg-sheet" data-calendar="" onContextMenu={onContextMenu}>
            <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
                <h1 className="sr-only">Calendar</h1>
                {isMobile ? (
                    <PhoneBar
                        titles={titles}
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
                        onStepMonth={(s) => goTo(addMonths(anchor, s))}
                        loading={loading || refreshing}
                    />
                ) : (
                    <header className="@container/calhead relative z-20 flex h-[52px] shrink-0 items-center gap-2 border-b border-line bg-sheet px-4" data-calendar-header="">
                        {/* Where you are: the period, then back, forward and today. The
                            group takes the room the actions leave, and the period says as
                            much of itself as fits there (no "Oct 20…"). */}
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                            <FitLabel options={titles} className="font-display text-title-3 font-semibold tabular-nums text-ink" aria-live="polite" data-period-title="" />
                            {loading || refreshing ? (
                                <LoadingDot className="ml-0.5" />
                            ) : null}
                            <div className="ml-1 flex shrink-0 items-center" data-touch-group="">
                                <Button variant="ghost" size="icon-sm" onClick={() => step(-1)} aria-label={`Previous ${unit}`} title={`Previous ${unit} · ${calendarKeyHint("previous")}`}>
                                    <ChevronLeft />
                                </Button>
                                <Button variant="ghost" size="icon-sm" onClick={() => step(1)} aria-label={`Next ${unit}`} title={`Next ${unit} · ${calendarKeyHint("next")}`}>
                                    <ChevronRight />
                                </Button>
                            </div>
                            <Button variant="secondary" size="xs" onClick={() => goTo(new Date())} title={`Today · ${calendarKeyHint("today")}`}>
                                Today
                            </Button>
                        </div>

                        <div className="ml-auto flex shrink-0 items-center gap-1.5">
                            {/* Search: an icon that opens into a field; matches stay, the rest dim. */}
                            {searchOpen ? (
                                <div className="content-view-in flex h-7 w-56 items-center gap-1.5 rounded-lg bg-raised px-2 shadow-e1 focus-within:focus-halo">
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
                                        data-touch-target=""
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
                                <Button variant="ghost" size="icon-sm" aria-label="Search events" title={`Search · ${calendarKeyHint("search")}`} onClick={() => setSearchOpen(true)}>
                                    <Search />
                                </Button>
                            )}
                            {!railShown ? (
                                <Popover open={calendarsOpen} onOpenChange={setCalendarsOpen}>
                                    <PopoverTrigger asChild>
                                        <Button variant="ghost" size="sm" data-calendars-trigger="" aria-label="Calendars" onPointerEnter={ahead(Calendars)} onFocus={ahead(Calendars)}>
                                            <CalendarDays />
                                            {/* On a narrow sheet the icon and its colours carry it, so the period keeps its room. */}
                                            <span className="hidden @[50rem]/calhead:inline">Calendars</span>
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
                                        onPointerEnter={v.id === "month" ? ahead(Month) : undefined}
                                        title={`${v.label} · ${calendarKeyHint(v.id)}`}
                                        style={{ width: SEG }}
                                        data-touch-target=""
                                        className={cn(
                                            "relative h-6 rounded-md text-ui-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand",
                                            shownView === v.id ? "text-ink" : "text-ink-3 hover:text-ink",
                                        )}
                                    >
                                        {v.label}
                                    </button>
                                ))}
                            </div>
                            <Button
                                size="sm"
                                onClick={newEvent}
                                title={`New event · ${calendarKeyHint("newEvent")}`}
                                aria-label="New event"
                                data-new-event=""
                                onPointerEnter={ahead(EventDialog)}
                                onFocus={ahead(EventDialog)}
                                className="@max-[46rem]/calhead:w-8 @max-[46rem]/calhead:px-0"
                            >
                                <Plus />
                                {/* Under 46rem of header (a tablet's 768 beside the rail) the words go
                                    and the plus stays, so the period's title keeps "12–18 Oct": it
                                    was cut to "12–18 …" there. */}
                                <span className="hidden @[46rem]/calhead:inline">New event</span>
                                {/* The hint goes first when the sheet narrows (kbd sets its own display, so a wrapper hides it). */}
                                <span className="hidden @[60rem]/calhead:contents">
                                    <kbd className="kbd" aria-hidden="true">
                                        {calendarKeyHint("newEvent")}
                                    </kbd>
                                </span>
                            </Button>
                        </div>
                    </header>
                )}

                <div className="custom-scrollbar relative min-h-0 flex-1 overflow-auto overscroll-contain bg-sheet" aria-busy={loading || undefined} onPointerEnter={() => [QuickCreate, Card].forEach((surface) => ahead(surface)())}>
                    {failed ? (
                        // Over the grid, where an empty view says it is empty.
                        <div className="absolute inset-0 z-40 flex items-start justify-center bg-sheet/90 pt-16" data-calendar-failed="">
                            <ErrorState subject="your calendar" onRetry={refresh} />
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
                            // The week scrolls sideways only below its gutter and seven 90 px
                            // days (686 px): at 760 a tablet's 712 px sheet hid Sunday,
                            // today's column, off the right edge.
                            <div className={cn("h-full", shownView === "week" && "min-w-[686px]")}>
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
                                    onEventMenu={(_, el) => void openMenu(el)}
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
                            <Month.View
                                fallback={<div className="h-full" aria-busy="true" data-month-loading="" />}
                                render={(m) => (
                            <m.MonthView
                                month={anchor}
                                weeks={weeks}
                                byDay={byDay}
                                now={now}
                                onItemClick={clickItem}
                                onItemOpen={(it) => (it.isTask ? openTask(it.event_uuid) : openFull(it.event_uuid))}
                                onItemMenu={(_, el) => void openMenu(el)}
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

            <FollowAddress ours={ourAddress} onChange={followAddress} />
            {menu ? (
                <Menu.View
                    fallback={null}
                    render={(m) => <m.EventMenu at={menu.at} open={menu.open} items={menuItems(menu.event)} onClose={() => setMenu((cur) => cur && { ...cur, open: false })} />}
                />
            ) : null}
            {goToAt ? (
                <GoTo.View
                    fallback={null}
                    render={(m) => (
                        <m.GoToDate
                            anchor={goToAt}
                            now={now}
                            onGo={(day) => {
                                setGoToAt(null);
                                goTo(day);
                            }}
                            onClose={() => setGoToAt(null)}
                        />
                    )}
                />
            ) : null}
            {cardUsed ? (
                <Card.View
                    fallback={null}
                    render={(m) => <m.EventPopover event={selectedEvent} anchor={selected?.el ?? null} now={now} onClose={() => setSelected(null)} onOpenFull={openFull} />}
                />
            ) : null}
            {quickUsed ? (
                <QuickCreate.View
                    fallback={null}
                    render={(m) => (
                        <m.QuickCreateCard
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
                                openDialog(v);
                            }}
                        />
                    )}
                />
            ) : null}
            {dialogUsed ? (
                <EventDialog.View
                    fallback={null}
                    render={(m) => (
                        <m.CreateCalendarEventDialog
                            open={fullOpen}
                            onOpenChange={setFullOpen}
                            onSuccess={() => mutateEvents()}
                            initial={fullInitial ?? undefined}
                            isGCalConnected={googleConnected}
                        />
                    )}
                />
            ) : null}
        </div>
    );
}

/**
 * Tells the calendar when something else changes its address: a link to a
 * day or an event while it is open, or Back. The calendar's own writes come
 * back here too, and are passed over: the one it made last, and any already
 * overtaken by a newer one. A component of its own, so that a change of the
 * address re-renders it alone, not the calendar's grid.
 */
function FollowAddress({ ours, onChange }: { ours: RefObject<string | null>; onChange: (place: ReturnType<typeof calendarPlace>) => void }) {
    const search = useSearchParams()?.toString() ?? "";
    const seen = useRef(search);
    useEffect(() => {
        if (search === seen.current) return;
        seen.current = search;
        if (search === ours.current || search !== new URLSearchParams(window.location.search).toString()) return;
        onChange(calendarPlace(new URLSearchParams(search)));
    }, [search, ours, onChange]);
    return null;
}

/**
 * The phone's calendar bar (content.md C21): the period and its actions on
 * one row, a strip of the week's days under it, and the views as a segmented
 * row. The agenda is the default; tapping a day opens its grid.
 */
function PhoneBar({
    titles,
    anchor,
    view,
    now,
    hasItems,
    onToday,
    onPickDay,
    onView,
    onNew,
    onStep,
    onStepMonth,
    loading,
}: {
    titles: string[];
    anchor: Date;
    view: CalendarView;
    now: Date;
    hasItems: (d: Date) => boolean;
    onToday: () => void;
    onPickDay: (d: Date) => void;
    onView: (v: CalendarView) => void;
    onNew: () => void;
    onStep: (s: 1 | -1) => void;
    /** The month view has no week strip, so the month's own arrows sit by its title. */
    onStepMonth: (s: 1 | -1) => void;
    loading: boolean;
}) {
    const start = startOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON });
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const phoneViews: CalendarView[] = ["agenda", "day", "month"];
    return (
        <header className="shrink-0 border-b border-line bg-sheet" data-calendar-header="" data-phone-bar="">
            <div className="flex h-12 items-center gap-1.5 px-3">
                <FitLabel options={titles} className="mr-auto font-display text-title-3 font-semibold tabular-nums text-ink" aria-live="polite" data-period-title="" />
                {loading ? (
                    <LoadingDot />
                ) : null}
                {view === "month" ? (
                    // The week strip carries the arrows everywhere else; a month
                    // had none, so it couldn't be left on a phone. A touch group
                    // (app/phone.css F3b): 16 px apart under a finger, so each
                    // arrow's 44 px reach (F3) stops at the other's; side by
                    // side, a tap on Previous went to Next.
                    <div className="flex shrink-0 items-center" data-month-step="" data-touch-group="">
                        <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => onStepMonth(-1)}>
                            <ChevronLeft />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => onStepMonth(1)}>
                            <ChevronRight />
                        </Button>
                    </div>
                ) : null}
                <Button variant="secondary" size="sm" onClick={onToday}>
                    Today
                </Button>
                <Button size="icon" aria-label="New event" onClick={onNew}>
                    <Plus />
                </Button>
            </div>
            {view !== "month" ? (
                <div className="flex items-center px-1 pb-2">
                    <Button variant="ghost" size="icon-sm" aria-label="Previous week" onClick={() => onStep(-1)}>
                        <ChevronLeft />
                    </Button>
                    <div className="grid flex-1 grid-cols-7" data-week-strip="">
                        {days.map((d) => (
                            <div key={d.toISOString()} className="flex flex-col items-center gap-0.5">
                                <span className="text-micro font-medium text-ink-3">{format(d, "EEEEE")}</span>
                                <DayCell date={d} today={isSameDay(d, now)} selected={view === "day" && isSameDay(d, anchor)} dot={hasItems(d)} onClick={() => onPickDay(d)} aria-label={format(d, "EEEE d MMMM")} data-touch-target="" />
                            </div>
                        ))}
                    </div>
                    <Button variant="ghost" size="icon-sm" aria-label="Next week" onClick={() => onStep(1)}>
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
                        data-touch-target=""
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
