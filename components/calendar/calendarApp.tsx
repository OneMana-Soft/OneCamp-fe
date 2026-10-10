"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
    format,
    addMonths,
    subMonths,
    startOfMonth,
    startOfWeek,
    endOfWeek,
    isSameMonth,
    isSameDay,
    addDays,
    parseISO,
    getDay,
    getDaysInMonth,
    startOfDay,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Link2, CircleCheck, Search } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { useFetch } from "@/hooks/useFetch";
import { usePost } from "@/hooks/usePost";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import { UserInfoRawInterface } from "@/types/user";
import { GetEventsResponse } from "@/types/calendar";
import { cn } from "@/lib/utils/helpers/cn";
import { shortTime } from "@/lib/utils/date/shortDate";
import { useDispatch } from "react-redux";
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice";
import { CreateCalendarEventDialog } from "@/components/calendar/createCalendarEventDialog";
import { BookingPagesDialog } from "@/components/calendar/bookingPagesDialog";
import { WeekView } from "@/components/calendar/weekView";
import { CalendarAgenda } from "@/components/calendar/calendarAgenda";
import { agendaDays } from "@/lib/utils/calendarAgenda";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { useMedia } from "@/context/MediaQueryContext";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/hooks/useConfirm";
import { IdentityMark } from "@/components/ui/graphics/IdentityMark";
import { SpotCalendar } from "@/components/ui/graphics";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { inlineAdd } from "@/lib/ui/fieldRow";
import { CALENDAR_HUE, hueOf, toneOf } from "@/components/calendar/calendarTones";
import { dayKey, itemsByDay, layoutWeek, monthGridRange, placeItems, type DatedItem } from "@/components/calendar/calendarLayout";

type CalendarView = "month" | "week" | "day" | "agenda";

interface CalendarItem extends DatedItem {
    event_description?: string;
}

/**
 * Lights every segment of one item (a meeting across two weeks is two bars)
 * while the pointer is on any of them, without rendering anything: the
 * attribute is not React's, so a render on the way leaves it alone. Hovering
 * used to set state at the top of the calendar, which laid the whole month
 * out again for every bar the pointer crossed.
 */
/** A time as a month bar shows it: "9:30am", "2pm". */
function compactTime(d: Date): string {
    return format(d, d.getMinutes() === 0 ? "haaa" : "h:mmaaa");
}

function lightItem(root: HTMLElement | null, uuid: string, on: boolean) {
    root?.querySelectorAll<HTMLElement>(`[data-event-uuid="${CSS.escape(uuid)}"]`).forEach((el) => {
        if (on) el.setAttribute("data-lit", "");
        else el.removeAttribute("data-lit");
    });
}

