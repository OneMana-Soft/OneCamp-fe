"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from "react";
import { addDays, addMonths, format, isSameDay, isSameMonth, parseISO, startOfWeek } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Search, SlidersHorizontal, X } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { FitLabel } from "@/components/common/FitLabel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DayCell } from "@/components/ui/dayCell";
import { ErrorState } from "@/components/ui/error-state";
import { calendarAwayDetail } from "@/lib/calendar/unavailable";
import { Skeleton } from "@/components/ui/skeleton";
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch";
import { usePreferences } from "@/lib/preferences/usePreference";
import { useAssignedTasks } from "@/hooks/useAssignedTasks";
import { OWN_ERRORS } from "@/lib/axiosInstance";
import { usePost } from "@/hooks/usePost";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import { useMedia } from "@/context/MediaQueryContext";
import { useSheetMode } from "@/components/ui/overlayMode";
import { GetEndpointUrl } from "@/services/endPoints";
import { CalendarGet, CalendarPost } from "@/services/endpoints/calendar";
import { checkInChannel, repeatsPath, taskOfAhead } from "@/lib/calendar/repeatsPath";
import type { RepeatsView } from "@/lib/calendar/repeats";
import type { UserProfileInterface } from "@/types/user";
import type { CalendarEventInterface, CreateEventPayload, GetEventsResponse } from "@/types/calendar";
import type { TaskInfoInterface } from "@/types/task";
import { cn } from "@/lib/utils/helpers/cn";
import { useDispatch, useSelector } from "react-redux";
import { useSearchParams } from "next/navigation";
import { useAppRouter } from "@/lib/navigation/appRouter";
import { closeRightPanel, openRightPanel } from "@/store/slice/desktopRightPanelSlice";
import type { RootState } from "@/store/store";
import { app_calendar_path } from "@/types/paths";
import { calendarPlace, calendarRoute } from "@/lib/calendar/route";
import { useTabInAddress } from "@/components/task/tabInAddress";
import { addressLater } from "@/lib/navigation/addressLater";
import { calendarKeyHint, calendarKeyRow, type CalendarCommand } from "@/lib/calendar/keys";
import { isMacLike } from "@/lib/keys/chord";
import { isTyping } from "@/lib/goKeys";
import { useStableCallback } from "@/hooks/useStableCallback";
import { WeekView, gutterWidth, type CalendarDraft } from "@/components/calendar/weekView";
import type { MonthItem } from "@/components/calendar/monthView";
import type { EventMenuAt } from "@/components/calendar/eventMenu";
import type { EventDraftValues } from "@/lib/calendar/duplicate";
import type { OtherCalendarsState } from "@/components/calendar/otherCalendarsLayer";
import type { OpenHow } from "@/components/calendar/eventPopover";
import { lazyView } from "@/lib/lazy/lazyView";
import { browserTZ } from "@/lib/utils/timeZone";
import { useWhenIdle } from "@/hooks/useWhenIdle";
import { useMinute } from "@/components/calendar/NowLine";
import { HueBlock } from "@/components/calendar/HueBlock";
import { IdentityMark } from "@/components/ui/graphics/IdentityMark";
import { OWN_HUE, otherHue } from "@/components/calendar/calendarTones";
import { agendaDays, agendaEmptyTitle, agendaTitles, agendaWindowFrom, nextAgendaWindow, previousAgendaWindow, type AgendaWindow } from "@/lib/utils/calendarAgenda";
import { dayKey, dayListTime, itemsByDay, placeItems } from "@/components/calendar/calendarLayout";
import { askedRange, gridDays, shownRange, spanWords, stepAnchor, weekNumber } from "@/lib/calendar/viewRange";
import { useCalendarChoices, type ViewChoices } from "@/lib/calendar/choices";
import { useGoogleSyncBroken } from "@/lib/calendar/googleSyncBroken";
import { placeAllByDates } from "@/lib/calendar/allDay";
import { dayAndTime } from "@/lib/utils/date/clock";
import { ScopePromptView, useScopePrompt } from "@/components/calendar/scopePrompt";
import { isInstanceId } from "@/lib/calendar/instanceId";
import type { RepeatScope } from "@/lib/calendar/repeat";
import { apiErrorMessage } from "@/lib/utils/apiError";
import { usePrintRoot } from "@/lib/ui/printRoot";
import { spanLabel } from "@/lib/calendar/spanLabel";

export type CalendarView = "day" | "week" | "month" | "agenda" | "custom" | "year";
const VIEWS: { id: CalendarView & CalendarCommand; label: string }[] = [
    { id: "day", label: "Day" },
    { id: "week", label: "Week" },
    { id: "month", label: "Month" },
    { id: "agenda", label: "Agenda" },
    { id: "year", label: "Year" },
];
/** A move as it was before: what its Undo puts back. */
type Move = { uuid: string; start: string; end: string; scope?: RepeatScope };
const PIN_KEY = "onecamp-calendar-pinned";

// Each opens on first use from a chunk of its own, so the route brings the grid alone (PM-3), fetched ahead when quiet or pointed at.
const QuickCreate = lazyView(() => import("@/components/calendar/quickCreateCard"));
const EventDialog = lazyView(() => import("@/components/calendar/createCalendarEventDialog"));
const Calendars = lazyView(() => import("@/components/calendar/calendarsPopover"));
const GoTo = lazyView(() => import("@/components/calendar/goToDate"));
const Menu = lazyView(() => import("@/components/calendar/eventMenu"));
const Card = lazyView(() => import("@/components/calendar/eventPopover"));
const Month = lazyView(() => import("@/components/calendar/monthView"));
/** The agenda: a phone's first view, asked for while the events load; a computer's when idle or pointed at. */
const Agenda = lazyView(() => import("@/components/calendar/calendarAgenda"));
/** Duplicate's copier (⌘D and the menu), fetched ahead with the dialog it fills. */
const Copier = { warm: () => import("@/lib/calendar/duplicate") };
/** A booked meeting's question before it moves, and Delete's question and request: only an action asks them. */
const Booked = { warm: () => import("@/lib/calendar/bookedMeeting") };
const Deleting = { warm: () => import("@/lib/calendar/confirmDelete") };
const Undo = { warm: () => import("@/components/calendar/undoToast") };
const Series = lazyView(() => import("@/components/calendar/seriesChanges"));
const OtherLayer = lazyView(() => import("@/components/calendar/otherCalendarsLayer"));
const Options = lazyView(() => import("@/components/calendar/viewOptions"));
const Week = lazyView(() => import("@/components/calendar/yourWeek/weekButton"));

/**
 * Whether the header's Your week button is out of sight, having given its room
 * to the period's title (weekButton, V-43b). The header's container query
 * decides; this reads what it decided, so the width is written once.
 */
