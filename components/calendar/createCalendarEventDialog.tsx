"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { wholeDays } from "@/lib/timeOff";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { usePost } from "@/hooks/usePost";
import { PostEndpointUrl } from "@/services/endPoints";
import { CreateEventPayload } from "@/types/calendar";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { PeoplePicker, type PickedPerson } from "@/components/common/peoplePicker";
import { FindTimeSuggestions } from "@/components/calendar/findTimeSuggestions";
import { AwayCheckbox, EventOptionCheckbox, FocusTimeCheckbox } from "@/components/calendar/FocusTimeCheckbox";
import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";
import type { UserProfileInterface } from "@/types/user";

const formSchema = z.object({
    title: z.string().min(1, "Title is required").max(100),
    description: z.string().optional(),
    startTime: z.string().min(1, "Start time is required"),
    endTime: z.string().min(1, "End time is required"),
    syncToGoogleCalendar: z.boolean().default(false),
    isFocus: z.boolean().default(false),
    isAway: z.boolean().default(false),
}).refine((data) => new Date(data.startTime) < new Date(data.endTime), {
    message: "End time must be after start time",
    path: ["endTime"]
});

type FormValues = z.infer<typeof formSchema>;

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
    defaultStartDate?: Date;
    isGCalConnected?: boolean;
}

export function CreateCalendarEventDialog({ open, onOpenChange, onSuccess, defaultStartDate, isGCalConnected }: Props) {
    const post = usePost();
    const [submitting, setSubmitting] = useState(false);
    const [guests, setGuests] = useState<PickedPerson[]>([]);
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            title: "",
            description: "",
            startTime: "",
            endTime: "",
            syncToGoogleCalendar: false,
            isFocus: false,
            isAway: false,
        }
    });

    // Reset form defaults when dialog opens with a new defaultStartDate
    useEffect(() => {
        if (open) {
            const initialStart = defaultStartDate || new Date();
            // Set time to next round hour
            const roundedStart = new Date(initialStart);
            roundedStart.setMinutes(0, 0, 0);
            if (roundedStart <= new Date()) {
                roundedStart.setHours(new Date().getHours() + 1);
            }
            const initialEnd = new Date(roundedStart.getTime() + 60 * 60 * 1000);

            setGuests([]);
            form.reset({
                title: "",
                description: "",
                startTime: format(roundedStart, "yyyy-MM-dd'T'HH:mm"),
                endTime: format(initialEnd, "yyyy-MM-dd'T'HH:mm"),
                syncToGoogleCalendar: false,
                isFocus: false,
                isAway: false,
            });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, defaultStartDate]);

    const onSubmit = async (values: FormValues) => {
        setSubmitting(true);
        try {
            // Time off is whole days, however the times were changed after ticking Away.
            const span = values.isAway
                ? wholeDays(new Date(values.startTime), new Date(values.endTime))
                : { start: new Date(values.startTime), end: new Date(values.endTime) };
            const startTimeISO = span.start.toISOString();
            const endTimeISO = span.end.toISOString();

            await post.makeRequest<CreateEventPayload>({
                apiEndpoint: PostEndpointUrl.CreateCalendarEvent,
                payload: {
                    title: values.title,
                    description: values.description,
                    startTime: startTimeISO,
                    endTime: endTimeISO,
                    syncToGoogleCalendar: values.syncToGoogleCalendar,
                    participants: guests.map((g) => g.uuid),
                    isFocus: values.isFocus && !values.isAway,
                    isAway: values.isAway,
                }
            });
            form.reset();
            onSuccess?.();
            onOpenChange(false);
        } catch (e) {
            console.error(e);
        } finally {
            setSubmitting(false);
        }
    };

    // The meeting's length, from the times as they stand: what find-a-time looks for.
    const [watchedStart, watchedEnd] = form.watch(["startTime", "endTime"]);
    const durationMinutes = Math.round((new Date(watchedEnd).getTime() - new Date(watchedStart).getTime()) / 60000) || 30;


    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>New event</DialogTitle>
                    <DialogDescription>
                        Add it to your calendar, and to your guests&apos; calendars too.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="title"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Title</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Event title" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="startTime"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                        <FormLabel>Start</FormLabel>
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
                                    <FormItem className="flex flex-col">
                                        <FormLabel>End</FormLabel>
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
                        <div className="grid gap-1.5">
                            <label htmlFor="event-guests" className="text-sm font-medium">Guests</label>
                            <PeoplePicker
                                id="event-guests"
                                value={guests}
                                onChange={setGuests}
                                exclude={selfProfile.data?.data?.user_uuid ? [selfProfile.data.data.user_uuid] : []}
                            />
                        </div>
                        <FindTimeSuggestions
                            participants={guests.map((g) => g.uuid)}
                            durationMinutes={durationMinutes}
                            onPick={(start, end) => {
                                form.setValue("startTime", format(start, "yyyy-MM-dd'T'HH:mm"), { shouldValidate: true });
                                form.setValue("endTime", format(end, "yyyy-MM-dd'T'HH:mm"), { shouldValidate: true });
                            }}
                        />
                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Description</FormLabel>
                                    <FormControl>
                                        <Textarea placeholder="Event details…" className="resize-none" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="isFocus"
                            render={({ field }) => (
                                <FocusTimeCheckbox
                                    checked={field.value}
                                    hint="Pause your notifications while this runs. Someone who really needs you can still use Notify anyway."
                                    onChange={(checked) => {
                                        field.onChange(checked);
                                        // A block with no name yet is named for what it is.
                                        if (checked && !form.getValues("title").trim()) form.setValue("title", "Focus time");
                                        if (checked) form.setValue("isAway", false);
                                    }}
                                />
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="isAway"
                            render={({ field }) => (
                                <AwayCheckbox
                                    checked={field.value}
                                    onChange={(checked) => {
                                        field.onChange(checked);
                                        if (!checked) return;
                                        form.setValue("isFocus", false);
                                        if (!form.getValues("title").trim()) form.setValue("title", "Away");
                                        // Time off is whole days: from the start of the first to the end of the last.
                                        const { start, end } = wholeDays(new Date(form.getValues("startTime")), new Date(form.getValues("endTime")));
                                        form.setValue("startTime", format(start, "yyyy-MM-dd'T'HH:mm"), { shouldValidate: true });
                                        form.setValue("endTime", format(end, "yyyy-MM-dd'T'HH:mm"), { shouldValidate: true });
                                    }}
                                />
                            )}
                        />
                        {isGCalConnected && (
                            <FormField
                                control={form.control}
                                name="syncToGoogleCalendar"
                                render={({ field }) => (
                                    <EventOptionCheckbox
                                        label="Add to Google Calendar too"
                                        hint="It goes on your Google Calendar as well as here."
                                        checked={field.value}
                                        onChange={field.onChange}
                                    />
                                )}
                            />
                        )}
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting ? "Creating…" : "Create event"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
