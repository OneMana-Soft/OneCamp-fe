"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { usePost } from "@/hooks/usePost";
import { GetEndpointUrl } from "@/services/endPoints";
import type { UserProfileInterface } from "@/types/user";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { useSheetMode } from "@/components/ui/overlayMode";
import { OverlayBody } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { submitOnModEnter } from "@/lib/keys/chord";
import type { EventDraftValues } from "@/lib/calendar/duplicate";
import { FEATURE_CALENDAR_REPEATS, useFeature } from "@/hooks/useClientConfig";
import { readerZone } from "@/lib/calendar/eventsApi";
import { useTellGuests } from "@/components/calendar/tellGuests";
import { useScopePrompt } from "@/components/calendar/scopePrompt";
import { EventForm } from "@/components/calendar/form/eventForm";
import { createEvent } from "@/components/calendar/form/saveEvent";
import { formProblem, newEventValues, type EventFormValues } from "@/lib/calendar/eventForm";
import { notesText } from "@/lib/calendar/notes";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
    /** Where a slot click put it. */
    defaultStartDate?: Date;
    /** What quick create already knows ("More options"), or a copy of an event (Duplicate). */
    initial?: EventDraftValues;
    isGCalConnected?: boolean;
}

/** The form's values for a new event: from quick create or a copy, or at the slot clicked, or at the next round hour. */
function valuesFor(initial: EventDraftValues | undefined, at: Date | undefined): EventFormValues {
    const base = newEventValues(readerZone(), new Date(), initial ? { start: initial.start, end: initial.end } : at ? { start: at } : undefined);
    if (!initial) return base;
    return {
        ...base,
        title: initial.title,
        notes: notesText(initial.description),
        notesKept: initial.description ?? "",
        kind: initial.isAway ? "out_of_office" : initial.isFocus ? "focus" : "event",
        guests: initial.guests.map((p) => ({ uuid: p.uuid, email: p.email ?? "", name: p.name, optional: false })),
    };
}

/**
 * The full new-event dialog: the one Event Form (components/calendar/form)
 * in a dialog, the title large at the top, then the event's properties as
 * rows. Quick create's "More options" and Duplicate open it with what they
 * know; where the calendar keeps its own events every field is there, and
 * it is created through the calendar's own API (components/calendar/form/
 * saveEvent).
 */
export function CreateCalendarEventDialog({ open, onOpenChange, onSuccess, defaultStartDate, initial, isGCalConnected }: Props) {
    const post = usePost();
    // The calendar's one store: repeats, guests by email, colour, place, zones.
    const full = useFeature(FEATURE_CALENDAR_REPEATS);
    const { ask: askTell, prompt: tellPrompt } = useTellGuests();
    const { ask: askScope, prompt: scopePrompt } = useScopePrompt();
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile);
    const [values, setValues] = useState<EventFormValues>(() => valuesFor(initial, defaultStartDate));
    const [problem, setProblem] = useState<ReturnType<typeof formProblem>>(null);
    const [submitting, setSubmitting] = useState(false);

    // A fresh form each time it opens: from quick create, from a slot, or at the next round hour.
    useEffect(() => {
        if (!open) return;
        setValues(valuesFor(initial, defaultStartDate));
        setProblem(null);
    }, [open, defaultStartDate, initial]);

    const submit = async () => {
        const wrong = formProblem(values);
        setProblem(wrong);
        if (wrong || submitting) return;
        setSubmitting(true);
        const done = await createEvent({ makeRequest: post.makeRequest, askScope, askTell }, values, full);
        setSubmitting(false);
        if (!done.saved) return;
        onSuccess?.();
        onOpenChange(false);
    };

    const self = selfProfile.data?.data?.user_uuid;
    // On a phone, the sheet (the phone rule): its footer pinned under the one scroller.
    const sheet = useSheetMode();
    const formId = useId();
    const description = "Add it to your calendar, and to your guests’ calendars too.";
    const buttons = (
        <>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
            </Button>
            <Button type="submit" form={formId} disabled={submitting} aria-busy={submitting || undefined}>
                {submitting ? "Creating…" : "Create event"}
            </Button>
        </>
    );
    const body = (
        <>
            <EventForm
                values={values}
                onChange={setValues}
                full={full}
                organiser
                exclude={self ? [self] : []}
                creating
                googleConnected={isGCalConnected}
                problem={problem}
                autoFocusTitle
            />
            {tellPrompt}
            {scopePrompt}
        </>
    );
    const onSubmit = (e: FormEvent) => {
        e.preventDefault();
        void submit();
    };

    if (sheet) {
        return (
            <Drawer open={open} onOpenChange={onOpenChange} detent="large">
                <DrawerContent
                    data-event-dialog=""
                    header={
                        <>
                            <DrawerTitle className="text-title-3 text-ink">New event</DrawerTitle>
                            <DrawerDescription className="sr-only">{description}</DrawerDescription>
                        </>
                    }
                    footer={<div className="flex flex-col-reverse gap-2 [&>*]:h-11">{buttons}</div>}
                >
                    {/* The sheet's one scroller (components/ui/overlay): the pinned footer
                        draws its hairline while there is more of the form below. */}
                    <OverlayBody asChild className="mx-0 px-4 pb-2">
                        <form id={formId} onSubmit={onSubmit} onKeyDown={submitOnModEnter}>
                            {body}
                        </form>
                    </OverlayBody>
                </DrawerContent>
            </Drawer>
        );
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* No padding of its own (the body and footer pad themselves), so --dlg-pad says 0:
                the v3 footer bleeds by --dlg-pad, and 20 px of bleed pushed Create event
                out past the dialog's edge. */}
            <DialogContent className="gap-0 p-0 [--dlg-pad:0px] sm:max-w-[560px]" data-event-dialog="">
                <DialogTitle className="sr-only">New event</DialogTitle>
                <DialogDescription className="sr-only">{description}</DialogDescription>
                <form id={formId} onSubmit={onSubmit} onKeyDown={submitOnModEnter} className="flex max-h-[85dvh] flex-col">
                    <div className="overflow-y-auto px-6 pb-2 pt-6">{body}</div>
                    <DialogFooter className="border-t border-line px-6 py-3">{buttons}</DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
