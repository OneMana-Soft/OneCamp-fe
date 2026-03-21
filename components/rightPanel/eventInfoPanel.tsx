import React, { useState, useCallback, useRef } from 'react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, parseISO, isSameDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch";
import { usePost } from "@/hooks/usePost";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import { GetEventsResponse, CreateEventPayload } from "@/types/calendar";
import { UserProfileInterface, UserProfileDataInterface } from "@/types/user";
import {Calendar, Clock, AlignLeft, User, Edit2, X, Check, Users, Plus, Trash2, ArrowRightToLine} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList } from "@/components/ui/command";
import { UserComboboxItem } from "@/components/combobox/userComboboxItem";
import { cn } from "@/lib/utils/helpers/cn";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { useSWRConfig } from "swr";
import {closeRightPanel} from "@/store/slice/desktopRightPanelSlice";
import {useSelector, useDispatch} from "react-redux";
import { openUI } from "@/store/slice/uiSlice";

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
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eventId]);

    if (isLoading) return <div className="p-6 text-sm text-muted-foreground animate-pulse">Loading event details...</div>;
    if (!event) return <div className="p-6 text-sm text-muted-foreground">Event not found.</div>;

    const start = parseISO(event.event_start_time);
    const end = parseISO(event.event_end_time);

    const handleSave = async (values: FormValues) => {
        try {
            await post.makeRequest<CreateEventPayload>({
                apiEndpoint: (PostEndpointUrl.UpdateCalendarEvent + `/${event.event_uuid}`) as PostEndpointUrl,
                payload: {
                    title: values.title,
                    description: values.description,
                    startTime: new Date(values.startTime).toISOString(),
                    endTime: new Date(values.endTime).toISOString(),
                    participants: participants.map(p => p.user_uuid) || []
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
                title: "Leave Event",
                description: "Are you sure you want to leave this event?",
                confirmText: "Leave Event",
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
                title: "Delete Event",
                description: "Are you sure you want to delete this event? This action cannot be undone.",
                confirmText: "Delete Event",
                onConfirm: executeDelete
            }
        }));
    };

    return (
        <ScrollArea className="h-full">
            <div className="p-6 space-y-6 flex flex-col h-full bg-background relative">
                <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-bold text-primary border-primary/20">Personal Event</Badge>
                    {!isEditing ? (
                        <div className="flex items-center gap-2">
                            {isCreator ? (
                                <>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full text-destructive hover:bg-destructive/10" onClick={handleDelete}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full" onClick={() => setIsEditing(true)}>
                                        <Edit2 className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />
                                    </Button>
                                </>
                            ) : isParticipant ? (
                                <Button variant="outline" size="sm" className="h-7 text-[10px] px-2 border-destructive/30 text-destructive hover:bg-destructive/10" onClick={handleLeave}>
                                    Leave
                                </Button>
                            ) : null}
                            <Button size="icon" variant="ghost" onClick={handleClose} className="hidden md:flex">
                                <ArrowRightToLine/>
                            </Button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full" onClick={() => setIsEditing(false)}>
                                <X className="h-4 w-4 text-destructive" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full" onClick={form.handleSubmit(handleSave)}>
                                <Check className="h-4 w-4 text-green-500" />
                            </Button>
                        </div>
                    )}
                </div>

                {!isEditing ? (
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <h2 className="text-2xl font-bold tracking-tight text-foreground">{event.event_title}</h2>
                            
                            <div className="space-y-1.5 mt-4">
                                <div className="flex items-center gap-3 text-muted-foreground">
                                    <Calendar className="h-4 w-4 text-primary/70" />
                                    <span className="text-sm font-medium">{format(start, "EEEE, MMMM d, yyyy")}</span>
                                </div>
                                
                                <div className="flex items-center gap-3 text-muted-foreground">
                                    <Clock className="h-4 w-4 text-primary/70" />
                                    <span className="text-sm">
                                        {isSameDay(start, end) ? (
                                            <>
                                                {format(start, "h:mm a")} - {format(end, "h:mm a")}
                                            </>
                                        ) : (
                                            <div className="flex flex-col gap-0.5">
                                                <span>{format(start, "MMM d, h:mm a")}</span>
                                                <span className="text-[10px] opacity-70">to {format(end, "MMM d, h:mm a")}</span>
                                            </div>
                                        )}
                                    </span>
                                </div>
                            </div>

                            {event.event_created_by && (
                                <div className="flex items-center gap-3 text-muted-foreground mt-2">
                                    <User className="h-4 w-4 text-primary/70" />
                                    <span className="text-sm">Created by {event.event_created_by.user_name || event.event_created_by.user_full_name || "Unknown"}</span>
                                </div>
                            )}
                        </div>

                        <div className="space-y-2 pt-4 border-t border-border/50">
                            <div className="flex items-center gap-2 text-sm font-semibold text-foreground/80 lowercase tracking-tight">
                                <AlignLeft className="h-3.5 w-3.5" />
                                notes
                            </div>
                            {event.event_description ? (
                                <div 
                                    className="text-sm leading-relaxed text-muted-foreground pl-5 transition-all prose prose-sm dark:prose-invert max-w-none [&_a]:text-primary [&_a]:underline [&_a]:break-all"
                                    dangerouslySetInnerHTML={{ __html: event.event_description }}
                                />
                            ) : (
                                <p className="text-xs text-muted-foreground italic pl-5">No additional notes.</p>
                            )}
                        </div>

                        <div className="space-y-3 pt-4 border-t border-border/50">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm font-semibold text-foreground/80 lowercase tracking-tight">
                                    <Users className="h-3.5 w-3.5" />
                                    participants
                                </div>
                                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full font-medium">
                                    {event.event_participants?.length || 0}
                                </span>
                            </div>
                            
                            <div className="space-y-2 pl-5">
                                {event.event_participants?.length ? (
                                    event.event_participants.map((participant) => (
                                        <div key={participant.user_uuid} className="flex items-center gap-3 group">
                                            <Avatar className="h-7 w-7 border border-border/50">
                                                <AvatarImage src={participant.user_profile_object_key ? `${GetEndpointUrl.PublicAttachmentURL}?objKey=${participant.user_profile_object_key}` : ""} />
                                                <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                                    {(participant.user_name || "U").charAt(0).toUpperCase()}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-foreground/90 leading-none">{participant.user_name}</span>
                                                <span className="text-[10px] text-muted-foreground">{participant.user_email_id}</span>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-xs text-muted-foreground italic">No participants added yet.</p>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(handleSave)} className="space-y-5">
                            <FormField
                                control={form.control}
                                name="title"
                                render={({ field }) => (
                                    <FormItem className="space-y-1">
                                        <FormLabel className="text-xs font-bold text-muted-foreground uppercase">Title</FormLabel>
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
                                            <FormLabel className="text-xs font-bold text-muted-foreground uppercase">Start</FormLabel>
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
                                            <FormLabel className="text-xs font-bold text-muted-foreground uppercase">End</FormLabel>
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
                                        <FormLabel className="text-xs font-bold text-muted-foreground uppercase">Notes</FormLabel>
                                        <FormControl>
                                            <Textarea {...field} className="min-h-[100px] resize-none text-sm focus-visible:ring-primary/30" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="space-y-2">
                                <FormLabel className="text-xs font-bold text-muted-foreground uppercase flex items-center justify-between">
                                    Participants
                                    <Popover open={isSearchOpen} onOpenChange={setIsSearchOpen}>
                                        <PopoverTrigger asChild>
                                            <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-primary hover:bg-primary/10">
                                                <Plus className="h-3 w-3 mr-1" /> Add
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent portalled={false} className="w-[240px] p-0 shadow-xl border-border/50" align="end">
                                            <Command shouldFilter={false}>
                                                <CommandInput
                                                    placeholder="Search user..."
                                                    className="h-9"
                                                    value={searchQuery}
                                                    onValueChange={setSearchQuery}
                                                />
                                                <CommandList>
                                                    <CommandEmpty>{searchQuery.length < 2 ? "Type to search..." : "No user found"}</CommandEmpty>
                                                    <CommandGroup>
                                                        {searchResults.map((user) => (
                                                            <UserComboboxItem
                                                                key={user.user_uuid}
                                                                userUuid={user.user_uuid}
                                                                userName={user.user_name}
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
                                        <Badge key={p.user_uuid} variant="secondary" className="gap-1 px-2 py-0.5 text-[10px]">
                                            {p.user_name}
                                            <X 
                                                className="h-2 w-2 cursor-pointer hover:text-destructive" 
                                                onClick={() => setParticipants(participants.filter(pt => pt.user_uuid !== p.user_uuid))}
                                            />
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        </form>
                    </Form>
                )}
            </div>
        </ScrollArea>
    );
}
