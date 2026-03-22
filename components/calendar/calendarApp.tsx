"use client";

import { useState, useMemo } from "react";
import { 
    format, 
    addMonths, 
    subMonths, 
    startOfMonth, 
    endOfMonth, 
    startOfWeek, 
    endOfWeek,
    isSameMonth,
    isSameDay, 
    addDays,
    parseISO,
    getDay,
    getDaysInMonth,
    startOfDay,
    endOfDay
} from "date-fns";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Plus, Loader2, Search, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFetch } from "@/hooks/useFetch";
import { usePost } from "@/hooks/usePost";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import { UserInfoRawInterface } from "@/types/user";
import { GetEventsResponse, CalendarEventInterface } from "@/types/calendar";
import { TaskInfoInterface } from "@/types/task";
import { cn } from "@/lib/utils/helpers/cn";
import { useDispatch } from "react-redux";
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice";
import { CreateCalendarEventDialog } from "@/components/calendar/createCalendarEventDialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useMedia } from "@/context/MediaQueryContext";
import { useRouter } from "next/navigation";

// Constants for UI Rendering
const MAX_EVENTS_PER_CELL = 3;

export function CalendarApp() {
    const dispatch = useDispatch();
    const { isMobile, isDesktop } = useMedia();
    const router = useRouter();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [miniCalendarMonth, setMiniCalendarMonth] = useState(new Date());
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [defaultDate, setDefaultDate] = useState<Date | undefined>(undefined);
    
    // Filters State
    const [showEvents, setShowEvents] = useState(true);
    const [showTasks, setShowTasks] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [hoveredEventUUID, setHoveredEventUUID] = useState<string | null>(null);

    // Generate Calendar Grid Date Boundaries early for fetches
    const monthStart = useMemo(() => startOfMonth(currentMonth), [currentMonth]);
    const monthEnd = useMemo(() => endOfMonth(monthStart), [monthStart]);
    const startDate = useMemo(() => startOfWeek(monthStart), [monthStart]);
    const endDate = useMemo(() => endOfWeek(monthEnd), [monthEnd]);

    // Fetch personal events
    const { data: eventsRes, isLoading: isLoadingEvents, mutate: mutateEvents } = useFetch<GetEventsResponse>(
        `${GetEndpointUrl.GoogleCalendarEvents}?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
    );

    // Fetch tasks
    const { data: tasksRes, isLoading: isLoadingTasks } = useFetch<UserInfoRawInterface>(
        `${GetEndpointUrl.GetUserTaskList}?pageIndex=0&pageSize=100&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
    );

    // Fetch Gcal Status
    const { data: gcalStatus, mutate: mutateGcalStatus } = useFetch<{ data: { isConnected: boolean } }>(
        GetEndpointUrl.GoogleCalendarStatus
    );

    const post = usePost();

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
        return list.filter(e => 
            e.event_title.toLowerCase().includes(searchQuery.toLowerCase()) || 
            e.event_description?.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [eventsRes, searchQuery]);

    const tasks = useMemo(() => {
        const list = tasksRes?.data?.user_tasks || [];
        if (!searchQuery) return list;
        return list.filter(t => 
            t.task_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            t.task_description?.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [tasksRes, searchQuery]);

    const nextMonth = () => { setCurrentMonth(addMonths(currentMonth, 1)); setMiniCalendarMonth(addMonths(currentMonth, 1)); }
    const prevMonth = () => { setCurrentMonth(subMonths(currentMonth, 1)); setMiniCalendarMonth(subMonths(currentMonth, 1)); }
    const goToToday = () => { const now = new Date(); setCurrentMonth(now); setMiniCalendarMonth(now); }
    
    const nextMiniMonth = () => setMiniCalendarMonth(addMonths(miniCalendarMonth, 1));
    const prevMiniMonth = () => setMiniCalendarMonth(subMonths(miniCalendarMonth, 1));

    // Generate Calendar Grid is now computed via useMemo above


    const isTaskOnDay = (task: TaskInfoInterface, day: Date) => {
        if (!task.task_start_date && !task.task_due_date) return false;
        const start = task.task_start_date ? startOfDay(parseISO(task.task_start_date)) : null;
        const end = task.task_due_date ? endOfDay(parseISO(task.task_due_date)) : null;
        const current = startOfDay(day);

        if (start && end) {
            return current >= start && current <= end;
        }
        if (start) return isSameDay(start, current);
        if (end) return isSameDay(end, current);
        return false;
    };

    const getEventsForDay = (day: Date) => {
        const eventsForDay: any[] = [];
        if (showEvents) {
            personalEvents.forEach(event => {
                if (!event.event_start_time || !event.event_end_time) return;
                const start = startOfDay(parseISO(event.event_start_time));
                const end = endOfDay(parseISO(event.event_end_time));
                if (day >= start && day <= end) {
                    eventsForDay.push({ ...event, isEvent: true });
                }
            });
        }
        if (showTasks) {
            tasks.forEach(task => {
                if (!task.task_start_date) return;
                const start = startOfDay(parseISO(task.task_start_date));
                const endDateStr = task.task_due_date && task.task_due_date !== "" ? task.task_due_date : task.task_start_date;
                const end = endOfDay(parseISO(endDateStr));
                if (day >= start && day <= end) {
                    eventsForDay.push({ 
                        ...task, 
                        isTask: true, 
                        event_uuid: task.task_uuid, 
                        event_title: task.task_name,
                        event_start_time: task.task_start_date,
                        event_end_time: endDateStr 
                    });
                }
            });
        }
        return eventsForDay;
    };

    const getTasksForDay = (day: Date) => {
        return tasks.filter(task => isTaskOnDay(task, day));
    };

    const getItemsForWeek = (weekStart: Date) => {
        const weekEnd = endOfWeek(weekStart);
        const dayIntervals = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
        
        let weekEvents: any[] = [];
        if (showEvents) {
            personalEvents.forEach(event => {
                const start = parseISO(event.event_start_time);
                const end = parseISO(event.event_end_time);
                if (start <= weekEnd && end >= weekStart) {
                    const eventStart = start < weekStart ? weekStart : startOfDay(start);
                    const eventEnd = end > weekEnd ? weekEnd : endOfDay(end);
                    const colStart = getDay(eventStart);
                    const colSpan = Math.floor((startOfDay(eventEnd).getTime() - startOfDay(eventStart).getTime()) / (1000 * 60 * 60 * 24)) + 1;
                    weekEvents.push({ ...event, colStart, colSpan, isEvent: true, originalStart: start });
                }
            });
        }
        
        if (showTasks) {
            tasks.forEach(task => {
                const start = parseISO(task.task_start_date);
                const endDateStr = task.task_due_date && task.task_due_date !== "" ? task.task_due_date : task.task_start_date;
                const end = parseISO(endDateStr);
                
                if (start <= weekEnd && end >= weekStart) {
                    const itemStart = start < weekStart ? weekStart : startOfDay(start);
                    const itemEnd = end > weekEnd ? weekEnd : endOfDay(end);
                    const colStart = getDay(itemStart);
                    const colSpan = Math.floor((startOfDay(itemEnd).getTime() - startOfDay(itemStart).getTime()) / (1000 * 60 * 60 * 24)) + 1;
                    
                    weekEvents.push({ 
                        ...task, 
                        event_uuid: task.task_uuid, 
                        event_title: task.task_name, 
                        colStart, 
                        colSpan, 
                        isTask: true, 
                        originalStart: start,
                        event_start_time: task.task_start_date,
                        event_end_time: endDateStr
                    });
                }
            });
        }

        // Sort events by duration (descending) then start time
        weekEvents.sort((a, b) => b.colSpan - a.colSpan || a.originalStart.getTime() - b.originalStart.getTime());

        // Assign tracks to events
        const tracks: any[][] = [];
        weekEvents.forEach(event => {
            let trackIndex = 0;
            while (tracks[trackIndex] && tracks[trackIndex].some(e => 
                (event.colStart >= e.colStart && event.colStart < e.colStart + e.colSpan) ||
                (e.colStart >= event.colStart && e.colStart < event.colStart + event.colSpan)
            )) {
                trackIndex++;
            }
            if (!tracks[trackIndex]) tracks[trackIndex] = [];
            tracks[trackIndex].push({ ...event, trackIndex });
        });

        return { dayIntervals, tracks: tracks.slice(0, 3) }; // Limit to 3 visible tracks
    };

    const weeks = [];
    let currentWeekStart = startDate;

    while (currentWeekStart <= endDate) {
        const { dayIntervals, tracks } = getItemsForWeek(currentWeekStart);
        
        weeks.push(
            <div key={currentWeekStart.toISOString()} className="relative border-b flex flex-col min-h-[140px]">
                {/* Background Grid */}
                <div className="absolute inset-0 grid grid-cols-7 border-l pointer-events-none">
                    {dayIntervals.map((day, i) => (
                        <div key={i} className={cn(
                            "border-r h-full",
                            !isSameMonth(day, monthStart) && "bg-muted/20",
                            isSameDay(day, new Date()) && "bg-primary/[0.02]"
                        )} />
                    ))}
                </div>

                {/* Date Numbers */}
                <div className="grid grid-cols-7 relative h-8 pointer-events-none">
                    {dayIntervals.map((day, i) => (
                        <div key={i} className="flex justify-center pt-1.5 h-full">
                            <div className={cn(
                                "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
                                isSameDay(day, new Date()) ? "bg-primary text-primary-foreground font-bold shadow-sm" : 
                                isSameMonth(day, monthStart) ? "text-foreground" : "text-muted-foreground"
                            )}>
                                {format(day, "d")}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Interaction Overlay (to handle click-to-create) */}
                <div className="absolute inset-0 grid grid-cols-7 h-full">
                    {dayIntervals.map((day, i) => {
                        const dayEvents = getEventsForDay(day);
                        return (
                            <div 
                                key={i} 
                                className="h-full cursor-pointer hover:bg-primary/[0.02] flex flex-col justify-end p-1" 
                                onClick={() => { setDefaultDate(day); setIsCreateOpen(true); }}
                            >
                                {/* Overflow Indicator */}
                                {dayEvents.length > 3 && (
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <div 
                                                className="text-[10px] font-bold text-muted-foreground/70 text-center pb-0.5 hover:text-primary transition-colors cursor-pointer z-30"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                +{dayEvents.length - 3} more
                                            </div>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-64 p-2 shadow-xl border-border bg-popover" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center justify-between px-2 pb-2">
                                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                                        {format(day, "EEEE, MMM d")}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground/50">
                                                        {dayEvents.length} events
                                                    </span>
                                                </div>
                                                <Separator className="mb-1" />
                                                <ScrollArea className="max-h-[300px]">
                                                    <div className="flex flex-col gap-0.5">
                                                        {dayEvents.map(event => (
                                                            <div 
                                                                key={event.event_uuid}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (isMobile) {
                                                                        if (event.isTask) {
                                                                            router.push(`/app/task/${event.event_uuid}`);
                                                                        } else {
                                                                            router.push(`/app/calendar/event/${event.event_uuid}`);
                                                                        }
                                                                        return;
                                                                    }
                                                                    if (event.isTask) {
                                                                        dispatch(openRightPanel({ taskUUID: event.event_uuid }));
                                                                    } else {
                                                                        dispatch(openRightPanel({ eventUUID: event.event_uuid, viewStartDate: startDate.toISOString(), viewEndDate: endDate.toISOString() }));
                                                                    }
                                                                }}
                                                                className="flex items-center gap-2 p-2 hover:bg-muted rounded-md transition-colors cursor-pointer group"
                                                            >
                                                                <div className={cn("w-2.5 h-2.5 rounded-full shrink-0 shadow-sm", event.isTask ? "bg-blue-500 group-hover:bg-blue-600" : "bg-indigo-500 group-hover:bg-indigo-600")} />
                                                                <div className="flex flex-col min-w-0">
                                                                    <div className="text-[11px] font-semibold truncate text-foreground group-hover:text-primary transition-colors">
                                                                        {event.event_title}
                                                                    </div>
                                                                    <div className="text-[9px] text-muted-foreground">
                                                                        {format(parseISO(event.event_start_time), "h:mm a")} - {format(parseISO(event.event_end_time), "h:mm a")}
                                                                    </div>
                                                                </div>
                                                            </div>
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

                {/* Event Tracks Overlay */}
                <div className="relative flex-1 mt-0.5 pb-1 flex flex-col gap-[2px] overflow-visible z-10">
                    {tracks.map((trackEvents, trackIdx) => (
                        <div key={trackIdx} className="relative h-5 w-full">
                            {trackEvents.map(event => {
                                const isStartOfWeek = isSameDay(parseISO(event.event_start_time), addDays(currentWeekStart, event.colStart));
                                const isEndOfWeek = isSameDay(parseISO(event.event_end_time), addDays(currentWeekStart, event.colStart + event.colSpan - 1));
                                const isHovered = hoveredEventUUID === event.event_uuid;
                                const startTime = parseISO(event.event_start_time);
                                const timePrefix = event.colSpan === 1 ? format(startTime, "h:mm ") : "";
                                
                                return (
                                    <div
                                        key={event.event_uuid}
                                        onMouseEnter={() => setHoveredEventUUID(event.event_uuid)}
                                        onMouseLeave={() => setHoveredEventUUID(null)}
                                        onClick={(e) => { 
                                            e.stopPropagation(); 
                                            if (isMobile) {
                                                if (event.isTask) {
                                                    router.push(`/app/task/${event.event_uuid}`);
                                                } else {
                                                    router.push(`/app/calendar/event/${event.event_uuid}`);
                                                }
                                                return;
                                            }
                                            if (event.isTask) {
                                                dispatch(openRightPanel({ taskUUID: event.event_uuid }));
                                            } else {
                                                dispatch(openRightPanel({ eventUUID: event.event_uuid, viewStartDate: startDate.toISOString(), viewEndDate: endDate.toISOString() })); 
                                            }
                                        }}
                                        style={{
                                            left: `${(event.colStart / 7) * 100}%`,
                                            width: `${(event.colSpan / 7) * 100}%`
                                        }}
                                        className={cn(
                                            "absolute h-5 px-1.5 py-0 text-[10px] font-medium truncate cursor-pointer transition-all flex items-center z-20",
                                            isHovered ? (event.isTask ? "bg-blue-600 scale-[1.02] z-30 shadow-md" : "bg-indigo-600 scale-[1.02] z-30 shadow-md") : (event.isTask ? "bg-blue-500/90" : "bg-indigo-500/90"),
                                            "text-white",
                                            isStartOfWeek ? "rounded-l-[4px] ml-1" : "",
                                            isEndOfWeek ? "rounded-r-[4px] mr-1" : (event.isTask ? "border-r border-blue-300/20" : "border-r border-indigo-300/20")
                                        )}
                                    >
                                        <span className="truncate leading-none">
                                            {timePrefix}{event.event_title}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                    
                </div>
            </div>
        );
        currentWeekStart = addDays(currentWeekStart, 7);
    }

    return (
        <div className="flex h-full w-full bg-background overflow-hidden relative">
            
            {/* Sidebar Framework */}
            <aside className="hidden lg:flex flex-col w-64 border-r bg-muted/10 h-full p-4 shrink-0 transition-transform">
                <Button className="w-full gap-2 justify-start shadow-sm mb-6 bg-background border hover:bg-muted text-foreground" variant="outline" size="lg" onClick={() => { setDefaultDate(undefined); setIsCreateOpen(true); }}>
                    <Plus className="h-4 w-4 text-primary" />
                    Create
                </Button>
                
                {/* Mini Calendar placeholder */}
                <div className="mb-6 h-[230px] bg-background border rounded-lg p-3 select-none">
                     <div className="flex justify-between items-center mb-4">
                        <span className="text-sm font-semibold pl-1">{format(miniCalendarMonth, "MMMM yyyy")}</span>
                        <div className="flex gap-0.5">
                            <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-muted" onClick={prevMiniMonth}><ChevronLeft className="h-3.5 w-3.5"/></Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-muted" onClick={nextMiniMonth}><ChevronRight className="h-3.5 w-3.5"/></Button>
                        </div>
                     </div>
                     <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground font-semibold mb-2">
                        {['S','M','T','W','T','F','S'].map((d, i) => <div key={i}>{d}</div>)}
                     </div>
                     <div className="grid grid-cols-7 gap-x-1 gap-y-1 text-center text-xs">
                        {/* Dynamic Mini Calendar Days */}
                        {Array.from({ length: getDay(startOfMonth(miniCalendarMonth)) }).map((_, i) => (
                            <div key={`empty-${i}`} className="w-6 h-6" />
                        ))}
                        {Array.from({length: getDaysInMonth(miniCalendarMonth)}).map((_, i) => {
                            const date = new Date(miniCalendarMonth.getFullYear(), miniCalendarMonth.getMonth(), i + 1);
                            const isSelectedMonth = isSameMonth(date, currentMonth);
                            const hasItems = getEventsForDay(date).length > 0 || getTasksForDay(date).length > 0;
                            
                            return (
                                <div 
                                    key={i} 
                                    onClick={() => { setCurrentMonth(date); setMiniCalendarMonth(date); }}
                                    className="relative group/day cursor-pointer"
                                >
                                    <div className={cn(
                                        "w-7 h-7 flex items-center justify-center rounded-full transition-all duration-200 select-none mx-auto", 
                                        isSameDay(date, new Date()) ? "bg-primary text-primary-foreground font-bold shadow-sm" : "hover:bg-accent",
                                        !isSelectedMonth && !isSameDay(date, new Date()) && "text-muted-foreground/50",
                                        isSelectedMonth && !isSameDay(date, new Date()) && "font-medium text-foreground/90"
                                    )}>
                                        {i + 1}
                                    </div>
                                    {hasItems && !isSameDay(date, new Date()) && (
                                        <div className="absolute bottom-[2px] left-1/2 -translate-x-1/2 flex gap-[2px]">
                                            <div className="w-[3px] h-[3px] rounded-full bg-indigo-500/60" />
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                     </div>
                </div>

                <div className="flex items-center gap-2 mb-4 bg-background border rounded-md px-3 py-2 shadow-sm focus-within:ring-1 focus-within:ring-ring">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <input 
                        className="bg-transparent text-sm w-full outline-none placeholder:text-muted-foreground" 
                        placeholder="Search events..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <Separator className="my-4" />

                <div className="space-y-4">
                    <div>
                        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">My Calendars</h4>
                        <div className="space-y-2">
                            <label className="flex items-center gap-3 text-sm cursor-pointer group">
                                <input type="checkbox" className="rounded border-gray-300 text-indigo-500 focus:ring-indigo-500 w-4 h-4 cursor-pointer" checked={showEvents} onChange={(e) => setShowEvents(e.target.checked)} />
                                <span className="group-hover:text-foreground/80 transition-colors">Personal Events</span>
                            </label>
                            <label className="flex items-center gap-3 text-sm cursor-pointer group">
                                <input type="checkbox" className="rounded border-gray-300 text-blue-500 focus:ring-blue-500 w-4 h-4 cursor-pointer" checked={showTasks} onChange={(e) => setShowTasks(e.target.checked)} />
                                <span className="group-hover:text-foreground/80 transition-colors">Assigned Tasks</span>
                            </label>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Calendar Area */}
            <main className="flex-1 flex flex-col h-full overflow-hidden">
                <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 px-6 border-b bg-background z-10 sticky top-0">
                    <div className="flex items-center gap-4">
                        <h1 className="text-2xl font-semibold tracking-tight hidden sm:flex items-center gap-2">
                            <CalendarIcon className="h-6 w-6 text-primary" />
                            Calendar
                        </h1>
                        <div className="flex items-center gap-1 sm:ml-4">
                            <Button variant="outline" className="mr-2 h-9 px-4 font-medium rounded-md shadow-sm hover:bg-accent transition-all" onClick={goToToday}>
                                Today
                            </Button>
                            <div className="flex items-center gap-0 mr-4">
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-accent transition-colors" onClick={prevMonth} title="Previous month">
                                    <ChevronLeft className="h-5 w-5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-accent transition-colors" onClick={nextMonth} title="Next month">
                                    <ChevronRight className="h-5 w-5" />
                                </Button>
                            </div>
                            <span className="text-xl font-medium tracking-tight text-foreground/90 ml-1">
                                {format(currentMonth, "MMMM yyyy")}
                            </span>
                        </div>
                    </div>

                    {isDesktop && <div className="flex items-center gap-3 mt-4 sm:mt-0">
                        {/* Mobile 'Create' button */}
                        {/*<Button className="lg:hidden h-9 px-4 shadow-sm" onClick={() => { setDefaultDate(undefined); setIsCreateOpen(true); }}>*/}
                        {/*    <Plus className="h-4 w-4 mr-2" /> Create*/}
                        {/*</Button>*/}

                        {gcalStatus?.data?.isConnected ? (
                            <Button variant="outline" size="sm" className="h-9 px-4 shadow-sm text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20" onClick={handleUnlinkGCal} disabled={post.isSubmitting}>
                                Disconnect Google Calendar
                            </Button>
                        ) : (
                            <Button variant="outline" size="sm" className="h-9 px-4 shadow-sm hover:bg-accent" onClick={handleConnectGCal} disabled={post.isSubmitting}>
                                Connect Google Calendar
                            </Button>
                        )}

                    </div>}
                </header>

                <div className="flex-1 overflow-y-auto bg-background custom-scrollbar">
                    {/* Calendar Grid Container */}
                    <div className="min-w-[800px] flex flex-col h-full"> 
                        {/* Days of week header */}
                        <div className="grid grid-cols-7 w-full border-b sticky top-0 bg-background z-20 shadow-sm border-l text-center">
                            {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((dayName, i) => (
                                <div key={dayName} className="py-2.5 text-[11px] font-bold text-muted-foreground tracking-widest border-r">
                                    {dayName}
                                </div>
                            ))}
                        </div>
                        
                        {(isLoadingEvents || isLoadingTasks) ? (
                            <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] text-muted-foreground gap-4">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <p>Syncing calendar...</p>
                            </div>
                        ) : (
                            <div className="flex flex-col w-full flex-1">
                                {weeks}
                            </div>
                        )}
                    </div>
                </div>
            </main>

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

