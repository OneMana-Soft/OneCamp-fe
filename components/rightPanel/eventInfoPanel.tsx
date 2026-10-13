import { addressOrHandleOf, displayNameOf } from "@/lib/personName"
import React, { useState, useRef } from 'react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, parseISO, isSameDay } from "date-fns";
import { shortDateTime, shortTime } from "@/lib/utils/date/shortDate";
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch";
import { usePost } from "@/hooks/usePost";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import type { CalendarEventInterface, GetEventsResponse, CreateEventPayload } from "@/types/calendar";
import { OWN_ERRORS } from "@/lib/axiosInstance";
import { ErrorState } from "@/components/ui/error-state";
import { UserProfileInterface, UserProfileDataInterface } from "@/types/user";
import { X, Plus, Trash2, CalendarClock, Sparkles, LogOut } from "@/lib/icons";
import { Edit2 } from "@/lib/icons";
import { IdentityMark } from "@/components/ui/graphics/IdentityMark";
import { SpotError } from "@/components/ui/graphics";
import { CALENDAR_HUE } from "@/components/calendar/calendarTones";
import { RightPanelHeader } from "@/components/rightPanel/rightPanelHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { fieldLabel, fieldRow, inlineAdd, sectionTitle } from "@/lib/ui/fieldRow";
import { cn } from "@/lib/utils/helpers/cn";
import { allDayItem } from "@/components/calendar/calendarLayout";
import { allDayLastDay, placedByDates } from "@/lib/calendar/allDay";
import { bookedMeetingConfirm } from "@/lib/calendar/bookedMeeting";
import { AwayCheckbox, FocusTimeCheckbox } from "@/components/calendar/FocusTimeCheckbox";
import { wholeDays } from "@/lib/timeOff";
import RescheduleDialog from "@/components/ai/RescheduleDialog";
import MeetingPrepDialog from "@/components/ai/MeetingPrepDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList } from "@/components/ui/command";
import { UserComboboxItem } from "@/components/combobox/userComboboxItem";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { useSWRConfig, type Cache } from "swr";
import {closeRightPanel} from "@/store/slice/desktopRightPanelSlice";
import { useDispatch } from "react-redux";
import { openUI } from "@/store/slice/uiSlice";
import { sanitizeRichHtml } from "@/lib/sanitizeHtml";
import { SafeHtml } from "@/components/safeHtml/SafeHtml";

const formSchema = z.object({
    title: z.string().min(1, "Title is required"),
    description: z.string().optional(),
    startTime: z.string().min(1, "Start time is required"),
    endTime: z.string().min(1, "End time is required"),
});

type FormValues = z.infer<typeof formSchema>;

interface EventInfoPanelProps {
    eventUUID: string;
    onClose?: () => void;
}