const weekButtonHidden = (header: HTMLElement | null) => {
    const b = header?.querySelector("[data-week-button]");
    return !!b && getComputedStyle(b).display === "none";
};
const Year = lazyView(() => import("@/components/calendar/yearView"));
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
export function periodTitles(view: CalendarView, anchor: Date, choices: Partial<ViewChoices> = {}): string[] {
    if (view === "day") return [format(anchor, "EEEE d MMMM yyyy"), format(anchor, "EEE d MMM yyyy"), format(anchor, "EEE d MMM"), format(anchor, "d MMM")];
    if (view === "year") return [format(anchor, "yyyy")];
    if (view === "week" || view === "custom") {
        const { start: s, end: e } = shownRange(view, anchor, choices);
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
    // Whether an overlay is a sheet: the one rule (components/ui/overlayMode),
    // a phone in landscape too, where isMobile (the layout's width) is false.
    const sheet = useSheetMode();
    const router = useAppRouter();
    const wide = useWide();
    const now = useMinute();
    const { toast } = useToast();
    const confirm = useConfirm();
    const post = usePost();
    // A change to one instance asks which of the series it is for (D-CAL-6), through the calendar's own API.
    const { ask: askScope, prompt: scopePrompt } = useScopePrompt();

    // Where it opens: the place its address names (a reload, Back, a link to a
    // day), else this week (FE-F-2).
    const [opened] = useState(() => calendarPlace(new URLSearchParams(typeof window === "undefined" ? "" : window.location.search)));
    const [anchor, setAnchor] = useState(() => opened.date ?? new Date());
    const [view, setView] = useState<CalendarView>(opened.view ?? "week");
    // The choices kept on this device (lib/calendar/choices): calendars hidden, how views are laid out.
    const kept = useCalendarChoices();
    // A link's custom length is for this visit; one chosen here replaces it.
    const [linkSpan, setLinkSpan] = useState(opened.span);
    const choices = useMemo(() => (linkSpan ? { ...kept.view, span: linkSpan } : kept.view), [kept.view, linkSpan]);
    // Phones open on the agenda until the person picks a view themselves; a
    // phone has no week grid, so a week there is its day.
    const [viewChosen, setViewChosen] = useState(!!opened.view);
    const shownView: CalendarView = !viewChosen && isMobile ? "agenda" : isMobile && (view === "week" || view === "custom") ? "day" : view;
    // Which way the period moved, for its slide.
    const [dir, setDir] = useState<1 | -1>(1);
    // The desktop agenda's window once it has been paged; until then it runs
    // from the chosen day to the month's end (CAL-BUG-19).
    const [agendaPage, setAgendaPage] = useState<AgendaWindow | null>(null);
    const deskAgenda = shownView === "agenda" && !isMobile;
    const agendaWindow = useMemo(() => agendaPage ?? agendaWindowFrom(anchor), [agendaPage, anchor]);

    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [calendarsOpen, setCalendarsOpen] = useState(false);
    const [optionsOpen, setOptionsOpen] = useState(false);
    // Your week leads View options while its header button has given its room
    // to the title. Decided here, at open, for the options and for the room
    // their placeholder keeps while their code loads (V-56).
    const [optionsWithWeek, setOptionsWithWeek] = useState(false);
    const headerRef = useRef<HTMLElement>(null);
    const openOptions = useCallback((open: boolean) => {
        if (open) setOptionsWithWeek(weekButtonHidden(headerRef.current));
        setOptionsOpen(open);
    }, []);
    // A dialog the Calendars panel opens, held here to outlive it.
    const [dialog, setDialog] = useState<{ open: (close: () => void) => ReactNode } | null>(null);
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
    // A phone opens the full form alone, as a sheet (no quick create), the
    // event's card as a sheet, and its month view; Calendars and Go to are the
    // wide layout's.
    useWhenIdle(() => [...(sheet ? [] : [QuickCreate]), ...(isMobile ? [] : [Calendars, GoTo, Menu, Options, Year]), EventDialog, Card, Month, Agenda, Copier, Series, ScopePromptView, Booked, Deleting, Undo].forEach((surface) => ahead(surface)()));
    // Quick create and the dialog stay mounted from their first use on, so
    // each keeps its state and plays its closing motion.
    const [quickUsed, setQuickUsed] = useState(false);
    if (draft && !quickUsed) setQuickUsed(true);
    const [dialogUsed, setDialogUsed] = useState(false);
    if (fullOpen && !dialogUsed) setDialogUsed(true);
    const [cardUsed, setCardUsed] = useState(false);
    if (selected && !cardUsed) setCardUsed(true);

    // One read for the month grid around the date and a custom range past it (askedRange): switching views asks for nothing.
    const monthKey = format(anchor, "yyyy-MM");
    const shownNow = shownRange(shownView, anchor, choices);
    const shownKey = `${+shownNow.start}-${+shownNow.end}`;
    // By the range alone, as the grids take it: a card opening draws neither (C3).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const shown = useMemo(() => shownNow, [shownKey]);
    const asked = askedRange(shownView, anchor, choices);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- by the range alone, so a step within it keeps every list made from it (fluid-10)
    const { start: gridStart, end: gridEnd } = useMemo(() => asked, [`${+asked.start}-${+asked.end}`]);
    const rangeQuery = `startDate=${gridStart.toISOString()}&endDate=${gridEnd.toISOString()}`;
    const keep = { keepPreviousData: true };
    // The calendar says a failed load itself (over the grid, with Try
    // again), so the global error toast stays quiet: it doubled the message.
    const { data: eventsRes, isLoading: isLoadingEvents, isError: eventsError, mutate: mutateEvents } = useFetch<GetEventsResponse>(
        `${GetEndpointUrl.GoogleCalendarEvents}?${rangeQuery}`, undefined, keep, OWN_ERRORS
    );
    // Every task of the grid, page by page: it asked for 100 and showed them as the month (FE-F-1).
    const { data: tasksRes, isLoading: isLoadingTasks, isError: tasksError, mutate: mutateTasks } = useAssignedTasks(rangeQuery, OWN_ERRORS);
    // Check-ins and repeating tasks ahead (head 9); quiet when it fails.
    const { data: repeatsRes, mutate: mutateRepeats } = useFetch<{ data: RepeatsView }>(repeatsPath(gridStart, gridEnd), undefined, keep, OWN_ERRORS);
    const [repeated, setRepeated] = useState<{ events: CalendarEventInterface[]; tasks: TaskInfoInterface[] }>({ events: [], tasks: [] });
    useEffect(() => {
        const view = repeatsRes?.data;
        if (view) void import("@/lib/calendar/repeats").then((m) => setRepeated({ events: m.checkInEvents(view), tasks: m.tasksAhead(view) }));
    }, [repeatsRes]);
    const { data: gcalStatus, mutate: mutateGcalStatus } = useFetch<{ data: { isConnected: boolean; accountEmail?: string } }>(GetEndpointUrl.GoogleCalendarStatus);
    const { data: bookingRes } = useFetch<{ data: unknown[] }>(calendarsOpen || railShown ? CalendarGet.GetBookingPages : "");
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile);
    const selfId = selfProfile?.data?.data?.user_uuid;
    // Your working hours (calendar A3), drawn where your zone is the grid's.
    const prefs = usePreferences();
    const workHours = prefs?.zone === browserTZ() ? (prefs?.["calendar.working_hours"] as Record<string, { start: string; end: string }[]> | null) : null;
    // Zones you keep beside yours (head 6): a column each.
    const keptZones = prefs?.["calendar.zones"];
    const zones = Array.isArray(keptZones) ? (keptZones as { zone: string; label?: string }[]) : undefined;
    const loading = isLoadingEvents || isLoadingTasks;
    // Other calendars beside your own (A6), from their own chunk.
    const [others, setOthers] = useState<OtherCalendarsState>();
    // A failed load is not a free month: every view says so, in one place.
    const ownFailed = !!(eventsError || tasksError);
    const failed = !loading && ownFailed;
    // Nor is a teammate whose calendar couldn't be read free (F2), but that is
    // partial data: your own week stays drawn and live, and one row above it
    // says their times are missing. Both failing is said once, as yours.
    const othersFailed = !ownFailed && !!others?.error;
    // R, and Try again: asked again, with the dot by the period meanwhile.
    const [refreshing, setRefreshing] = useState(false);
    const refresh = useCallback(() => {
        if (refreshing) return;
        setRefreshing(true);
        void Promise.allSettled([mutateEvents(), mutateTasks(), mutateRepeats(), others?.refresh()]).finally(() => setRefreshing(false));
    }, [refreshing, mutateEvents, mutateTasks, mutateRepeats, others]);
    const googleConnected = !!gcalStatus?.data?.isConnected;
    // Which Google account it is ("" for a link made before the server said).
    const googleAccount = gcalStatus?.data?.accountEmail || undefined;
    const googleBroken = useGoogleSyncBroken(googleConnected);

    // Back from Google's consent screen (CAL-BUG-8), said by a chunk of its own.
    useEffect(() => {
        if (window.location.search.includes("connector=")) void import("@/lib/calendar/googleReturn").then((m) => m.sayGoogleReturn(mutateGcalStatus, mutateEvents, toast));
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on landing
    }, []);

    // Your own rows are choices like any calendar's (A6), so a phone hides them too.
    const hidden = others?.hidden ?? kept.hidden;
    const showEvents = !hidden.includes("onecamp");
    const showGoogle = !hidden.includes("google");
    const showTasks = !hidden.includes("tasks");
    const otherEvents = others?.events;
    // Google all-day events are placed by their dates from here on (CAL-BUG-2).
    const allEvents = useMemo(() => placeAllByDates([...(eventsRes?.data || []), ...(otherEvents || [])]), [eventsRes, otherEvents]);
    // Each calendar's events as its row says (A6).
    const events = useMemo(() => {
        const shown = allEvents.filter((e) => (e.event_uuid.startsWith("gcal-") ? showGoogle : !!others || showEvents));
        const dressed = others ? others.dress(shown, showEvents) : shown;
        // Check-ins: drawn, never moved (canMove reads allEvents).
        return showEvents ? [...dressed, ...repeated.events] : dressed;
    }, [allEvents, showEvents, showGoogle, others, repeated]);
    const tasks = useMemo(() => tasksRes?.data?.user_tasks || [], [tasksRes]);
    const gridTasks = useMemo(() => [...tasks, ...repeated.tasks], [tasks, repeated]);
    const q = searchQuery.trim().toLowerCase();
    // Search dims what doesn't match on the grids (content.md C02); the agenda lists only matches.
    const matches = useCallback((title: string) => !q || title.toLowerCase().includes(q), [q]);

    const placed = useMemo(() => {
        const items: MonthItem[] = events.map((e) => ({ ...e, isTask: false }));
        if (showTasks) {
            for (const t of gridTasks) {
                const startStr = t.task_start_date || t.task_due_date;
                const endStr = t.task_due_date || t.task_start_date;
                if (!startStr || !endStr) continue;
                items.push({ event_uuid: t.task_uuid, event_title: t.task_name, event_start_time: startStr, event_end_time: endStr, isTask: true, task_project: t.task_project, task_status: t.task_status });
            }
        }
        return placeItems(items);
    }, [events, gridTasks, showTasks]);
    const byDay = useMemo(() => itemsByDay(placed, gridStart, gridEnd), [placed, gridStart, gridEnd]);
    // The month, or a custom range of weeks, on the month's grid.
    const monthly = shownView === "month" || (shownView === "custom" && choices.span.endsWith("w"));

    // The days a time grid draws (a hidden weekend left out), and the weeks' numbers when shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- by the range's key: a step within it draws the same days
    const drawn = useMemo(() => gridDays(shownView, anchor, choices), [shownView, shownKey, choices.weekends]);
    const weekLabel = useMemo(() => (choices.weekNumbers ? (d: Date) => `W${weekNumber(d, choices.weekStartsOn)}` : undefined), [choices.weekNumbers, choices.weekStartsOn]);
    const monthBlank = shownView === "month" && !loading && !failed && ![...byDay.keys()].some((k) => k.startsWith(monthKey));
    const weekStart = useMemo(() => startOfWeek(anchor, { weekStartsOn: choices.weekStartsOn }), [anchor, choices.weekStartsOn]);
    const shownWeek = useRef(weekStart);
    shownWeek.current = weekStart;
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
        goTo(stepAnchor(shownView, anchor, s, choices));
    }, [deskAgenda, agendaWindow, shownView, anchor, goTo, choices]);
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

    // An event opened in full: at its page on a phone, beside the calendar on a
    // computer. `edit` opens it editing (the card's pencil, Edit event: V-34).
    const openFull = useCallback((uuid: string, how?: OpenHow) => {
        setSelected(null);
        const channel = checkInChannel(uuid);
        if (channel) return void import("@/lib/conversation/route").then((m) => router.push(m.route({ conversation: { kind: "channel", id: channel } })));
        if (isMobile) {
            router.push(calendarRoute({ event: uuid, edit: how?.edit }));
            return;
        }
        // The panel loads the event by its id, showing the calendar's copy meanwhile.
        dispatch(openRightPanel({ eventUUID: uuid, ...(how?.edit ? { eventEditAt: Date.now() } : {}) }));
    }, [isMobile, router, dispatch]);
    const openTask = useCallback((id: string) => {
        const uuid = taskOfAhead(id);
        if (isMobile) router.push(`/app/task/${uuid}`);
        else dispatch(openRightPanel({ taskUUID: uuid }));
    }, [isMobile, router, dispatch]);

    // ---- the address --------------------------------------------------------

    // The event an address names opens whatever the panel had: the address
    // wins. On a phone it opens at its own page, and the address drops it
    // first, so Back comes to the calendar rather than to the event again.
    const inAddress = useTabInAddress();
    const openNamed = useCallback((uuid: string) => {
        if (!isMobile) return openFull(uuid);
        inAddress({ event: null });
        openFull(uuid);
    }, [isMobile, openFull, inAddress]);
    useEffect(() => {
        if (opened.event) openNamed(opened.event);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on opening
    }, []);

    // The address says where you are, written once the place is still a second (fluid-10);
    // a press, a key, a move or leaving writes it at once (lib/navigation/addressLater; F4).
    const rightPanel = useSelector((s: RootState) => s.rightPanel.rightPanelState);
    const panelEvent = !isMobile && rightPanel.isOpen ? rightPanel.data.eventUUID || null : null;
    const span = viewChosen && view === "custom" ? choices.span : null;
    const shownPlace = `${dayKey(anchor)} ${viewChosen ? view : ""} ${panelEvent ?? ""} ${span}`;
    const writtenPlace = useRef(shownPlace);
    const ourAddress = useRef<string | null>(null);
    useEffect(() => {
        if (shownPlace === writtenPlace.current || window.location.pathname !== app_calendar_path) return;
        return addressLater(() => {
            writtenPlace.current = shownPlace;
            const search = inAddress({ date: dayKey(anchor), view: viewChosen ? view : null, event: panelEvent, span });
            if (search !== null) ourAddress.current = search;
        }, 1000);
    }, [shownPlace, anchor, view, viewChosen, panelEvent, span, inAddress]);

    // A link to a day or an event while the calendar is open, or Back: the
    // calendar goes where the address now says.
    const followAddress = useCallback((place: ReturnType<typeof calendarPlace>) => {
        if (place.date && dayKey(place.date) !== dayKey(anchor)) goTo(place.date);
        if (place.view && (place.view !== view || !viewChosen)) pickView(place.view);
        if (place.span && place.span !== choices.span) setLinkSpan(place.span);
        if (place.event && place.event !== panelEvent) openNamed(place.event);
    }, [anchor, view, viewChosen, panelEvent, goTo, pickView, openNamed, choices.span]);
    const clickItem = useCallback((item: { event_uuid: string; isTask?: boolean }, el: HTMLElement) => {
        if (item.isTask) return openTask(item.event_uuid);
        if (checkInChannel(item.event_uuid)) return openFull(item.event_uuid);
        setDraft(null);
        setSelected((cur) => (cur?.uuid === item.event_uuid ? null : { uuid: item.event_uuid, el }));
    }, [openTask, openFull]);

    // Only your own OneCamp events move: not Google's, nor another calendar's.
    const canMove = useCallback((uuid: string) => {
        if (uuid.startsWith("gcal-") || (others && !others.ownIds.has(uuid))) return false;
        const e = allEvents.find((x) => x.event_uuid === uuid);
        return !!e && !e.event_read_only && (!e.event_created_by || e.event_created_by.user_uuid === selfId);
    }, [allEvents, selfId, others]);

    /** An event's new times, through the existing update call. */
    const sendTimes = useCallback((e: CalendarEventInterface, start: Date, end: Date) =>
        post.makeRequest<CreateEventPayload>({
            apiEndpoint: (CalendarPost.UpdateCalendarEvent + `/${e.event_uuid}`) as string,
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
        void changeTimes(move.uuid, parseISO(move.start), parseISO(move.end), true, false, move.scope);
        return true;
    });

    /** A move or resize: drawn at once, put back if it fails; a toast with Undo. A booked meeting asks first (CAL-BUG-4). */
    // A task carried onto the hours: a block of its time (the events API loads on this first use).
    const blockTime = useCallback(async (taskUUID: string, start: Date, end: Date, title = "") => {
        try {
            const api = await import("@/lib/calendar/eventsApi");
            const zone = api.readerZone();
            const made = (await post.makeRequest(api.createApiEventRequest({ kind: "task_block", task_uuid: taskUUID, title, start: { at: start.toISOString(), zone }, end: { at: end.toISOString(), zone } }))) as { title?: string } | undefined;
            await mutateEvents();
            if (made?.title) toast({ title: `Time blocked for “${made.title}”`, description: spanLabel(start, end) });
            return !!made;
        } catch {
            // The request said what went wrong.
            return false;
        }
    }, [post, mutateEvents, toast]);

    const changeTimes = useCallback(async (uuid: string, start: Date, end: Date, undoing = false, confirmed = false, scoped?: RepeatScope): Promise<void> => {
        const e = allEvents.find((x) => x.event_uuid === uuid);
        if (!e) return;
        if (e.event_booking && !confirmed) {
            const { bookedMeetingConfirm } = await Booked.warm();
            confirm({
                ...bookedMeetingConfirm(e.event_booking, "move", start, end),
                onConfirm: () => changeTimes(uuid, start, end, undoing, true, scoped),
            });
            return;
        }
        // One instance of a repeating event: which of them move. Closed, the
        // prompt moves nothing.
        let scope = scoped;
        if (!scope && isInstanceId(uuid)) {
            const picked = await askScope("change");
            if (!picked) return;
            scope = picked;
        }
        const chosen = scope;
        if (chosen && chosen !== "this") {
            // Many instances move (components/calendar/seriesChanges says how
            // it went), and the calendar asks again for where they went.
            await Series.warm().then(
                (m) => m.moveInstances(post, toast, e, start, end, chosen),
                (err) => toast({ title: `Couldn't move “${e.event_title}”`, description: apiErrorMessage(err, "Nothing moved."), variant: "destructive" }),
            );
            void mutateEvents();
            return;
        }
        const before = { start: e.event_start_time, end: e.event_end_time };
        const patch = (s: string, en: string) => (cur: GetEventsResponse | undefined) =>
            cur?.data ? { ...cur, data: cur.data.map((x) => (x.event_uuid === uuid ? { ...x, event_start_time: s, event_end_time: en } : x)) } : cur;
        void mutateEvents(patch(start.toISOString(), end.toISOString()), { revalidate: false });
        let saved = false;
        let why: unknown;
        try {
            saved = (await (chosen ? Series.warm().then((m) => m.sendInstanceTimes(post, e, start, end, chosen)) : sendTimes(e, start, end))) !== undefined;
        } catch (err) {
            saved = false;
            why = err;
        }
        if (!saved) {
            void mutateEvents(patch(before.start, before.end), { revalidate: true });
            toast({ title: `Couldn't move “${e.event_title}”`, description: scope ? apiErrorMessage(why, "It's back where it was.") : "It's back where it was.", variant: "destructive" });
            return;
        }
        void mutateEvents();
        if (undoing) {
            toast({ title: `Moved “${e.event_title}” back`, description: dayAndTime(start, end) });
            return;
        }
        const move: Move = { uuid, start: before.start, end: before.end, scope };
        lastMove.current = move;
        // Its Undo comes with its chunk; if that can't load, Z still undoes.
        const action = await Undo.warm().then((m) => m.undoAction(() => undoMove(move)), () => undefined);
        toast({ title: `Moved “${e.event_title}”`, description: dayAndTime(start, end), action });
    }, [allEvents, mutateEvents, sendTimes, post, toast, confirm, undoMove, askScope]);

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
        if (sheet) {
            openDialog({ title: "", start: d.start, end: d.end, isFocus: false, guests: [] });
            return;
        }
        setDraft(d);
        setDraftAnchor(el);
    }, [isMobile, sheet, shownView, goTo, pickView, openDialog]);

    // Delete, from its key (and the menu): only your own OneCamp events, asked
    // first and sent as the event's panel asks and sends it.
    const removeEvent = useCallback(async (ev: CalendarEventInterface) => {
        try {
            const { deleteEventRequest } = await Deleting.warm();
            await post.makeRequest(deleteEventRequest(ev.event_uuid));
        } catch {
            return; // The toast said why.
        }
        setSelected((cur) => (cur?.uuid === ev.event_uuid ? null : cur));
        if (panelEvent === ev.event_uuid) dispatch(closeRightPanel());
        void mutateEvents((cur: GetEventsResponse | undefined) => (cur?.data ? { ...cur, data: cur.data.filter((x) => x.event_uuid !== ev.event_uuid) } : cur), { revalidate: true });
    }, [post, panelEvent, dispatch, mutateEvents]);
    const askDelete = useCallback(async (ev: CalendarEventInterface) => {
        if (!canMove(ev.event_uuid)) {
            toast(
                ev.event_uuid.startsWith("gcal-")
                    ? { title: "This event is in Google Calendar", description: "Delete it there, and it goes from here too." }
                    : { title: "Only its organiser can delete it", description: "You can leave it from its details instead." },
            );
            return;
        }
        // One instance of a repeating event: the prompt asks which of them
        // go to the trash, in place of the plain question.
        if (isInstanceId(ev.event_uuid)) {
            const scope = await askScope("delete");
            // Not gone: the request's toast said why.
            if (!scope || !(await Series.warm().then((m) => m.trashInstances(post, ev.event_uuid, scope), () => false))) return;
            setSelected((cur) => (cur?.uuid === ev.event_uuid ? null : cur));
            if (panelEvent === ev.event_uuid) dispatch(closeRightPanel());
            void mutateEvents();
            return;
        }
        const { deleteEventConfirm } = await Deleting.warm();
        confirm({ ...deleteEventConfirm(ev), destructive: true, onConfirm: () => removeEvent(ev) });
    }, [canMove, toast, confirm, removeEvent, askScope, post, panelEvent, dispatch, mutateEvents]);

    // Duplicate (⌘D, the menu): the dialog with a copy, never the call link (EV-58); its code a chunk beside the dialog's.
    const duplicate = useCallback((ev: CalendarEventInterface) => {
        setSelected(null);
        setDraft(null);
        ahead(EventDialog)();
        // A copier that failed to come (offline) says so; the next press asks for it again.
        Copier.warm().then(
            ({ duplicateOf, joinLinkOf }) => openDialog(duplicateOf(ev, joinLinkOf(ev), selfId)),
            () => toast({ title: `Couldn't copy “${ev.event_title}”`, description: "Check your connection and try again.", variant: "destructive" }),
        );
    }, [selfId, openDialog, toast]);

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
    // The calendar prints alone (View options › Print, or the browser's own).
    const printRoot = usePrintRoot();
    const onContextMenu = (e: ReactMouseEvent) => {
        const from = (e.target as HTMLElement).closest?.<HTMLElement>("[data-event-uuid]");
        if (from && openMenu(from, e.clientX || e.clientY ? { x: e.clientX, y: e.clientY } : undefined)) e.preventDefault();
    };
    const menuItems = (ev: CalendarEventInterface, copy: (text: string, message: string) => unknown) => [
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

    /** The calendar's keys, from one table (lib/calendar/keys). A key taken goes no further, so it never lands in a field it opened. */
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
            custom: () => took(() => pickView("custom")),
            year: () => took(() => pickView("year")),
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

    const titles = useMemo(() => (deskAgenda ? agendaTitles(agendaWindow) : periodTitles(shownView, anchor, choices)), [deskAgenda, agendaWindow, shownView, anchor, choices]);
    const unit = shownView === "custom" ? spanWords(choices.span) : shownView === "day" || shownView === "week" || shownView === "year" ? shownView : "month";
    const viewIndex = VIEWS.findIndex((v) => v.id === shownView);
    const stepBy = useStableCallback(step);
    const toToday = useStableCallback(() => goTo(new Date()));
    const periodKey = `${shownView}:${deskAgenda ? dayKey(agendaWindow.from) : shownView === "month" ? monthKey : dayKey(shown.start)}`;

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
                    rows={m.ownRows({ hidden, others, google: googleConnected, weekCount, tasks })}
                    bookingCount={bookingRes?.data?.length}
                    onBookingPages={() => {
                        setCalendarsOpen(false);
                        router.push("/app/calendar/booking");
                    }}
                    googleConnected={googleConnected}
                    googleAccount={googleAccount}
                    refreshGoogle={mutateGcalStatus}
                    mutateEvents={mutateEvents}
                    confirm={confirm}
                    canPin={wide}
                    pinned={pinned}
                    onTogglePin={togglePin}
                    onImported={refresh}
                    others={others}
                    onDialog={(open) => {
                        setCalendarsOpen(false);
                        setDialog({ open });
                    }}
                    countOf={(id) => weekCount((i) => i.event_calendar_id === id)}
                />
            )}
        />
    );

    // A task sits on its due day in a list; drawn on every day it spans, one task filled a week.
    const agendaItems = useCallback(
        (day: Date) => (byDay.get(dayKey(day)) || []).filter((item) => (!item.isTask || isSameDay(parseISO(item.event_end_time), day)) && matches(item.event_title)),
        [byDay, matches],
    );
    // The agenda's days keep while an event's card opens, so the agenda isn't drawn for it (C3).
    const agendaShown = useMemo(
        () => (shownView !== "agenda" ? [] : isMobile ? agendaDays(gridStart, gridEnd, agendaItems) : agendaDays(agendaWindow.from, agendaWindow.to, agendaItems, now, false)),
        [shownView, isMobile, gridStart, gridEnd, agendaWindow, agendaItems, now],
    );
    const hasItems = useCallback((d: Date) => byDay.has(dayKey(d)), [byDay]);

    // Kept while an event's card opens, so neither is drawn for it (C3).
    const dayRail = useMemo(() => {
        const dayItems = byDay.get(dayKey(anchor)) || [];
        return (
            <div className="flex flex-col gap-4 p-4">
                <Calendars.View
                    fallback={<div aria-hidden="true" className="h-[258px]" />}
                    render={(m) => <m.MiniMonth anchor={anchor} view="day" hasItems={hasItems} onPick={goTo} />}
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
                                    <span className="shrink-0 text-meta font-[450] tabular-nums">
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
    }, [byDay, anchor, now, hasItems, goTo, clickItem]);

    // The toolbar's parts that don't change with the period are kept as they
    // were, so a new period draws its title and grid alone (fluid-10).
    const steps = useMemo(
        () => (
            <>
                <div className="ml-1 flex shrink-0 items-center" data-touch-group="">
                    <Button variant="ghost" size="icon-sm" onClick={() => stepBy(-1)} aria-label={`Previous ${unit}`} title={`Previous ${unit} · ${calendarKeyHint("previous")}`}>
                        <ChevronLeft />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => stepBy(1)} aria-label={`Next ${unit}`} title={`Next ${unit} · ${calendarKeyHint("next")}`}>
                        <ChevronRight />
                    </Button>
                </div>
                <Button variant="secondary" size="xs" onClick={toToday} title={`Today · ${calendarKeyHint("today")}`}>
                    Today
                </Button>
            </>
        ),
        [unit, stepBy, toToday],
    );
    const viewLink = useStableCallback(() => new URL(calendarRoute({ date: anchor, view: viewChosen ? view : null, span }), location.origin).toString());
    const pickSpan = useCallback(() => {
        setLinkSpan(undefined);
        pickView("custom");
    }, [pickView]);
    // Print: the options close first, so the page is clear behind the print dialog.
    const printView = useCallback(() => {
        setOptionsOpen(false);
        requestAnimationFrame(() => window.print());
    }, []);
    const ownEvents = eventsRes?.data;
    const otherLayer = useMemo(() => <OtherLayer.View fallback={null} render={(m) => <m.default from={gridStart} to={gridEnd} own={ownEvents} onChange={setOthers} />} />, [gridStart, gridEnd, ownEvents]);
    const openPanel = calendarsOpen ? panel : null;
    const actions = useMemo(
        () => (
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
                {/* Search: an icon that opens into a field; matches stay, the rest dim. */}
                {searchOpen ? (
                    <div className="content-view-in flex h-7 w-56 items-center gap-1.5 rounded-lg bg-raised px-2 shadow-e1 focus-within:focus-halo">
                        <Search className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
                        <input
                            autoFocus
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            data-escape-own=""
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
                    <Button variant="ghost" size="icon-sm" className="@max-[52rem]/calhead:hidden" aria-label="Search events" title={`Search · ${calendarKeyHint("search")}`} onClick={() => setSearchOpen(true)}>
                        <Search />
                    </Button>
                )}
                {!railShown ? (
                    <Popover open={calendarsOpen} onOpenChange={setCalendarsOpen}>
                        <PopoverTrigger asChild>
                            <Button variant="ghost" size="sm" data-calendars-trigger="" aria-label={googleBroken ? "Calendars, Google needs connecting again" : "Calendars"} onPointerEnter={ahead(Calendars)} onFocus={ahead(Calendars)}>
                                {/* Google stopped answering (C9): a danger dot. */}
                                <span className="relative flex">
                                    <CalendarDays />
                                    {googleBroken ? <span aria-hidden="true" data-google-broken="" className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-destructive ring-2 ring-sheet" /> : null}
                                </span>
                                {/* On a narrow sheet the icon and its colours carry it, so the period keeps its room. */}
                                <span className="hidden @[61rem]/calhead:inline">Calendars</span>
                                {/* The calendars on show, as their colours. */}
                                <span className="flex items-center gap-0.5" aria-hidden="true">
                                    {showEvents ? <IdentityMark hue={OWN_HUE} variant="dot" size={6} className="!size-1.5" /> : null}
                                    {googleConnected && showGoogle ? <IdentityMark hue={otherHue("google")} variant="dot" size={6} className="!size-1.5" /> : null}
                                </span>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="content-float w-[300px] rounded-xl bg-pop p-3 shadow-e3">
                            {openPanel}
                        </PopoverContent>
                    </Popover>
                ) : null}
                {/* The view switch: five buttons over one sliding thumb, narrower (the search,
                    which / opens, aside) under 52rem of header, initials under 46rem (calendar.css). */}
                <div role="group" aria-label="View" data-calendar-views="" className="relative flex rounded-lg bg-sunken p-0.5 [--seg:64px] @max-[52rem]/calhead:[--seg:52px]">
                    <span
                        aria-hidden="true"
                        data-thumb=""
                        className="calendar-thumb absolute bottom-0.5 left-0.5 top-0.5 rounded-md bg-raised shadow-e1"
                        style={{ width: "var(--seg)", transform: `translateX(calc(var(--seg) * ${Math.max(viewIndex, 0)}))`, opacity: viewIndex < 0 ? 0 : undefined }}
                    />
                    {VIEWS.map((v) => (
                        <button
                            key={v.id}
                            type="button"
                            aria-pressed={shownView === v.id}
                            onClick={() => pickView(v.id)}
                            onPointerEnter={v.id === "month" ? ahead(Month) : v.id === "agenda" ? ahead(Agenda) : undefined}
                            title={`${v.label} · ${calendarKeyHint(v.id)}`}
                            style={{ width: "var(--seg)" }}
                            data-touch-target=""
                            className={cn(
                                "relative h-6 rounded-md text-ui-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand",
                                shownView === v.id ? "text-ink" : "text-ink-3 hover:text-ink",
                            )}
                        >
                            <span className="calendar-view-name">{v.label}</span>
                        </button>
                    ))}
                </div>
                <Week.View fallback={<i className="w-8 @max-[40rem]/calhead:hidden" data-week-button="" />} render={(m) => <m.WeekButton week={shownWeek} />} />
                {/* View options: the custom view (named here while it shows) and the layout. */}
                <Popover open={optionsOpen} onOpenChange={openOptions}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            aria-label="View options"
                            aria-pressed={shownView === "custom"}
                            title="View options"
                            data-view-options-trigger=""
                            // Chosen (a custom view) and open are states, not actions: icon and words in ink, never the accent.
                            data-tone="neutral"
                            className="aria-pressed:text-ink data-[state=open]:text-ink"
                            onPointerEnter={ahead(Options)}
                            onFocus={ahead(Options)}
                        >
                            <SlidersHorizontal />
                            {shownView === "custom" ? <span className="tabular-nums">{spanWords(choices.span)}</span> : null}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="content-float w-[300px] rounded-xl bg-pop p-0 shadow-e3">
                        {/* While its code loads, the card keeps the loaded view's height: 565 px with Your week
                            (in its own 180 px loading box), 330 px without. calendarHeaderFit's "View options
                            while its code loads" holds both, so the card never grows as it lands (V-56). */}
                        {optionsOpen ? <Options.View fallback={<div className={optionsWithWeek ? "h-[565px]" : "h-[330px]"} />} render={(m) => <m.ViewOptions span={choices.span} onSpan={pickSpan} link={viewLink} onPrint={printView} week={shownWeek} withWeek={optionsWithWeek} />} /> : null}
                    </PopoverContent>
                </Popover>
                <Button
                    size="sm"
                    onClick={newEvent}
                    title={`New event · ${calendarKeyHint("newEvent")}`}
                    aria-label="New event"
                    data-new-event=""
                    onPointerEnter={ahead(EventDialog)}
                    onFocus={ahead(EventDialog)}
                    className="@max-[57rem]/calhead:w-8 @max-[57rem]/calhead:px-0"
                >
                    <Plus />
                    {/* Under 57rem of header (a tablet's 768 beside the rail) the words go
                        and the plus stays, so the period's title keeps "12–18 Oct": it
                        was cut to "12–18 …" there. */}
                    <span className="hidden @[57rem]/calhead:inline">New event</span>
                    {/* The hint goes first when the sheet narrows (kbd sets its own display, so a wrapper hides it). */}
                    <span className="hidden @[60rem]/calhead:contents">
                        <kbd className="kbd" aria-hidden="true">
                            {calendarKeyHint("newEvent")}
                        </kbd>
                    </span>
                </Button>
            </div>
        ),
        [searchOpen, searchQuery, railShown, calendarsOpen, openPanel, showEvents, googleConnected, googleBroken, showGoogle, shownView, viewIndex, pickView, newEvent, optionsOpen, openOptions, optionsWithWeek, choices.span, viewLink, pickSpan, printView],
    );
    // The week's inputs keep while an event's card opens, so the week isn't drawn for it (C3):
    // its days are `drawn`, kept by the range they show.
    const clickById = useCallback((uuid: string, el: HTMLElement) => clickItem({ event_uuid: uuid }, el), [clickItem]);
    const menuAt = useStableCallback((_: unknown, el: HTMLElement) => void openMenu(el));
    const openItem = useCallback((it: MonthItem) => (it.isTask ? openTask(it.event_uuid) : openFull(it.event_uuid)), [openTask, openFull]);
    const canMoveItem = useCallback((it: MonthItem) => canMove(it.event_uuid), [canMove]);
    // From the year: a day opens its day, a month's name its month.
    const openDay = useCallback((d: Date) => {
        goTo(d);
        pickView("day");
    }, [goTo, pickView]);
    const openMonth = useCallback((d: Date) => {
        goTo(d);
        pickView("month");
    }, [goTo, pickView]);

    return (
        <div ref={printRoot} className="relative flex h-full w-full overflow-hidden bg-sheet" data-calendar="" data-print-root="" onContextMenu={onContextMenu}>
            <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
                <h1 className="sr-only">Calendar</h1>
                {isMobile ? (
                    <PhoneBar
                        titles={titles}
                        anchor={anchor}
                        view={shownView}
                        now={now}
                        hasItems={hasItems}
                        goTo={goTo}
                        onView={pickView}
                        weekStart={weekStart}
                        onNew={newEvent}
                        loading={loading || refreshing}
                    />
                ) : (
                    <header ref={headerRef} className="@container/calhead relative z-20 flex h-[52px] shrink-0 items-center gap-2 border-b border-line bg-sheet px-4" data-calendar-header="">
                        {/* Where you are: the period, then back, forward and today. The
                            group takes the room the actions leave, and the period says as
                            much of itself as fits there (no "Oct 20…"). */}
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                            <FitLabel options={titles} className="font-display text-title-3 font-semibold tabular-nums text-ink" aria-live="polite" data-period-title="" />
                            {loading || refreshing ? (
                                <LoadingDot className="ml-0.5" />
                            ) : null}
                            {steps}
                        </div>

                        {actions}
                    </header>
                )}

                {/* The calendars beside yours, when their read failed: in the page's flow, never over your week. */}
                {others ? <OtherLayer.View fallback={null} render={(m) => <m.OthersFailedRow shown={othersFailed} retrying={refreshing} onRetry={refresh} />} /> : null}

                <div className="custom-scrollbar relative min-h-0 flex-1 overflow-auto overscroll-contain bg-sheet" aria-busy={loading || undefined} onPointerEnter={() => [QuickCreate, Card].forEach((surface) => ahead(surface)())}>
                    {failed ? (
                        // Over the grid, where an empty view says it is empty.
                        <div className="absolute inset-0 z-40 flex items-start justify-center bg-sheet/90 pt-16" data-calendar-failed="">
                            <ErrorState subject="your calendar" onRetry={refresh} retrying={refreshing} detail={calendarAwayDetail(eventsError)} />
                        </div>
                    ) : null}
                    {/* One wrapper per period: a new period slides in from the side it came from. */}
                    <div key={periodKey} className={cn("h-full", dir > 0 ? "content-period-next" : "content-period-prev")} data-period={periodKey}>
                        {shownView === "year" ? (
                            <Year.View
                                fallback={<div className="h-full" aria-busy="true" />}
                                render={(m) => <m.YearView year={anchor} byDay={byDay} today={dayKey(now)} weekStartsOn={choices.weekStartsOn} onDay={openDay} onMonth={openMonth} />}
                            />
                        ) : shownView === "agenda" ? (
                            failed ? null : (
                                <Agenda.View
                                    fallback={<AgendaSkeleton />}
                                    render={(m) =>
                                        loading && !eventsRes ? (
                                            <AgendaSkeleton />
                                        ) : (
                                            <m.CalendarAgenda
                                                desktop={!isMobile}
                                                now={now}
                                                days={agendaShown}
                                                onOpen={clickItem}
                                                onNewEvent={newEvent}
                                                emptyTitle={isMobile ? undefined : agendaEmptyTitle(agendaWindow, now)}
                                            />
                                        )
                                    }
                                />
                            )
                        ) : !monthly ? (
                            // Days scroll sideways only below the gutter and 90 px a day
                            // (686 px for a week): at 760 a tablet's 712 px sheet hid Sunday,
                            // today's column, off the right edge.
                            <div className="h-full" style={{ minWidth: drawn.length > 1 ? gutterWidth(zones?.length ?? 0) + 90 * drawn.length : undefined }}>
                                <WeekView
                                    workHours={workHours}
                                    zones={zones}
                                    weekStart={drawn[0]}
                                    days={drawn}
                                    weekLabel={weekLabel?.(shown.start)}
                                    density={choices.density}
                                    events={events}
                                    tasks={gridTasks}
                                    showEvents
                                    showTasks={showTasks}
                                    draft={draft}
                                    onDraft={onDraft}
                                    onEventClick={clickById}
                                    onEventOpen={openFull}
                                    onEventMenu={menuAt}
                                    onTaskClick={openTask}
                                    onTaskBlock={blockTime}
                                    onEventChange={changeTimes}
                                    canMove={canMove}
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
                            <m.MonthGrid
                                month={shownView === "month" ? anchor : undefined}
                                from={shown.start}
                                to={shown.end}
                                placed={placed}
                                weekends={choices.weekends}
                                weekLabel={weekLabel}
                                byDay={byDay}
                                now={now}
                                onItemClick={clickItem}
                                onItemOpen={openItem}
                                onItemMenu={menuAt}
                                onDraft={onDraft}
                                onMoveDays={moveDays}
                                canMove={canMoveItem}
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
                    render={(m) => <m.EventMenu at={menu.at} open={menu.open} items={menuItems(menu.event, m.copyToClipboard)} onClose={() => setMenu((cur) => cur && { ...cur, open: false })} />}
                />
            ) : null}
            {dialog?.open(() => setDialog(null))}
            {otherLayer}
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
                    render={(m) => <m.OpenCard uuid={selected?.uuid} events={events} allEvents={allEvents} anchor={selected?.el ?? null} now={now} onClose={() => setSelected(null)} onOpenFull={openFull} onOpenTask={openTask} selfId={selfId} phone={sheet} askScope={askScope} mutateEvents={mutateEvents} holdOpen={!!scopePrompt} />}
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
                                // The parse moved the draft: show its period. The card follows the ghost on its own.
                                if (!monthly && (d.start < shown.start || d.start > shown.end)) setAnchor(d.start);
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
                            onBlockTime={(t, start, end, title) => blockTime(t.task_uuid, start, end, title)}
                        />
                    )}
                />
            ) : null}
            {scopePrompt}
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