export function CalendarApp() {
    const dispatch = useDispatch();
    const { isMobile, isDesktop } = useMedia();
    const router = useRouter();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [miniCalendarMonth, setMiniCalendarMonth] = useState(new Date());
    const [view, setView] = useState<CalendarView>("month");
    // Phones open on the agenda until the person picks a view themselves.
    const [viewChosen, setViewChosen] = useState(false);
    const shownView: CalendarView = !viewChosen && isMobile ? "agenda" : view;
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [bookingOpen, setBookingOpen] = useState(false);
    const [defaultDate, setDefaultDate] = useState<Date | undefined>(undefined);
    const gridRef = useRef<HTMLDivElement>(null);

    // Filters State
    const [showEvents, setShowEvents] = useState(true);
    const [showTasks, setShowTasks] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    // What is shown: a day, a week, or the month grid around the date.
    const { start: monthGridStart, end: monthGridEnd } = useMemo(() => monthGridRange(currentMonth), [currentMonth]);
    const { startDate, endDate } = useMemo(() => {
        if (shownView === "day") return { startDate: startOfDay(currentMonth), endDate: startOfDay(currentMonth) };
        if (shownView === "week") return { startDate: startOfWeek(currentMonth), endDate: endOfWeek(currentMonth) };
        return { startDate: monthGridStart, endDate: monthGridEnd };
    }, [shownView, currentMonth, monthGridStart, monthGridEnd]);

    // What is asked for: always the month grid around the date. A week or a
    // day of that month is part of the same answer, so switching views asks
    // for nothing and waits for nothing; it used to fetch a week's range on
    // the way in and the month's on the way out, behind a spinner each time.
    // A new month keeps the last one on screen until its answer comes.
    const rangeQuery = `startDate=${monthGridStart.toISOString()}&endDate=${monthGridEnd.toISOString()}`;
    const keep = { keepPreviousData: true };
    const { data: eventsRes, isLoading: isLoadingEvents, isError: eventsError, mutate: mutateEvents } = useFetch<GetEventsResponse>(
        `${GetEndpointUrl.GoogleCalendarEvents}?${rangeQuery}`, undefined, keep
    );
    const { data: tasksRes, isLoading: isLoadingTasks, isError: tasksError, mutate: mutateTasks } = useFetch<UserInfoRawInterface>(
        `${GetEndpointUrl.GetUserTaskList}?pageIndex=0&pageSize=100&${rangeQuery}`, undefined, keep
    );
    const loading = isLoadingEvents || isLoadingTasks;
    // A failed load is not a free month: every view says so, in one place.
    const failed = !loading && !!(eventsError || tasksError);
    const retry = () => { void mutateEvents(); void mutateTasks(); };

    // Fetch Gcal Status
    const { data: gcalStatus, mutate: mutateGcalStatus } = useFetch<{ data: { isConnected: boolean } }>(
        GetEndpointUrl.GoogleCalendarStatus
    );

    const post = usePost();
    const confirm = useConfirm();

    const handleConnectGCal = async () => {
        try {
            const res = await post.makeRequest<any, { url: string }>({
                method: "GET",
                apiEndpoint: GetEndpointUrl.GoogleCalendarAuthUrl as any
            });
            if (res && res.url) {
                window.location.href = res.url;
            }
        } catch (e) {
            console.error("Failed to get auth url", e);
        }
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

    const handleUnlinkGCal = async () => {
        try {
            await post.makeRequest({
                apiEndpoint: PostEndpointUrl.GoogleCalendarUnlink
            });
            mutateGcalStatus();
            // Optimistically remove Google-only events while keeping OneCamp events
            mutateEvents((current: GetEventsResponse | undefined) => {
                if (!current?.data) return current;
                return {
                    ...current,
                    data: current.data.filter(e => !e.event_uuid.startsWith("gcal-"))
                };
            }, { revalidate: true });
        } catch (e) {
            console.error("Failed to unlink", e);
        }
    };

    const personalEvents = useMemo(() => {
        const list = eventsRes?.data || [];
        if (!searchQuery) return list;
        const q = searchQuery.toLowerCase();
        return list.filter(e => e.event_title.toLowerCase().includes(q) || e.event_description?.toLowerCase().includes(q));
    }, [eventsRes, searchQuery]);

    const tasks = useMemo(() => {
        const list = tasksRes?.data?.user_tasks || [];
        if (!searchQuery) return list;
        const q = searchQuery.toLowerCase();
        return list.filter(t => t.task_name.toLowerCase().includes(q) || t.task_description?.toLowerCase().includes(q));
    }, [tasksRes, searchQuery]);

    // Events and tasks as one list of dated items, their dates parsed once.
    const placed = useMemo(() => {
        const items: CalendarItem[] = [];
        if (showEvents) for (const e of personalEvents) items.push({ ...e, isTask: false });
        if (showTasks) {
            for (const t of tasks) {
                const startStr = t.task_start_date || t.task_due_date;
                const endStr = t.task_due_date || t.task_start_date;
                if (!startStr || !endStr) continue;
                items.push({
                    event_uuid: t.task_uuid,
                    event_title: t.task_name,
                    event_start_time: startStr,
                    event_end_time: endStr,
                    isTask: true,
                    task_project: t.task_project,
                });
            }
        }
        return placeItems(items);
    }, [personalEvents, tasks, showEvents, showTasks]);

    // Each day's items, across the whole fetched month grid.
    const byDay = useMemo(() => itemsByDay(placed, monthGridStart, monthGridEnd), [placed, monthGridStart, monthGridEnd]);

    // The month grid's weeks, laid out once per change of data.
    const weeks = useMemo(() => {
        if (shownView !== "month") return [];
        const out: { weekStart: Date; days: Date[]; tracks: ReturnType<typeof layoutWeek<CalendarItem>> }[] = [];
        for (let ws = startDate; ws <= endDate; ws = addDays(ws, 7)) {
            out.push({ weekStart: ws, days: Array.from({ length: 7 }, (_, i) => addDays(ws, i)), tracks: layoutWeek(ws, placed) });
        }
        return out;
    }, [shownView, startDate, endDate, placed]);

    // A month with nothing in it says so, as a free week and a free day do.
    const monthKey = format(currentMonth, "yyyy-MM");
    const monthBlank = shownView === "month" && !loading && !failed && ![...byDay.keys()].some((k) => k.startsWith(monthKey));

    // The tasks' projects, for the legend: tasks wear their project's colour.
    const taskProjects = useMemo(() => {
        const seen = new Map<string, string>();
        for (const t of tasksRes?.data?.user_tasks || []) {
            const id = t.task_project?.project_uuid;
            if (id && !seen.has(id)) seen.set(id, t.task_project?.project_name || "");
        }
        return [...seen.entries()].slice(0, 3);
    }, [tasksRes]);

    const step = useCallback((dir: 1 | -1) => {
        const d = shownView === "day" ? addDays(currentMonth, dir) : shownView === "week" ? addDays(currentMonth, 7 * dir) : addMonths(currentMonth, dir);
        setCurrentMonth(d);
        setMiniCalendarMonth(d);
    }, [shownView, currentMonth]);
    const goToToday = () => { const now = new Date(); setCurrentMonth(now); setMiniCalendarMonth(now); };

    const openItem = useCallback((item: { event_uuid: string; isTask?: boolean }) => {
        if (isMobile) {
            router.push(item.isTask ? `/app/task/${item.event_uuid}` : `/app/calendar/event/${item.event_uuid}`);
            return;
        }
        if (item.isTask) dispatch(openRightPanel({ taskUUID: item.event_uuid }));
        // The panel reads the same range the calendar asked for, so it opens
        // from what is already here.
        else dispatch(openRightPanel({ eventUUID: item.event_uuid, viewStartDate: monthGridStart.toISOString(), viewEndDate: monthGridEnd.toISOString() }));
    }, [isMobile, router, dispatch, monthGridStart, monthGridEnd]);

    const today = new Date();
    const title =
        shownView === "day"
            ? format(currentMonth, "EEE d MMM yyyy")
            : shownView === "week"
                ? isSameMonth(startDate, endDate)
                    ? `${format(startDate, "d")} - ${format(endDate, "d MMM yyyy")}`
                    : `${format(startDate, "d MMM")} - ${format(endDate, "d MMM yyyy")}`
                : format(currentMonth, "MMMM yyyy");
    const unit = shownView === "day" ? "day" : shownView === "week" ? "week" : "month";
    const views: CalendarView[] = isMobile ? ["agenda", "day", "month"] : ["month", "week", "day"];

    return (
        <div className="flex h-full w-full bg-background overflow-hidden relative">

            {/* Sidebar Framework */}
            <aside className="hidden lg:flex flex-col w-64 border-r border-border/60 bg-background h-full p-4 shrink-0">
                <Button
                    className="w-full justify-start gap-2 mb-4"
                    variant="default"
                    size="default"
                    onClick={() => { setDefaultDate(undefined); setIsCreateOpen(true); }}
                >
                    <Plus className="h-4 w-4" />
                    New event
                </Button>

                {/* Mini calendar */}
                <div className="mb-4 rounded-lg border border-border/60 bg-background p-3 select-none">
                     <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-semibold pl-1">{format(miniCalendarMonth, "MMMM yyyy")}</span>
                        <div className="flex gap-0.5">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setMiniCalendarMonth(subMonths(miniCalendarMonth, 1))} aria-label="Previous month"><ChevronLeft className="h-3.5 w-3.5"/></Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setMiniCalendarMonth(addMonths(miniCalendarMonth, 1))} aria-label="Next month"><ChevronRight className="h-3.5 w-3.5"/></Button>
                        </div>
                     </div>
                     <div className="grid grid-cols-7 gap-1 text-center text-2xs text-muted-foreground font-medium mb-2" aria-hidden="true">
                        {['S','M','T','W','T','F','S'].map((d, i) => <div key={i}>{d}</div>)}
                     </div>
                     <div className="grid grid-cols-7 gap-x-1 gap-y-1 text-center text-xs">
                        {Array.from({ length: getDay(startOfMonth(miniCalendarMonth)) }).map((_, i) => (
                            <div key={`empty-${i}`} className="w-7 h-7" />
                        ))}
                        {Array.from({length: getDaysInMonth(miniCalendarMonth)}).map((_, i) => {
                            const date = new Date(miniCalendarMonth.getFullYear(), miniCalendarMonth.getMonth(), i + 1);
                            const isToday = isSameDay(date, today);
                            const isShown = isSameMonth(date, currentMonth);
                            const hasItems = byDay.has(dayKey(date));
                            return (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => { setCurrentMonth(date); setMiniCalendarMonth(date); }}
                                    aria-label={`${format(date, "EEEE d MMMM")}${hasItems ? ", has events" : ""}`}
                                    aria-current={isToday ? "date" : undefined}
                                    className={cn(
                                        "relative mx-auto flex h-7 w-7 items-center justify-center rounded-full tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                                        isToday ? "bg-primary text-primary-foreground font-semibold" : "hover:bg-highlight",
                                        !isToday && (isShown ? "text-foreground" : "text-muted-foreground"),
                                    )}
                                >
                                    {i + 1}
                                    {hasItems && !isToday && (
                                        <span aria-hidden="true" className="absolute bottom-[3px] left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-muted-foreground" />
                                    )}
                                </button>
                            )
                        })}
                     </div>
                </div>

                <div className="flex items-center gap-2 mb-4 bg-background border border-input rounded-md px-3 py-2 focus-within:ring-2 focus-within:ring-ring/40 transition-colors">
                    <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <input
                        className="bg-transparent text-sm w-full outline-none placeholder:text-faint-foreground"
                        placeholder="Search events…"
                        aria-label="Search events"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <Separator className="my-4" />

                <div className="space-y-4">
                    <div>
                        <h2 className="text-xs font-medium text-muted-foreground mb-3">My calendars</h2>
                        <div className="space-y-2">
                            <label className="flex items-center gap-2.5 text-sm cursor-pointer group">
                                <Checkbox
                                    checked={showEvents}
                                    onCheckedChange={(checked) => setShowEvents(checked === true)}
                                />
                                <span className="text-foreground/90 group-hover:text-foreground transition-colors">
                                    Personal events
                                </span>
                                {/* The swatch is the legend: the calendar's colour on the grid. */}
                                <IdentityMark hue={CALENDAR_HUE.onecamp} variant="square" className="ml-auto" />
                            </label>
                            {gcalStatus?.data?.isConnected && (
                                <div className="flex items-center gap-2.5 pl-[26px] text-sm text-foreground/90">
                                    <span>Google Calendar</span>
                                    <IdentityMark hue={CALENDAR_HUE.google} variant="square" className="ml-auto" />
                                </div>
                            )}
                            <label className="flex items-center gap-2.5 text-sm cursor-pointer group">
                                <Checkbox
                                    checked={showTasks}
                                    onCheckedChange={(checked) => setShowTasks(checked === true)}
                                />
                                <span className="text-foreground/90 group-hover:text-foreground transition-colors">
                                    Assigned tasks
                                </span>
                                {/* Tasks take their project's colour: the swatches are the projects here. */}
                                <span className="ml-auto flex items-center gap-0.5" title={taskProjects.map(([, n]) => n).filter(Boolean).join(", ") || "In their project's colour"}>
                                    {taskProjects.length === 0
                                        ? <CircleCheck className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                                        : taskProjects.map(([id]) => <IdentityMark key={id} id={id} variant="square" />)}
                                </span>
                            </label>
                        </div>
                        {/* Another calendar is added where the calendars are listed,
                            not in the grid's header, where it and Booking pages took
                            a second row whenever the event panel narrowed the grid. */}
                        <div className="mt-2">
                            {gcalStatus?.data?.isConnected ? (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className={cn(inlineAdd, "hover:text-danger-ink")}
                                    onClick={askUnlinkGCal}
                                    disabled={post.isSubmitting}
                                >
                                    Disconnect Google Calendar
                                </Button>
                            ) : (
                                <Button variant="ghost" size="sm" className={inlineAdd} onClick={handleConnectGCal} disabled={post.isSubmitting}>
                                    <Plus className="h-4 w-4" aria-hidden="true" />
                                    Connect Google Calendar
                                </Button>
                            )}
                        </div>
                    </div>
                    <div>
                        <h2 className="text-xs font-medium text-muted-foreground mb-1">Booking</h2>
                        <Button variant="ghost" size="sm" className={inlineAdd} onClick={() => setBookingOpen(true)}>
                            <Link2 className="h-4 w-4" aria-hidden="true" />
                            Booking pages
                        </Button>
                    </div>
                </div>
            </aside>

            {/* Main Calendar Area */}
            <main className="flex-1 flex flex-col h-full overflow-hidden">
                {/* Two groups. Where you are (today, back, forward and the range on
                    screen) on the left; how you look at it, and on a narrower screen
                    what you can add, on the right. The view switch leads the right
                    group, so nothing that changes with the view moves it: it sat
                    after the title, whose width changes with every view ("October
                    2026", "4 - 10 Oct 2026"), and slid 20 to 60px under the pointer
                    on each switch, about 60px more while "Loading…" showed beside
                    it. sm:flex-wrap: where both groups do not fit on one line (a
                    tablet), the right one takes a second line rather than squeezing
                    the dates. On a phone the switch starts the second line. */}
                <header className="relative flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2 sm:gap-3 px-4 md:px-6 py-3 border-b border-border/60 bg-background z-10 sticky top-0" data-calendar-header="">
                    <h1 className="sr-only">Calendar</h1>
                    <div className="flex min-w-0 items-center gap-2">
                        <Button variant="outline" size="sm" className="h-8 shrink-0 extend-touch-target" onClick={goToToday}>
                            Today
                        </Button>
                        <div className="flex shrink-0 items-center gap-0.5">
                            <Button variant="ghost" size="icon" className="h-8 w-8 extend-touch-target" onClick={() => step(-1)} aria-label={`Previous ${unit}`}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 extend-touch-target" onClick={() => step(1)} aria-label={`Next ${unit}`}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                        <span className="min-w-0 truncate font-display text-lg font-semibold text-foreground tabular-nums" aria-live="polite">
                            {title}
                        </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                        <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-muted/50 p-0.5" role="group" aria-label="View" data-calendar-views="">
                            {views.map((v) => (
                                <button
                                    key={v}
                                    type="button"
                                    onClick={() => { setView(v); setViewChosen(true); }}
                                    aria-pressed={shownView === v}
                                    className={cn(
                                        "extend-touch-target rounded-sm px-2.5 py-1 text-xs font-medium capitalize transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                                        shownView === v
                                            ? "bg-background text-foreground ring-1 ring-border"
                                            : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    {v}
                                </button>
                            ))}
                        </div>

                        {/* Below the wide layout's sidebar, its actions live here: the
                            one thing a calendar is for (a phone had no way to add an
                            event at all), the booking pages, and Google Calendar. */}
                        <div className="flex shrink-0 items-center gap-2 lg:hidden">
                            <Button size="sm" className="h-8 gap-1.5 extend-touch-target" onClick={() => { setDefaultDate(undefined); setIsCreateOpen(true); }}>
                                <Plus className="h-3.5 w-3.5" aria-hidden />
                                New event
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className={cn("h-8 gap-1.5 extend-touch-target", isMobile && "w-8 px-0")}
                                onClick={() => setBookingOpen(true)}
                                aria-label="Booking pages"
                                title="Booking pages"
                            >
                                <Link2 className="h-3.5 w-3.5" aria-hidden />
                                {!isMobile && "Booking pages"}
                            </Button>
                            {isDesktop && (
                                gcalStatus?.data?.isConnected ? (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 text-muted-foreground hover:text-danger-ink"
                                        onClick={askUnlinkGCal}
                                        disabled={post.isSubmitting}
                                    >
                                        Disconnect Google Calendar
                                    </Button>
                                ) : (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8"
                                        onClick={handleConnectGCal}
                                        disabled={post.isSubmitting}
                                    >
                                        Connect Google Calendar
                                    </Button>
                                )
                            )}
                        </div>
                    </div>

                    {/* Loading says so along the header's bottom edge, in the theme's
                        colour, and moves nothing; the grid under it is aria-busy. */}
                    {loading && (
                        <div role="status" className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 overflow-hidden" data-calendar-loading="">
                            <span className="sr-only">Loading…</span>
                            <div aria-hidden="true" className="h-full w-full animate-pulse bg-primary/70 motion-reduce:animate-none" />
                        </div>
                    )}
                </header>

                {/* Scrolls in BOTH directions, which it did not.
                    The week grid is 760px wide by construction (seven day columns
                    plus a time gutter) and the month grid was 800px, inside a
                    scroller that only offered overflow-y and a <main> that clips.
                    On a phone that did not shrink the calendar, it cut it off:
                    the last three days of every week were behind the right edge
                    with nothing to scroll and no way to reach them. */}
                <div ref={gridRef} className="relative flex-1 overflow-y-auto overflow-x-auto overscroll-contain bg-background custom-scrollbar" aria-busy={loading || undefined}>
                    {failed && (
                        // Over the grid, where an empty view says it is empty.
                        <div className="absolute inset-0 z-40 flex items-start justify-center bg-background/90 pt-16" data-calendar-failed="">
                            <ErrorState subject="your calendar" onRetry={retry} />
                        </div>
                    )}
                    {shownView === "agenda" ? (
                        loading ? <AgendaSkeleton /> : failed ? null : (
                        <CalendarAgenda
                            // A task sits on its due day in a list; drawn on every day it
                            // spans, one task filled a week of the agenda.
                            days={agendaDays(startDate, endDate, (day) =>
                                (byDay.get(dayKey(day)) || []).filter((item) => !item.isTask || isSameDay(parseISO(item.event_end_time), day)))}
                            onOpen={(item) => router.push(item.isTask ? `/app/task/${item.event_uuid}` : `/app/calendar/event/${item.event_uuid}`)}
                        />
                        )
                    ) : shownView === "week" || shownView === "day" ? (
                        <div className={cn("h-full", shownView === "week" && "min-w-[760px]")}>
                            <WeekView
                                weekStart={startDate}
                                dayCount={shownView === "day" ? 1 : 7}
                                events={personalEvents}
                                tasks={tasks}
                                showEvents={showEvents}
                                showTasks={showTasks}
                                onSlotClick={(date) => { setDefaultDate(date); setIsCreateOpen(true); }}
                                onEventClick={(uuid) => openItem({ event_uuid: uuid })}
                                onTaskClick={(uuid) => openItem({ event_uuid: uuid, isTask: true })}
                                loading={loading}
                            />
                        </div>
                    ) : (
                        /* Calendar grid. The month grid fits a phone rather than scrolling on one.
                           Seven columns at ~55px still carry a date, a dot and the
                           "+N more" popover, and a month is read as a shape, so a
                           view you have to pan across is the wrong answer here
                           even once panning works. The week grid keeps its width:
                           a timed day column genuinely cannot compress that far.
                           It draws at once, with its days, while the items load. */
                        // No minimum width at any size now: from 640px it was
                        // 800px wide, more than a tablet's calendar area (about
                        // 560px at 768, 600px at 1024 beside the mini month), so
                        // Friday and Saturday sat behind the right edge.
                        <div className="min-w-0 @container/month relative flex flex-col h-full">
                            {monthBlank && (
                                // The same quiet note a free week and a free day get,
                                // in the middle of the grid; the days under it still
                                // take a click.
                                <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-2" data-calendar-blank="">
                                    <SpotCalendar size={64} />
                                    <p className="rounded-md bg-background/85 px-2 py-0.5 text-sm text-muted-foreground">Nothing on this month</p>
                                </div>
                            )}
                            {/* Days of week header */}
                            <div className="grid grid-cols-7 w-full border-b border-border/60 sticky top-0 bg-background z-20 border-l text-center" aria-hidden="true">
                                {/* Sentence case: a grid header read on every glance does not need to shout. */}
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayName) => (
                                    <div key={dayName} className="py-2 text-xs font-medium text-muted-foreground border-r border-border/60">
                                        {dayName}
                                    </div>
                                ))}
                            </div>

                            <div className="flex flex-col w-full flex-1">
                                {weeks.map(({ weekStart, days, tracks }) => (
                                    <div key={weekStart.toISOString()} className="relative border-b flex flex-col min-h-[140px]">
                                        {/* Background Grid */}
                                        <div className="absolute inset-0 grid grid-cols-7 border-l pointer-events-none">
                                            {days.map((day, i) => (
                                                // Today is marked by its date's filled circle; tinting
                                                // the whole column as well spent the accent twice.
                                                <div key={i} className={cn("border-r h-full", !isSameMonth(day, currentMonth) && "bg-muted/30")} />
                                            ))}
                                        </div>

                                        {/* Date Numbers */}
                                        <div className="grid grid-cols-7 relative h-8 pointer-events-none">
                                            {days.map((day, i) => (
                                                <div key={i} className="flex justify-center pt-1.5 h-full">
                                                    <div
                                                        className={cn(
                                                            "text-xs font-medium tabular-nums w-6 h-6 flex items-center justify-center rounded-full",
                                                            isSameDay(day, today)
                                                                ? "bg-primary text-primary-foreground font-semibold"
                                                                : isSameMonth(day, currentMonth)
                                                                    ? "text-foreground"
                                                                    : "text-muted-foreground"
                                                        )}
                                                        aria-current={isSameDay(day, today) ? "date" : undefined}
                                                    >
                                                        {format(day, "d")}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Click a day to create; "+N more" opens the day's list. */}
                                        <div className="absolute inset-0 grid grid-cols-7 h-full">
                                            {days.map((day, i) => {
                                                const dayItems = byDay.get(dayKey(day)) || [];
                                                return (
                                                    <div
                                                        key={i}
                                                        className="h-full cursor-pointer hover:bg-highlight/40 flex flex-col justify-end p-1"
                                                        onClick={() => { setDefaultDate(day); setIsCreateOpen(true); }}
                                                    >
                                                        {dayItems.length > 3 && (
                                                            <Popover>
                                                                <PopoverTrigger asChild>
                                                                    <button
                                                                        type="button"
                                                                        className="relative z-30 mx-auto rounded-sm px-1 pb-0.5 text-2xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
                                                                        +{dayItems.length - 3} more
                                                                    </button>
                                                                </PopoverTrigger>
                                                                <PopoverContent className="w-64 p-2" onClick={(e) => e.stopPropagation()}>
                                                                    <div className="flex flex-col gap-1">
                                                                        <div className="flex items-center justify-between px-2 pb-2">
                                                                            <span className="text-xs font-medium text-foreground">
                                                                                {format(day, "EEEE d MMM")}
                                                                            </span>
                                                                            <span className="text-2xs tabular-nums text-muted-foreground">
                                                                                {dayItems.length} items
                                                                            </span>
                                                                        </div>
                                                                        <Separator className="mb-1" />
                                                                        <ScrollArea className="max-h-[300px]">
                                                                            <div className="flex flex-col gap-0.5">
                                                                                {dayItems.map(item => (
                                                                                    <button
                                                                                        key={item.event_uuid}
                                                                                        type="button"
                                                                                        onClick={(e) => { e.stopPropagation(); openItem(item); }}
                                                                                        className="flex items-center gap-2 rounded-md p-2 text-left transition-colors hover:bg-highlight focus-visible:outline-none focus-visible:bg-highlight"
                                                                                    >
                                                                                        <span aria-hidden="true" className={cn("h-2.5 w-2.5 shrink-0 rounded-full", toneOf(item).solid)} />
                                                                                        <span className="flex min-w-0 flex-col">
                                                                                            <span className="truncate text-xs font-medium text-foreground">{item.event_title}</span>
                                                                                            <span className="truncate text-2xs tabular-nums text-muted-foreground">
                                                                                                {item.isTask ? "Task" : `${shortTime(parseISO(item.event_start_time))} - ${shortTime(parseISO(item.event_end_time))}`}
                                                                                            </span>
                                                                                        </span>
                                                                                    </button>
                                                                                ))}
                                                                            </div>
                                                                        </ScrollArea>
                                                                    </div>
                                                                </PopoverContent>
                                                            </Popover>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Event bars */}
                                        <div className="relative flex-1 mt-0.5 pb-1 flex flex-col gap-[2px] overflow-visible z-10">
                                            {tracks.map((trackBars, trackIdx) => (
                                                <div key={trackIdx} className="relative h-5 w-full">
                                                    {trackBars.map(bar => {
                                                        const item = bar.item;
                                                        const timePrefix = bar.timed ? `${compactTime(bar.start)} ` : "";
                                                        return (
                                                            <div
                                                                key={item.event_uuid}
                                                                role="button"
                                                                tabIndex={0}
                                                                data-event-uuid={item.event_uuid}
                                                                data-hue={item.event_is_away ? undefined : hueOf(item)}
                                                                aria-label={`${item.isTask ? "Task" : "Event"}: ${item.event_title}`}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === "Enter" || e.key === " ") {
                                                                        e.preventDefault();
                                                                        openItem(item);
                                                                    }
                                                                }}
                                                                onMouseEnter={() => lightItem(gridRef.current, item.event_uuid, true)}
                                                                onMouseLeave={() => lightItem(gridRef.current, item.event_uuid, false)}
                                                                onClick={(e) => { e.stopPropagation(); openItem(item); }}
                                                                style={{
                                                                    // The 4px insets are inside the span; added to it, a bar filling the week ran past the grid.
                                                                    left: `calc(${(bar.col / 7) * 100}% + ${bar.startsHere ? 4 : 0}px)`,
                                                                    width: `calc(${(bar.span / 7) * 100}% - ${(bar.startsHere ? 4 : 0) + (bar.endsHere ? 4 : 0)}px)`
                                                                }}
                                                                className={cn(
                                                                    // No lift on hover: a bar on the grid does not float. Its
                                                                    // tone is its calendar's or its project's hue, the same as
                                                                    // in the week view and the agenda.
                                                                    "absolute flex h-5 items-center gap-1 truncate px-1.5 py-0 text-2xs font-medium cursor-pointer transition-[box-shadow] z-20 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 data-[lit]:z-30 data-[lit]:ring-1 data-[lit]:ring-inset data-[lit]:ring-current/40",
                                                                    toneOf(item).block,
                                                                    bar.startsHere ? "rounded-l-[4px]" : "border-l-0",
                                                                    bar.endsHere && "rounded-r-[4px]",
                                                                )}
                                                            >
                                                                {item.isTask && <CircleCheck className="h-3 w-3 shrink-0" aria-hidden="true" />}
                                                                <span className="truncate leading-none tabular-nums">
                                                                    {/* The time only where a bar has room for it: beside
                                                                        the event panel a day is about 80px wide, and
                                                                        every bar read "9:30am…" with no title at all. */}
                                                                    {timePrefix && <span className="hidden @[46rem]/month:inline">{timePrefix}</span>}
                                                                    {item.event_title}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </main>

            <BookingPagesDialog open={bookingOpen} onOpenChange={setBookingOpen} />
            <CreateCalendarEventDialog
                open={isCreateOpen}
                onOpenChange={setIsCreateOpen}
                onSuccess={() => mutateEvents()}
                defaultStartDate={defaultDate}
                isGCalConnected={gcalStatus?.data?.isConnected}
            />
        </div>
    );
}

/**
 * The agenda's shape while it loads: a day heading and rows the size of its
 * own (56px, a colour edge, two lines), where it showed nothing at all and
 * then everything at once while the other views drew their grid at once.
 */
function AgendaSkeleton() {
    return (
        <div role="status" aria-label="Loading the agenda" data-agenda-skeleton="">
            {[3, 2].map((rows, d) => (
                <div key={d} aria-hidden="true">
                    <div className="px-4 pb-1.5 pt-4">
                        <Skeleton className="h-3 w-20" />
                    </div>
                    {Array.from({ length: rows }).map((_, i) => (
                        <div key={i} className="flex min-h-[56px] items-center gap-3 px-4 py-2.5">
                            <Skeleton className="h-9 w-1 shrink-0 rounded-full" />
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
