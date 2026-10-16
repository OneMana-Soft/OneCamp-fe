"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { wholeDays } from "@/lib/timeOff";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { usePost } from "@/hooks/usePost";
import { PostEndpointUrl, GetEndpointUrl } from "@/services/endPoints";
import type { CreateEventPayload } from "@/types/calendar";
import type { UserProfileInterface } from "@/types/user";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { PeoplePicker, type PickedPerson } from "@/components/common/peoplePicker";
import { FindTimeSuggestions } from "@/components/calendar/findTimeSuggestions";
import { AwayCheckbox, EventOptionCheckbox, FocusTimeCheckbox } from "@/components/calendar/FocusTimeCheckbox";
import { HUE_CLASS } from "@/components/ui/graphics/hues";
import { CALENDAR_HUE } from "@/components/calendar/calendarTones";
import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { cn } from "@/lib/utils/helpers/cn";

const formSchema = z.object({
    title: z.string().min(1, "Give it a title").max(100),
    description: z.string().optional(),
    startTime: z.string().min(1, "Start time is required"),
    endTime: z.string().min(1, "End time is required"),
    syncToGoogleCalendar: z.boolean().default(false),
    isFocus: z.boolean().default(false),
    isAway: z.boolean().default(false),
}).refine((data) => new Date(data.startTime) < new Date(data.endTime), {
    message: "It has to end after it starts",
    path: ["endTime"],
});

type FormValues = z.infer<typeof formSchema>;

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
    /** Where a slot click put it. */
    defaultStartDate?: Date;
    /** What quick create already knows ("More options"). */
    initial?: { title: string; start: Date; end: Date; isFocus: boolean; guests: PickedPerson[] };
    isGCalConnected?: boolean;
}

const local = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");

/** One property: a 96 px label on the left and its control on the right (content.md C14); stacked on a phone. */
function PropertyRow({ label, htmlFor, children, className }: { label: string; htmlFor?: string; children: React.ReactNode; className?: string }) {
    return (
        <div className={cn("grid items-start gap-1 py-1.5 sm:grid-cols-[96px_minmax(0,1fr)] sm:gap-3", className)} data-property-row="">
            <label htmlFor={htmlFor} className="flex items-center text-ui-sm text-ink-3 sm:h-8">
                {label}
            </label>
            <div className="min-w-0">{children}</div>
        </div>
    );
}

/**
 * The full new-event dialog: the title large at the top, then the event's
 * properties as rows (when, guests, a strip of free times, notes, calendar)
 * and its kinds as switch rows. Quick create's "More options" opens it with
 * what was typed.
 */