/** Tells the calendar when something else changes its address (a link, Back), passing over its own writes. Its own component, so the grid doesn't re-render. */

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
const PhoneBar = memo(function PhoneBar({
    titles,
    anchor,
    view,
    now,
    hasItems,
    goTo,
    onView,
    weekStart: start,
    onNew,
    loading,
}: {
    titles: string[];
    anchor: Date;
    view: CalendarView;
    now: Date;
    hasItems: (d: Date) => boolean;
    goTo: (d: Date) => void;
    onView: (v: CalendarView) => void;
    weekStart: Date;
    onNew: () => void;
    loading: boolean;
}) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    // Year too: reached by Y or 6, it is a view the switch shows as the one on.
    const phoneViews: CalendarView[] = ["agenda", "day", "month", "year"];
    return (
        <header className="shrink-0 border-b border-line bg-sheet" data-calendar-header="" data-phone-bar="">
            <div className="flex h-12 items-center gap-1.5 px-3">
                <FitLabel options={titles} className="mr-auto font-display text-title-3 font-semibold tabular-nums text-ink" aria-live="polite" data-period-title="" />
                {loading ? (
                    <LoadingDot />
                ) : null}
                {view === "month" ? (
                    // A month's arrows on a phone: a touch group 16 px apart (app/phone.css F3b), so a tap lands on its own arrow.
                    <div className="flex shrink-0 items-center" data-month-step="" data-touch-group="">
                        <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => goTo(addMonths(anchor, -1))}>
                            <ChevronLeft />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => goTo(addMonths(anchor, 1))}>
                            <ChevronRight />
                        </Button>
                    </div>
                ) : null}
                <Button variant="secondary" size="sm" onClick={() => goTo(new Date())}>
                    Today
                </Button>
                <Week.View fallback={<i className="w-8" />} render={(m) => <m.WeekButton week={{ current: start }} />} />
                <Button size="icon" aria-label="New event" onClick={onNew}>
                    <Plus />
                </Button>
            </div>
            {view !== "month" ? (
                <div className="flex items-center px-1 pb-2">
                    <Button variant="ghost" size="icon-sm" aria-label="Previous week" onClick={() => goTo(addDays(anchor, -7))}>
                        <ChevronLeft />
                    </Button>
                    <div className="grid flex-1 grid-cols-7" data-week-strip="">
                        {days.map((d) => (
                            <div key={d.toISOString()} className="flex flex-col items-center gap-0.5">
                                <span className="text-micro font-medium text-ink-3">{format(d, "EEEEE")}</span>
                                <DayCell date={d} today={isSameDay(d, now)} selected={view === "day" && isSameDay(d, anchor)} dot={hasItems(d)} onClick={() => { goTo(d); onView("day"); }} aria-label={format(d, "EEEE d MMMM")} data-touch-target="" />
                            </div>
                        ))}
                    </div>
                    <Button variant="ghost" size="icon-sm" aria-label="Next week" onClick={() => goTo(addDays(anchor, 7))}>
                        <ChevronRight />
                    </Button>
                </div>
            ) : null}
            <div role="group" aria-label="View" data-calendar-views="" className="mx-3 mb-2 grid grid-cols-4 rounded-lg bg-sunken p-0.5">
                {phoneViews.map((v) => (
                    <button
                        key={v}
                        type="button"
                        aria-pressed={view === v}
                        onClick={() => onView(v)}
                        data-touch-target=""
                        className={cn("h-8 rounded-md text-ui-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand", view === v ? "bg-raised text-ink shadow-e1" : "text-ink-3")}
                    >
                        {v[0].toUpperCase() + v.slice(1)}
                    </button>
                ))}
            </div>
        </header>
    );
});

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