export default function EventInfoPanel({ eventUUID, onClose }: EventInfoPanelProps) {
    const post = usePost();
    const [isEditing, setIsEditing] = useState(false);
    const [focus, setFocus] = useState(false);
    const [away, setAway] = useState(false);
    const [rescheduleOpen, setRescheduleOpen] = useState(false);
    const [prepOpen, setPrepOpen] = useState(false);
    // The event by its id (CAL-BUG-7). The panel used to look for it in the
    // list of the month on screen, or of today's month when it had none (a
    // phone, a link), so an event in any other month couldn't be opened,
    // edited, deleted or left there. A copy from a list already loaded stands
    // in while it comes.
    const { data: eventRes, isError, mutate } = useFetch<{ data: CalendarEventInterface }>(
        eventUUID ? `${GetEndpointUrl.GetEvent}/${encodeURIComponent(eventUUID)}` : "",
        undefined,
        { shouldRetryOnError: (err) => !isUnavailable(err) },
        OWN_ERRORS,
    );
    const { cache, mutate: globalMutate } = useSWRConfig();
    const listed = React.useMemo(() => listedCopy(cache, eventUUID), [cache, eventUUID]);
    const gone = isUnavailable(isError);
    const found = eventRes?.data ?? (gone ? undefined : listed);
    // A Google all-day event by its dates, never its instants (CAL-BUG-2).
    const event = React.useMemo(() => (found ? placedByDates(found) : undefined), [found]);
    const { data: selfProfile } = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile);
    const dispatch = useDispatch();

    const currentUserUUID = selfProfile?.data?.user_uuid;
    const isCreator = event?.event_created_by?.user_uuid === currentUserUUID;
    const isParticipant = event?.event_participants?.some(p => p.user_uuid === currentUserUUID);

    const [participants, setParticipants] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<UserProfileDataInterface[]>([]);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const searchUserRef = useRef(usePost());

    React.useEffect(() => {
        if (searchQuery.length < 2) {
            setSearchResults([]);
            return;
        }

        const controller = new AbortController();
        const delayDebounceFn = setTimeout(async () => {
            try {
                const res = await searchUserRef.current.makeRequest<{ searchText: string }, UserProfileDataInterface[]>({
                    apiEndpoint: PostEndpointUrl.SearchUserForDoc as any,
                    payload: { searchText: searchQuery }
                });
                if (!controller.signal.aborted && res && Array.isArray(res)) {
                    setSearchResults(res);
                }
            } catch {
                if (!controller.signal.aborted) setSearchResults([]);
            }
        }, 500);

        return () => {
            clearTimeout(delayDebounceFn);
            controller.abort();
        };
    }, [searchQuery]);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            title: event?.event_title || "",
            description: event?.event_description || "",
            startTime: event?.event_start_time ? format(parseISO(event.event_start_time), "yyyy-MM-dd'T'HH:mm") : "",
            endTime: event?.event_end_time ? format(parseISO(event.event_end_time), "yyyy-MM-dd'T'HH:mm") : "",
        }
    });

    // Update the form when another event opens, and once when the server's
    // answer replaces the list's copy (never while it is being edited).
    const eventId = event?.event_uuid;
    const source = eventRes?.data ? "server" : "list";
    React.useEffect(() => {
        if (event && !isEditing) {
            form.reset({
                title: event.event_title,
                description: event.event_description || "",
                startTime: format(parseISO(event.event_start_time), "yyyy-MM-dd'T'HH:mm"),
                endTime: format(parseISO(event.event_end_time), "yyyy-MM-dd'T'HH:mm"),
            });
            setParticipants(event.event_participants || []);
            setFocus(!!event.event_is_focus);
            setAway(!!event.event_is_away);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eventId, source]);

    // In the right panel the shared header carries the view's actions and the
    // close button; on the phone's own page the app bar has the way back.
    const inPanel = !onClose;
    const close = () => (onClose ? onClose() : dispatch(closeRightPanel()));

    if (!event) {
        if (gone) {
            return (
                <EventPanelFrame inPanel={inPanel}>
                    <EmptyState
                        illustration={<SpotError />}
                        title="This event isn't available"
                        description="It may have been deleted, or you're no longer one of its guests."
                        action={
                            <Button variant="outline" size="sm" onClick={close}>
                                Close
                            </Button>
                        }
                        className="pt-10"
                    />
                </EventPanelFrame>
            );
        }
        return (
            <EventPanelFrame inPanel={inPanel}>
                {isError ? <ErrorState subject="this event" onRetry={() => void mutate()} className="pt-10" /> : <EventPanelSkeleton />}
            </EventPanelFrame>
        );
    }

    const start = parseISO(event.event_start_time);
    const end = parseISO(event.event_end_time);
    // An all-day event ends at the next day's midnight: its last day is the one
    // before, counted in days (a day the clocks change on isn't 24 hours).
    const allDay = allDayItem(event, start, end);
    const lastMoment = allDay ? allDayLastDay(start, end) : end;

    const save = async (values: FormValues) => {
        try {
            await post.makeRequest<CreateEventPayload>({
                apiEndpoint: (PostEndpointUrl.UpdateCalendarEvent + `/${event.event_uuid}`) as PostEndpointUrl,
                payload: {
                    title: values.title,
                    description: values.description,
                    // Time off is whole days, however the times were changed after ticking Away.
                    startTime: (away ? wholeDays(new Date(values.startTime), new Date(values.endTime)).start : new Date(values.startTime)).toISOString(),
                    endTime: (away ? wholeDays(new Date(values.startTime), new Date(values.endTime)).end : new Date(values.endTime)).toISOString(),
                    participants: participants.map(p => p.user_uuid) || [],
                    isFocus: focus && !away,
                    isAway: away,
                },
                // The server's reason when it refuses ("Only the person who made
                // this event can change it."), never a bare failure (CAL-BUG-16).
                showErrorToast: true,
                failureTitle: "Couldn't save the event",
            });
            await mutate();
            refreshLists();
            setIsEditing(false);
        } catch (e) {
            // Deleted meanwhile, or no longer yours to see: the panel says so.
            if ((e as { response?: { status?: number } })?.response?.status === 404) void mutate();
        }
    };
    // A booked meeting asks before its time changes, naming its guest (CAL-BUG-4).
    const handleSave = (values: FormValues) => {
        const booking = event.event_booking;
        const minute = (d: Date) => Math.floor(d.getTime() / 60_000);
        const times = away ? wholeDays(new Date(values.startTime), new Date(values.endTime)) : { start: new Date(values.startTime), end: new Date(values.endTime) };
        const moved = minute(times.start) !== minute(parseISO(event.event_start_time)) || minute(times.end) !== minute(parseISO(event.event_end_time));
        if (!booking || !moved) return save(values);
        dispatch(openUI({
            key: 'confirmAlert',
            data: {
                ...bookedMeetingConfirm(booking, "move", `${format(times.start, "EEE d MMM")}, ${shortTime(times.start)} – ${shortTime(times.end)}`),
                onConfirm: () => save(values),
            }
        }));
    };
    const handleClose = close;

    // Every list of events on screen asks again: the calendar's ranges and Home's today.
    function refreshLists() {
        void globalMutate(
            (key) => typeof key === 'string' && key.startsWith(GetEndpointUrl.GoogleCalendarEvents),
            undefined,
            { revalidate: true }
        );
    }

    // refreshEvents re-pulls the event and the calendar after a mutation (reschedule, etc.).
    const refreshEvents = async () => {
        await mutate();
        refreshLists();
    };

    // An event left or deleted is closed, and its copy dropped rather than asked for again.
    const closeGone = () => {
        refreshLists();
        handleClose();
        void mutate(undefined, { revalidate: false });
    };

    const executeLeave = async () => {
        try {
            await post.makeRequest({
                apiEndpoint: (PostEndpointUrl.LeaveEvent + `/${event?.event_uuid}`) as PostEndpointUrl,
                payload: {},
                showErrorToast: true,
                failureTitle: "Couldn't leave the event",
            });
            closeGone();
        } catch {
            // The toast said why.
        }
    };

    const handleLeave = async () => {
        dispatch(openUI({
            key: 'confirmAlert',
            data: {
                title: "Leave this event?",
                description: "You're taken off its guest list. You can join again if you're invited.",
                confirmText: "Leave event",
                destructive: true,
                onConfirm: executeLeave
            }
        }));
    };

    const executeDelete = async () => {
        try {
            await post.makeRequest({
                method: "DELETE",
                apiEndpoint: (`/event/deleteEvent/${event?.event_uuid}`) as any,
                showErrorToast: true,
                failureTitle: "Couldn't delete the event",
            });
            closeGone();
        } catch {
            // The toast said why.
        }
    };

    const handleDelete = async () => {
        // A booked meeting names its guest, and whether they'll be told (CAL-BUG-4).
        const words = event.event_booking
            ? bookedMeetingConfirm(event.event_booking, "delete")
            : { title: "Delete this event?", description: "It's removed from everyone's calendar. This can't be undone.", confirmText: "Delete event" };
        dispatch(openUI({
            key: 'confirmAlert',
            data: {
                ...words,
                destructive: true,
                onConfirm: executeDelete
            }
        }));
    };

    // Which calendar it is on, in that calendar's hue, the way the calendar
    // draws it: dot and word under the title, as a task's status sits under its.
    const onGoogle = event.event_uuid.startsWith("gcal-");
    const quietIcon = "h-8 w-8 text-muted-foreground hover:text-foreground";

    const actions = isEditing ? (
        <>
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setIsEditing(false)}>
                Cancel
            </Button>
            <Button size="sm" className="h-8" onClick={form.handleSubmit(handleSave)}>
                Save
            </Button>
        </>
    ) : (
        <>
            {(isCreator || isParticipant) && (
                <Button variant="ghost" size="icon" className={quietIcon} title="Prep brief" aria-label="Prep brief" onClick={() => setPrepOpen(true)}>
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                </Button>
            )}
            {isCreator ? (
                <>
                    <Button variant="ghost" size="icon" className={quietIcon} title="Find a better time" aria-label="Find a better time" onClick={() => setRescheduleOpen(true)}>
                        <CalendarClock className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    {/* Red only when it is about to act: at rest it is one of
                        the row's quiet buttons. */}
                    <Button aria-label="Delete event" title="Delete event" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-danger-ink" onClick={handleDelete}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button aria-label="Edit event" title="Edit event" variant="ghost" size="icon" className={quietIcon} onClick={() => setIsEditing(true)}>
                        <Edit2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                </>
            ) : isParticipant ? (
                <Button aria-label="Leave event" title="Leave event" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-danger-ink" onClick={handleLeave}>
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                </Button>
            ) : null}
        </>
    );

    return (
        <EventPanelFrame inPanel={inPanel} actions={actions}>
                {!isEditing ? (
                    // As the task panel reads: the title, what it is under it,
                    // quiet labels in one column with each value on one line,
                    // then sections that a heading and space set apart.
                    <div data-event-view="">
                        <h2 className="text-xl font-medium tracking-tight text-foreground text-balance sm:text-2xl">{event.event_title}</h2>
                        <p className="mt-2 flex items-center gap-1.5 text-sm text-foreground">
                            <IdentityMark variant="dot" hue={onGoogle ? CALENDAR_HUE.google : CALENDAR_HUE.onecamp} />
                            {onGoogle ? "Google Calendar" : "Personal event"}
                        </p>

                        <dl className="mt-6">
                            <div className={fieldRow()}>
                                <dt className={fieldLabel}>Date</dt>
                                <dd className="flex min-h-8 min-w-0 items-center truncate text-sm text-foreground">
                                    {isSameDay(start, lastMoment) ? format(start, "EEEE d MMMM yyyy") : `${format(start, "EEE d MMM")} to ${format(lastMoment, "EEE d MMM yyyy")}`}
                                </dd>
                            </div>
                            <div className={fieldRow()}>
                                <dt className={fieldLabel}>Time</dt>
                                <dd className="flex min-h-8 min-w-0 items-center truncate text-sm tabular-nums text-foreground">
                                    {allDay ? "All day" : isSameDay(start, end) ? `${shortTime(start)} to ${shortTime(end)}` : `${shortDateTime(start)} to ${shortDateTime(end)}`}
                                </dd>
                            </div>
                            {event.event_is_focus && (
                                <div className={fieldRow()}>
                                    <dt className={fieldLabel}>Focus time</dt>
                                    <dd className="flex min-h-8 min-w-0 items-center truncate text-sm text-foreground">Pauses {displayNameOf(event.event_created_by) || "its owner"}&apos;s notifications</dd>
                                </div>
                            )}
                            {event.event_is_away && (
                                <div className={fieldRow()}>
                                    <dt className={fieldLabel}>Away</dt>
                                    <dd className="flex min-h-8 min-w-0 items-center truncate text-sm text-foreground">Out of {displayNameOf(event.event_created_by) || "its owner"}&apos;s workload</dd>
                                </div>
                            )}
                            {event.event_created_by && (
                                <div className={fieldRow()}>
                                    <dt className={fieldLabel}>Created by</dt>
                                    <dd className="flex min-h-8 min-w-0 items-center gap-2 text-sm text-foreground">
                                        <IdentityMark
                                            variant="avatar"
                                            size={20}
                                            id={event.event_created_by.user_uuid}
                                            label={displayNameOf(event.event_created_by) || "Unknown"}
                                            src={event.event_created_by.user_profile_object_key ? `${GetEndpointUrl.PublicAttachmentURL}?objKey=${event.event_created_by.user_profile_object_key}` : undefined}
                                        />
                                        <span className="truncate">{displayNameOf(event.event_created_by) || "Unknown"}</span>
                                    </dd>
                                </div>
                            )}
                        </dl>

                        <section className="mt-6 space-y-2">
                            <h3 className={sectionTitle}>Notes</h3>
                            {event.event_description ? (
                                <SafeHtml
                                    as="div"
                                    sanitizer={sanitizeRichHtml}
                                    html={event.event_description}
                                    className="text-sm leading-relaxed text-foreground max-w-none [&_a]:text-primary [&_a]:underline [&_a]:break-all"
                                />
                            ) : (
                                <p className="text-sm text-muted-foreground">No notes.</p>
                            )}
                        </section>

                        <section className="mt-6 space-y-2">
                            <h3 className={cn(sectionTitle, "flex items-baseline gap-1.5")}>
                                Guests
                                <span className="text-xs font-normal tabular-nums text-muted-foreground">{event.event_participants?.length || 0}</span>
                            </h3>
                            {event.event_participants?.length ? (
                                <ul>
                                    {event.event_participants.map((participant) => (
                                        <li key={participant.user_uuid} className="flex h-9 min-w-0 items-center gap-2.5 text-sm">
                                            <IdentityMark
                                                variant="avatar"
                                                size={24}
                                                id={participant.user_uuid}
                                                label={displayNameOf(participant) || "Someone"}
                                                src={participant.user_profile_object_key ? `${GetEndpointUrl.PublicAttachmentURL}?objKey=${participant.user_profile_object_key}` : undefined}
                                            />
                                            <span className="truncate text-foreground">{displayNameOf(participant)}</span>
                                            {addressOrHandleOf(participant) && (
                                                <span className="truncate text-xs text-muted-foreground">{addressOrHandleOf(participant)}</span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-muted-foreground">No guests yet.</p>
                            )}
                        </section>
                    </div>
                ) : (
                    <Form {...form}>
                        {/* The same label column as the facts above it, so a
                            field opens for editing where its value was. */}
                        <form onSubmit={form.handleSubmit(handleSave)} data-event-edit="">
                            <FormField
                                control={form.control}
                                name="title"
                                render={({ field }) => (
                                    <FormItem className={cn(fieldRow(), "space-y-0")}>
                                        <FormLabel className={cn(fieldLabel, "font-normal")}>Title</FormLabel>
                                        <div className="min-w-0">
                                            <FormControl>
                                                <Input {...field} className="h-9" />
                                            </FormControl>
                                            <FormMessage />
                                        </div>
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="startTime"
                                render={({ field }) => (
                                    <FormItem className={cn(fieldRow(), "space-y-0")}>
                                        <FormLabel className={cn(fieldLabel, "font-normal")}>Start</FormLabel>
                                        <div className="min-w-0">
                                            <FormControl>
                                                <DateTimePicker
                                                    value={field.value ? new Date(field.value) : undefined}
                                                    onChange={(date) => field.onChange(format(date, "yyyy-MM-dd'T'HH:mm"))}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </div>
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="endTime"
                                render={({ field }) => (
                                    <FormItem className={cn(fieldRow(), "space-y-0")}>
                                        <FormLabel className={cn(fieldLabel, "font-normal")}>End</FormLabel>
                                        <div className="min-w-0">
                                            <FormControl>
                                                <DateTimePicker
                                                    value={field.value ? new Date(field.value) : undefined}
                                                    onChange={(date) => field.onChange(format(date, "yyyy-MM-dd'T'HH:mm"))}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </div>
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="description"
                                render={({ field }) => (
                                    <FormItem className={cn(fieldRow("start"), "space-y-0")}>
                                        <FormLabel className={cn(fieldLabel, "font-normal sm:pt-2.5")}>Notes</FormLabel>
                                        <div className="min-w-0">
                                            <FormControl>
                                                <Textarea {...field} className="min-h-[100px] resize-none text-sm" />
                                            </FormControl>
                                            <FormMessage />
                                        </div>
                                    </FormItem>
                                )}
                            />

                            <div className={fieldRow("start")}>
                                <span className={cn(fieldLabel, "sm:pt-2")}>Guests</span>
                                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                    {participants.map((p) => (
                                        <span key={p.user_uuid} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-muted pl-1.5 pr-1 text-sm">
                                            <IdentityMark variant="avatar" size={20} id={p.user_uuid} label={displayNameOf(p) || "Someone"} />
                                            <span className="max-w-[10rem] truncate">{displayNameOf(p)}</span>
                                            <button
                                                type="button"
                                                aria-label={`Remove ${displayNameOf(p) || "this guest"}`}
                                                className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-highlight hover:text-danger-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                                                onClick={() => setParticipants(participants.filter((pt) => pt.user_uuid !== p.user_uuid))}
                                            >
                                                <X className="h-3.5 w-3.5" aria-hidden="true" />
                                            </button>
                                        </span>
                                    ))}
                                    <Popover open={isSearchOpen} onOpenChange={setIsSearchOpen}>
                                        <PopoverTrigger asChild>
                                            <Button type="button" variant="ghost" size="sm" className={cn(inlineAdd, participants.length > 0 && "ml-0")}>
                                                <Plus className="h-4 w-4" aria-hidden="true" /> Add a guest
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent portalled={false} className="w-[240px] p-0" align="start">
                                            <Command shouldFilter={false}>
                                                <CommandInput
                                                    placeholder="Search people…"
                                                    className="h-9"
                                                    value={searchQuery}
                                                    onValueChange={setSearchQuery}
                                                />
                                                <CommandList>
                                                    <CommandEmpty>{searchQuery.length < 2 ? "Type a name to search" : "Nobody by that name"}</CommandEmpty>
                                                    <CommandGroup>
                                                        {searchResults.map((user) => (
                                                            <UserComboboxItem
                                                                key={user.user_uuid}
                                                                userUuid={user.user_uuid}
                                                                userName={displayNameOf(user)}
                                                                userFullName={user.user_full_name}
                                                                userHandle={user.user_handle}
                                                                userEmail={user.user_email_id}
                                                                userProfileObjectKey={user.user_profile_object_key}
                                                                isSelected={participants.some(p => p.user_uuid === user.user_uuid)}
                                                                onSelect={() => {
                                                                    if (!participants.some(p => p.user_uuid === user.user_uuid)) {
                                                                        setParticipants([...participants, user]);
                                                                    }
                                                                    setIsSearchOpen(false);
                                                                    setSearchQuery("");
                                                                }}
                                                            />
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>

                            <div className="mt-4 space-y-3">
                                <FocusTimeCheckbox
                                    checked={focus}
                                    onChange={(checked) => {
                                        setFocus(checked);
                                        if (checked) setAway(false);
                                    }}
                                />
                                <AwayCheckbox
                                    checked={away}
                                    onChange={(checked) => {
                                        setAway(checked);
                                        if (!checked) return;
                                        setFocus(false);
                                        // Time off is whole days.
                                        const days = wholeDays(new Date(form.getValues("startTime")), new Date(form.getValues("endTime")));
                                        form.setValue("startTime", format(days.start, "yyyy-MM-dd'T'HH:mm"), { shouldValidate: true });
                                        form.setValue("endTime", format(days.end, "yyyy-MM-dd'T'HH:mm"), { shouldValidate: true });
                                    }}
                                />
                            </div>
                        </form>
                    </Form>
                )}
            <RescheduleDialog
                open={rescheduleOpen}
                onOpenChange={setRescheduleOpen}
                eventUUID={event.event_uuid}
                onRescheduled={refreshEvents}
            />
            <MeetingPrepDialog
                open={prepOpen}
                onOpenChange={setPrepOpen}
                eventUUID={event.event_uuid}
            />
        </EventPanelFrame>
    );
}

/**
 * The panel's frame in every state (loading, missing, read, edited), so its
 * header and its body's inset never move between them. In the desktop right
 * panel the shared 48px header carries "Event", the view's actions and the
 * close button; on the phone's own page the app bar already says where you
 * are and has the way back, so the actions take a row of their own.
 */
function EventPanelFrame({ inPanel, actions, children }: { inPanel: boolean; actions?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="flex h-full min-h-0 flex-col bg-background" data-event-panel="">
            {inPanel ? (
                <RightPanelHeader titleKey="event" actions={actions} />
            ) : actions ? (
                <div className="flex h-12 shrink-0 items-center justify-end gap-1 border-b border-border/60 px-3">{actions}</div>
            ) : null}
            <ScrollArea className="min-h-0 flex-1">
                <div className="px-6 pb-8 pt-5">{children}</div>
            </ScrollArea>
        </div>
    );
}

/** The panel's shape while the event loads: a title, its calendar, three facts. */
function EventPanelSkeleton() {
    return (
        <div role="status" aria-label="Loading the event">
            <Skeleton className="h-7 w-3/5" />
            <Skeleton className="mt-3 h-4 w-28" />
            <div className="mt-6 space-y-2" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                    <div key={i} className={fieldRow()}>
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className={cn("h-4", i === 1 ? "w-28" : "w-40")} />
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * Whether the server answered that this event isn't there for this person:
 * deleted, never theirs, or an id it can't read. A 404 without a message is
 * a server without the route (an older one), not an answer about the event.
 */
function isUnavailable(err: unknown): boolean {
    const res = (err as { response?: { status?: number; data?: { msg?: unknown } } } | undefined)?.response;
    if (!res) return false;
    if (res.status === 400 || res.status === 403) return true;
    return res.status === 404 && typeof res.data?.msg === "string";
}

/** The event as a list already loaded holds it (the calendar's range, Home's today), to show while the event itself comes. */
function listedCopy(cache: Cache | undefined, uuid: string): CalendarEventInterface | undefined {
    if (!uuid || !cache) return undefined;
    for (const key of cache.keys()) {
        if (typeof key !== "string" || !key.startsWith(GetEndpointUrl.GoogleCalendarEvents)) continue;
        const hit = (cache.get(key)?.data as GetEventsResponse | undefined)?.data?.find((e) => e.event_uuid === uuid);
        if (hit) return hit;
    }
    return undefined;
}
