import { addressOrHandleOf, displayNameOf } from "@/lib/personName"
import React, { useState, useRef } from 'react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, parseISO, isSameDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { shortDateTime, shortTime } from "@/lib/utils/date/shortDate";
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch";
import { usePost } from "@/hooks/usePost";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import { GetEventsResponse, CreateEventPayload } from "@/types/calendar";
import { UserProfileInterface, UserProfileDataInterface } from "@/types/user";
import { X, Check, Plus, Trash2, CalendarClock, Sparkles } from "@/lib/icons";
import { Edit2, ArrowRightToLine } from "@/lib/icons";
import { IdentityMark } from "@/components/ui/graphics/IdentityMark";
import { CALENDAR_HUE } from "@/components/calendar/calendarTones";
import { isAllDay } from "@/components/calendar/calendarLayout";
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
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList } from "@/components/ui/command";
import { UserComboboxItem } from "@/components/combobox/userComboboxItem";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { useSWRConfig } from "swr";
import {closeRightPanel} from "@/store/slice/desktopRightPanelSlice";
import {useSelector, useDispatch} from "react-redux";
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
    const rightPanelData = useSelector((state: any) => state.rightPanel.rightPanelState?.data);
    const viewStartDate = rightPanelData?.viewStartDate;
    const viewEndDate = rightPanelData?.viewEndDate;

    // Compute fallback date range when accessed outside the right panel (e.g., mobile route)
    const fallbackStart = React.useMemo(() => startOfWeek(startOfMonth(new Date())).toISOString(), []);
    const fallbackEnd = React.useMemo(() => endOfWeek(endOfMonth(new Date())).toISOString(), []);

    const effectiveStartDate = viewStartDate || fallbackStart;
    const effectiveEndDate = viewEndDate || fallbackEnd;

    const fetchUrl = `${GetEndpointUrl.GoogleCalendarEvents}?startDate=${effectiveStartDate}&endDate=${effectiveEndDate}`;

    const { data: eventsRes, isLoading, mutate } = useFetch<GetEventsResponse>(fetchUrl);
    const { data: selfProfile } = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile);
    const event = eventsRes?.data?.find(e => e.event_uuid === eventUUID);
    const dispatch = useDispatch();

    const currentUserUUID = selfProfile?.data?.user_uuid;
    const isCreator = event?.event_created_by?.user_uuid === currentUserUUID;
    const isParticipant = event?.event_participants?.some(p => p.user_uuid === currentUserUUID);

    const [participants, setParticipants] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<UserProfileDataInterface[]>([]);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const searchUserRef = useRef(usePost());
    const { mutate: globalMutate } = useSWRConfig();

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

    // Update form when event data changes (use event_uuid as stable identifier)
    const eventId = event?.event_uuid;
    React.useEffect(() => {
        if (event) {
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
    }, [eventId]);

    if (isLoading) return <div className="p-6 text-sm text-muted-foreground animate-pulse">Loading event details…</div>;
    if (!event) return <div className="p-6 text-sm text-muted-foreground">Event not found.</div>;

    const start = parseISO(event.event_start_time);
    const end = parseISO(event.event_end_time);
    // An all-day event ends at the next day's midnight: its last day is the one before.
    const allDay = isAllDay(start, end);
    const lastMoment = allDay ? new Date(end.getTime() - 60_000) : end;

    const handleSave = async (values: FormValues) => {
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
                }
            });
            await mutate();
            globalMutate(
                (key) => typeof key === 'string' && key.startsWith(GetEndpointUrl.GoogleCalendarEvents),
                undefined,
                { revalidate: true }
            );
            setIsEditing(false);
        } catch (e) {
            console.error("Failed to update event", e);
        }
    };
    const handleClose = () => {
        if (onClose) {
            onClose();
        } else {
            dispatch(closeRightPanel());
        }
    }

    // refreshEvents re-pulls the calendar after a mutation (reschedule, etc.),
    // mirroring handleSave's revalidation of every cached events query.
    const refreshEvents = async () => {
        await mutate();
        globalMutate(
            (key) => typeof key === 'string' && key.startsWith(GetEndpointUrl.GoogleCalendarEvents),
            undefined,
            { revalidate: true }
        );
    };

    const executeLeave = async () => {
        try {
            await post.makeRequest({
                apiEndpoint: (PostEndpointUrl.LeaveEvent + `/${event?.event_uuid}`) as PostEndpointUrl,
                payload: {}
            });
            await mutate();
            globalMutate(
                (key) => typeof key === 'string' && key.startsWith(GetEndpointUrl.GoogleCalendarEvents),
                undefined,
                { revalidate: true }
            );
            handleClose();
        } catch (e) {
            console.error("Failed to leave event", e);
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
                apiEndpoint: (`/event/deleteEvent/${event?.event_uuid}`) as any
            });
            await mutate();
            globalMutate(
                (key) => typeof key === 'string' && key.startsWith(GetEndpointUrl.GoogleCalendarEvents),
                undefined,
                { revalidate: true }
            );
            handleClose();
        } catch (e) {
            console.error("Failed to delete event", e);
        }
    };

    const handleDelete = async () => {
        dispatch(openUI({
            key: 'confirmAlert',
            data: {
                title: "Delete this event?",
                description: "It's removed from everyone's calendar. This can't be undone.",
                confirmText: "Delete event",
                destructive: true,
                onConfirm: executeDelete
            }
        }));
    };

    return (
        <ScrollArea className="h-full">
            <div className="p-6 space-y-6 flex flex-col h-full bg-background relative">
                <div className="flex items-center justify-between mb-2">
                    {/* Which calendar it is on, in that calendar's hue, the way the
                        calendar draws it: a quiet label, not an orange badge. */}
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <IdentityMark variant="dot" hue={CALENDAR_HUE.onecamp} />
                        Personal event
                    </span>
                    {!isEditing ? (
                        <div className="flex items-center gap-2">
                            {(isCreator || isParticipant) && (
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full text-muted-foreground hover:text-foreground" title="Prep brief" aria-label="Prep brief" onClick={() => setPrepOpen(true)}>
                                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                                </Button>
                            )}
                            {isCreator ? (
                                <>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full text-muted-foreground hover:text-foreground" title="Find a better time" aria-label="Find a better time" onClick={() => setRescheduleOpen(true)}>
                                        <CalendarClock className="h-4 w-4" aria-hidden="true" />
                                    </Button>
                                    {/* Red only when it is about to act: at rest it is one of
                                        the row's quiet buttons. */}
                                    <Button aria-label="Delete event" title="Delete event" variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full text-muted-foreground hover:text-danger-ink hover:bg-destructive/10" onClick={handleDelete}>
                                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                                    </Button>
                                    <Button aria-label="Edit event" title="Edit event" variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full text-muted-foreground hover:text-foreground" onClick={() => setIsEditing(true)}>
                                        <Edit2 className="h-4 w-4" aria-hidden="true" />
                                    </Button>
                                </>
                            ) : isParticipant ? (
                                <Button variant="outline" size="sm" className="h-7 text-2xs px-2 border-destructive/30 text-danger-ink hover:bg-destructive/10" onClick={handleLeave}>
                                    Leave
                                </Button>
                            ) : null}
                            <Button size="icon" variant="ghost" onClick={handleClose} aria-label="Close panel" className="hidden md:flex">
                                <ArrowRightToLine/>
                            </Button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1">
                            <Button aria-label="Cancel editing" variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full" onClick={() => setIsEditing(false)}>
                                <X className="h-4 w-4 text-danger-ink" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full" onClick={form.handleSubmit(handleSave)}>
                                {/* Was `className="h-4 w-4 statusColors.success.text"` — a member
                                    expression never wrapped in ${…}, so "statusColors.success.text"
                                    was emitted as a literal class name and the save tick rendered
                                    with no colour at all, indistinguishable from the cancel X
                                    beside it. The token class is what that was reaching for. */}
                                <Check className="h-4 w-4 text-success-ink" />
                            </Button>
                        </div>
                    )}
                </div>

                {!isEditing ? (
                    // As the task panel reads: quiet labels in one column, each
                    // value on one line beside its label, sections with one
                    // title style and the same rhythm.
                    <div className="space-y-6">
                        <h2 className="text-2xl font-medium tracking-tight text-foreground text-balance">{event.event_title}</h2>

                        <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2.5 text-sm">
                            <dt className="text-muted-foreground">Date</dt>
                            <dd className="truncate text-foreground">
                                {isSameDay(start, lastMoment) ? format(start, "EEEE d MMMM yyyy") : `${format(start, "EEE d MMM")} to ${format(lastMoment, "EEE d MMM yyyy")}`}
                            </dd>
                            <dt className="text-muted-foreground">Time</dt>
                            <dd className="truncate tabular-nums text-foreground">
                                {allDay ? "All day" : isSameDay(start, end) ? `${shortTime(start)} to ${shortTime(end)}` : `${shortDateTime(start)} to ${shortDateTime(end)}`}
                            </dd>
                            {event.event_is_focus && (
                                <>
                                    <dt className="text-muted-foreground">Focus time</dt>
                                    <dd className="truncate text-foreground">Pauses {displayNameOf(event.event_created_by) || "its owner"}&apos;s notifications</dd>
                                </>
                            )}
                            {event.event_is_away && (
                                <>
                                    <dt className="text-muted-foreground">Away</dt>
                                    <dd className="truncate text-foreground">Out of {displayNameOf(event.event_created_by) || "its owner"}&apos;s workload</dd>
                                </>
                            )}
                            {event.event_created_by && (
                                <>
                                    <dt className="text-muted-foreground">Created by</dt>
                                    <dd className="flex min-w-0 items-center gap-2 text-foreground">
                                        <IdentityMark
                                            variant="avatar"
                                            size={20}
                                            id={event.event_created_by.user_uuid}
                                            label={displayNameOf(event.event_created_by) || "Unknown"}
                                            src={event.event_created_by.user_profile_object_key ? `${GetEndpointUrl.PublicAttachmentURL}?objKey=${event.event_created_by.user_profile_object_key}` : undefined}
                                        />
                                        <span className="truncate">{displayNameOf(event.event_created_by) || "Unknown"}</span>
                                    </dd>
                                </>
                            )}
                        </dl>

                        <section className="space-y-2 border-t border-border/60 pt-5">
                            <h3 className="text-sm font-medium text-foreground">Notes</h3>
                            {event.event_description ? (
                                <SafeHtml
                                    as="div"
                                    sanitizer={sanitizeRichHtml}
                                    html={event.event_description}
                                    className="text-sm leading-relaxed text-foreground prose prose-sm dark:prose-invert max-w-none [&_a]:text-primary [&_a]:underline [&_a]:break-all"
                                />
                            ) : (
                                <p className="text-sm text-muted-foreground">No notes.</p>
                            )}
                        </section>

                        <section className="space-y-2 border-t border-border/60 pt-5">
                            <h3 className="flex items-baseline gap-1.5 text-sm font-medium text-foreground">
                                Guests
                                <span className="text-xs font-normal tabular-nums text-muted-foreground">{event.event_participants?.length || 0}</span>
                            </h3>
                            {event.event_participants?.length ? (
                                <ul className="space-y-1.5">
                                    {event.event_participants.map((participant) => (
                                        <li key={participant.user_uuid} className="flex min-w-0 items-center gap-2.5 text-sm">
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
                        <form onSubmit={form.handleSubmit(handleSave)} className="space-y-5">
                            <FormField
                                control={form.control}
                                name="title"
                                render={({ field }) => (
                                    <FormItem className="space-y-1">
                                        <FormLabel className="text-xs font-medium text-muted-foreground">Title</FormLabel>
                                        <FormControl>
                                            <Input {...field} className="h-9 focus-visible:ring-primary/30" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            
                            <div className="grid grid-cols-2 gap-3">
                                <FormField
                                    control={form.control}
                                    name="startTime"
                                    render={({ field }) => (
                                        <FormItem className="space-y-1">
                                            <FormLabel className="text-xs font-medium text-muted-foreground">Start</FormLabel>
                                            <FormControl>
                                                <DateTimePicker 
                                                    value={field.value ? new Date(field.value) : undefined} 
                                                    onChange={(date) => field.onChange(format(date, "yyyy-MM-dd'T'HH:mm"))} 
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="endTime"
                                    render={({ field }) => (
                                        <FormItem className="space-y-1">
                                            <FormLabel className="text-xs font-medium text-muted-foreground">End</FormLabel>
                                            <FormControl>
                                                <DateTimePicker 
                                                    value={field.value ? new Date(field.value) : undefined} 
                                                    onChange={(date) => field.onChange(format(date, "yyyy-MM-dd'T'HH:mm"))} 
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <FormField
                                control={form.control}
                                name="description"
                                render={({ field }) => (
                                    <FormItem className="space-y-1">
                                        <FormLabel className="text-xs font-medium text-muted-foreground">Notes</FormLabel>
                                        <FormControl>
                                            <Textarea {...field} className="min-h-[100px] resize-none text-sm focus-visible:ring-primary/30" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="space-y-2">
                                <FormLabel className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                                    Guests
                                    <Popover open={isSearchOpen} onOpenChange={setIsSearchOpen}>
                                        <PopoverTrigger asChild>
                                            <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-2xs text-primary hover:bg-primary/10">
                                                <Plus className="h-3 w-3 mr-1" /> Add
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent portalled={false} className="w-[240px] p-0 shadow-xl border-border/50" align="end">
                                            <Command shouldFilter={false}>
                                                <CommandInput
                                                    placeholder="Search user…"
                                                    className="h-9"
                                                    value={searchQuery}
                                                    onValueChange={setSearchQuery}
                                                />
                                                <CommandList>
                                                    <CommandEmpty>{searchQuery.length < 2 ? "Type to search…" : "No user found"}</CommandEmpty>
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
                                </FormLabel>
                                <div className="flex flex-wrap gap-2">
                                    {participants.map((p) => (
                                        <Badge key={p.user_uuid} variant="secondary" className="gap-1 px-2 py-0.5 text-2xs">
                                            {displayNameOf(p)}
                                            <X 
                                                className="h-2 w-2 cursor-pointer hover:text-danger-ink" 
                                                onClick={() => setParticipants(participants.filter(pt => pt.user_uuid !== p.user_uuid))}
                                            />
                                        </Badge>
                                    ))}
                                </div>
                            </div>

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
                        </form>
                    </Form>
                )}
            </div>
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
        </ScrollArea>
    );
}
