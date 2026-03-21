"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { usePost } from "@/hooks/usePost";
import { PostEndpointUrl } from "@/services/endPoints";
import { CreateEventPayload } from "@/types/calendar";
import { CalendarIcon, Clock } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateAndTimePicker } from "@/components/dateAndTimePicker/dateAndTimePicker";

const formSchema = z.object({
    title: z.string().min(1, "Title is required").max(100),
    description: z.string().optional(),
    startTime: z.string().min(1, "Start time is required"),
    endTime: z.string().min(1, "End time is required"),
    syncToGoogleCalendar: z.boolean().default(false),
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
    const [startPickerOpen, setStartPickerOpen] = useState(false);
    const [endPickerOpen, setEndPickerOpen] = useState(false);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            title: "",
            description: "",
            startTime: "",
            endTime: "",
            syncToGoogleCalendar: false,
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

            form.reset({
                title: "",
                description: "",
                startTime: format(roundedStart, "yyyy-MM-dd'T'HH:mm"),
                endTime: format(initialEnd, "yyyy-MM-dd'T'HH:mm"),
                syncToGoogleCalendar: false,
            });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, defaultStartDate]);

    const onSubmit = async (values: FormValues) => {
        setSubmitting(true);
        try {
            const startTimeISO = new Date(values.startTime).toISOString();
            const endTimeISO = new Date(values.endTime).toISOString();

            await post.makeRequest<CreateEventPayload>({
                apiEndpoint: PostEndpointUrl.CreateCalendarEvent,
                payload: {
                    title: values.title,
                    description: values.description,
                    startTime: startTimeISO,
                    endTime: endTimeISO,
                    syncToGoogleCalendar: values.syncToGoogleCalendar
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

    const formatDateDisplay = (dateStr: string) => {
        if (!dateStr) return "Select date & time";
        try {
            return format(new Date(dateStr), "MMM d, yyyy · h:mm a");
        } catch {
            return "Select date & time";
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>Create Personal Event</DialogTitle>
                    <DialogDescription>
                        Add a new personal event to your calendar.
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
                                        <Popover open={startPickerOpen} onOpenChange={setStartPickerOpen}>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="w-full justify-start text-left font-normal h-auto py-2 px-3"
                                                >
                                                    <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
                                                    <span className="text-xs truncate">
                                                        {formatDateDisplay(field.value)}
                                                    </span>
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-3" align="start">
                                                <DateAndTimePicker
                                                    value={field.value ? new Date(field.value) : new Date()}
                                                    onChange={(date) => {
                                                        field.onChange(format(date, "yyyy-MM-dd'T'HH:mm"));
                                                        setStartPickerOpen(false);
                                                    }}
                                                />
                                            </PopoverContent>
                                        </Popover>
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
                                        <Popover open={endPickerOpen} onOpenChange={setEndPickerOpen}>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="w-full justify-start text-left font-normal h-auto py-2 px-3"
                                                >
                                                    <Clock className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
                                                    <span className="text-xs truncate">
                                                        {formatDateDisplay(field.value)}
                                                    </span>
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-3" align="start">
                                                <DateAndTimePicker
                                                    value={field.value ? new Date(field.value) : new Date()}
                                                    onChange={(date) => {
                                                        field.onChange(format(date, "yyyy-MM-dd'T'HH:mm"));
                                                        setEndPickerOpen(false);
                                                    }}
                                                />
                                            </PopoverContent>
                                        </Popover>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Description</FormLabel>
                                    <FormControl>
                                        <Textarea placeholder="Event details..." className="resize-none" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        {isGCalConnected && (
                            <FormField
                                control={form.control}
                                name="syncToGoogleCalendar"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                        <FormControl>
                                            <input
                                                type="checkbox"
                                                checked={field.value}
                                                onChange={field.onChange}
                                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                            />
                                        </FormControl>
                                        <div className="space-y-1 leading-none">
                                            <FormLabel>
                                                Sync with Google Calendar
                                            </FormLabel>
                                            <p className="text-xs text-muted-foreground">
                                                This event will be added to your Google Calendar.
                                            </p>
                                        </div>
                                    </FormItem>
                                )}
                            />
                        )}
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting ? "Creating..." : "Create Event"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