export function CreateCalendarEventDialog({ open, onOpenChange, onSuccess, defaultStartDate, initial, isGCalConnected }: Props) {
    const post = usePost();
    const [submitting, setSubmitting] = useState(false);
    const [guests, setGuests] = useState<PickedPerson[]>([]);
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: { title: "", description: "", startTime: "", endTime: "", syncToGoogleCalendar: false, isFocus: false, isAway: false },
    });

    // A fresh form each time it opens: from quick create, from a slot, or at the next round hour.
    useEffect(() => {
        if (!open) return;
        let start: Date;
        let end: Date;
        if (initial) {
            start = initial.start;
            end = initial.end;
        } else {
            start = new Date(defaultStartDate || new Date());
            start.setMinutes(0, 0, 0);
            if (start <= new Date()) start.setHours(new Date().getHours() + 1);
            end = new Date(start.getTime() + 60 * 60 * 1000);
        }
        setGuests(initial?.guests ?? []);
        form.reset({
            title: initial?.title ?? "",
            description: "",
            startTime: local(start),
            endTime: local(end),
            syncToGoogleCalendar: false,
            isFocus: initial?.isFocus ?? false,
            isAway: false,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, defaultStartDate, initial]);

    const onSubmit = async (values: FormValues) => {
        setSubmitting(true);
        try {
            // Time off is whole days, however the times were changed after ticking Away.
            const span = values.isAway
                ? wholeDays(new Date(values.startTime), new Date(values.endTime))
                : { start: new Date(values.startTime), end: new Date(values.endTime) };
            await post.makeRequest<CreateEventPayload>({
                apiEndpoint: PostEndpointUrl.CreateCalendarEvent,
                payload: {
                    title: values.title,
                    description: values.description,
                    startTime: span.start.toISOString(),
                    endTime: span.end.toISOString(),
                    syncToGoogleCalendar: values.syncToGoogleCalendar,
                    participants: guests.map((g) => g.uuid),
                    isFocus: values.isFocus && !values.isAway,
                    isAway: values.isAway,
                },
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
            {/* No padding of its own (the body and footer pad themselves), so --dlg-pad says 0:
                the v3 footer bleeds by --dlg-pad, and 20 px of bleed pushed Create event
                out past the dialog's edge. */}
            <DialogContent className="gap-0 p-0 [--dlg-pad:0px] sm:max-w-[560px]" data-event-dialog="">
                <DialogTitle className="sr-only">New event</DialogTitle>
                <DialogDescription className="sr-only">Add it to your calendar, and to your guests&apos; calendars too.</DialogDescription>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="flex max-h-[85dvh] flex-col">
                        <div className="overflow-y-auto px-6 pb-2 pt-6">
                            <FormField
                                control={form.control}
                                name="title"
                                render={({ field }) => (
                                    <FormItem className="pb-3">
                                        <FormControl>
                                            <input
                                                {...field}
                                                autoFocus
                                                aria-label="Title"
                                                placeholder="Event title"
                                                className="w-full bg-transparent font-display text-title-2 font-semibold text-ink outline-none placeholder:text-ink-3"
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <PropertyRow label="Starts" htmlFor="event-start">
                                <FormField
                                    control={form.control}
                                    name="startTime"
                                    render={({ field }) => (
                                        <FormItem>
                                            <DateTimePicker
                                                id="event-start"
                                                aria-label="Start"
                                                value={field.value ? new Date(field.value) : undefined}
                                                onChange={(date) => {
                                                    // Moving the start keeps the length.
                                                    const len = new Date(form.getValues("endTime")).getTime() - new Date(field.value).getTime();
                                                    field.onChange(local(date));
                                                    if (len > 0) form.setValue("endTime", local(new Date(date.getTime() + len)), { shouldValidate: true });
                                                }}
                                            />
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </PropertyRow>
                            <PropertyRow label="Ends" htmlFor="event-end">
                                <FormField
                                    control={form.control}
                                    name="endTime"
                                    render={({ field }) => (
                                        <FormItem>
                                            <DateTimePicker
                                                id="event-end"
                                                aria-label="End"
                                                since={watchedStart ? new Date(watchedStart) : undefined}
                                                value={field.value ? new Date(field.value) : undefined}
                                                onChange={(date) => field.onChange(local(date))}
                                            />
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </PropertyRow>
                            <PropertyRow label="Guests" htmlFor="event-guests">
                                <PeoplePicker
                                    id="event-guests"
                                    value={guests}
                                    onChange={setGuests}
                                    exclude={selfProfile.data?.data?.user_uuid ? [selfProfile.data.data.user_uuid] : []}
                                />
                            </PropertyRow>
                            <PropertyRow label="Free times">
                                <FindTimeSuggestions
                                    participants={guests.map((g) => g.uuid)}
                                    durationMinutes={durationMinutes}
                                    selected={watchedStart ? new Date(watchedStart) : undefined}
                                    onPick={(start, end) => {
                                        form.setValue("startTime", local(start), { shouldValidate: true });
                                        form.setValue("endTime", local(end), { shouldValidate: true });
                                    }}
                                />
                            </PropertyRow>
                            <PropertyRow label="Notes" htmlFor="event-notes">
                                <FormField
                                    control={form.control}
                                    name="description"
                                    render={({ field }) => (
                                        <textarea
                                            {...field}
                                            id="event-notes"
                                            rows={3}
                                            placeholder="Agenda, a call link, anything people should know"
                                            className="w-full resize-none rounded-lg bg-raised px-2.5 py-2 text-ui text-ink shadow-e1 outline-none placeholder:text-ink-3 focus-visible:ring-1 focus-visible:ring-brand/50"
                                        />
                                    )}
                                />
                            </PropertyRow>
                            <PropertyRow label="Calendar">
                                <span className="flex h-8 items-center gap-2 text-ui text-ink">
                                    <span aria-hidden="true" className={cn(HUE_CLASS[CALENDAR_HUE.onecamp], "size-2 rounded-[3px] bg-hue")} />
                                    OneCamp · Personal
                                </span>
                            </PropertyRow>
                            <div className="mt-2 border-t border-line pt-1">
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
                                                form.setValue("startTime", local(start), { shouldValidate: true });
                                                form.setValue("endTime", local(end), { shouldValidate: true });
                                            }}
                                        />
                                    )}
                                />
                                {isGCalConnected && (
                                    <FormField
                                        control={form.control}
                                        name="syncToGoogleCalendar"
                                        render={({ field }) => (
                                            <EventOptionCheckbox label="Add to Google Calendar too" hint="It goes on your Google Calendar as well as here." checked={field.value} onChange={field.onChange} />
                                        )}
                                    />
                                )}
                            </div>
                        </div>
                        <DialogFooter className="border-t border-line px-6 py-3">
                            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={submitting} aria-busy={submitting || undefined}>
                                {submitting ? "Creating…" : "Create event"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
