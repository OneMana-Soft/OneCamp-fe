import { avatarSeed } from "@/lib/utils/getAvatarColor";
import { displayNameOf } from "@/lib/personName"
import React, { useState } from 'react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, parseISO, isSameDay } from "date-fns";
import { shortDateTime } from "@/lib/utils/date/shortDate";
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch";
import { usePost } from "@/hooks/usePost";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import type { CalendarEventInterface, GetEventsResponse } from "@/types/calendar";
import { OWN_ERRORS } from "@/lib/axiosInstance";
import { ErrorState } from "@/components/ui/error-state";
import { UserProfileInterface } from "@/types/user";
import { Trash2, LogOut, Ellipsis, Video } from "@/lib/icons";
import { joinLinkOf, joinOffer } from "@/lib/calendar/joinLink";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EventMenuRows, type EventMenuItem } from "@/components/calendar/eventMenu";
import { Edit2 } from "@/lib/icons";
import { IdentityMark } from "@/components/ui/graphics/IdentityMark";
import { SpotError } from "@/components/ui/graphics";
import { CALENDAR_HUE } from "@/components/calendar/calendarTones";
import { RightPanelHeader } from "@/components/rightPanel/rightPanelHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { fieldLabel, fieldRow, sectionTitle } from "@/lib/ui/fieldRow";
import { cn } from "@/lib/utils/helpers/cn";
import { allDayItem } from "@/components/calendar/calendarLayout";
import { allDayLastDay, placedByDates } from "@/lib/calendar/allDay";
import { bookedMeetingConfirm } from "@/lib/calendar/bookedMeeting";
import { deleteEventConfirm, deleteEventRequest } from "@/lib/calendar/confirmDelete";
import { submitOnModEnter } from "@/lib/keys/chord";
import { Button } from "@/components/ui/button";
import { useSWRConfig, type Cache } from "swr";
import {closeRightPanel} from "@/store/slice/desktopRightPanelSlice";
import { useDispatch } from "react-redux";
import { openUI } from "@/store/slice/uiSlice";
import { sanitizeRichHtml } from "@/lib/sanitizeHtml";
import { SafeHtml } from "@/components/safeHtml/SafeHtml";
import { clockTime } from "@/lib/utils/date/clock";
import { FEATURE_CALENDAR_REPEATS, useFeature } from "@/hooks/useClientConfig";
import { ScopePromptView, useScopePrompt } from "@/components/calendar/scopePrompt";
import { lazyView } from "@/components/task/LazyView";
import type { EventFormValues, FormProblem } from "@/lib/calendar/eventForm";
import { isRichNotes } from "@/lib/calendar/richNotes";
import { useWhenIdle } from "@/hooks/useWhenIdle";
import { isInstanceId, seriesIdOf } from "@/lib/calendar/instanceId";
import { apiEventUrl, deleteApiEventRequest, guestLinkRequest, nudgeGuestsRequest, patchApiEventRequest, readApiEventRequest, readerZone, type Answer, type ApiEvent } from "@/lib/calendar/eventsApi";
import { eventGuests } from "@/components/calendar/rsvp/eventGuests";
import { EventGuestList } from "@/components/calendar/rsvp/guestList";
import { YourAnswer } from "@/components/calendar/rsvp/yourAnswer";
import { sendAnswer } from "@/components/calendar/rsvp/sendAnswer";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { toast } from "@/hooks/use-toast";
import { TellGuestsView, useTellGuests } from "@/components/calendar/tellGuests";

// What only an edit, a question or a menu's item needs, each a chunk of its
// own, as the calendar's grid keeps them (calendarApp.tsx): the repeat editor
// (its rule sheet, the date field and the rules' words), the scope question,
// "Tell guests?", and the assistant's Find a better time and Prep brief. The
// event's own page (a phone's) loaded them all with it, about 137 KB of source
// it never draws until asked. They are fetched when the page is idle, and the
// editor when Edit is pressed as well, so none waits when wanted.
// The edit kit (calendar FORM): the one form, its values from the event and its save.
const EventFormView = lazyView(() => import("@/components/calendar/form/panelEdit"));
// The reader's reminders (calendar A5): a chunk asked for once the row is drawn.
const Reminders = lazyView(() => import("@/components/calendar/rsvp/reminderRow"));
const fetchAhead = () =>
    [EventFormView, ScopePromptView, TellGuestsView, Reminders].forEach((view) => void view.warm().catch(() => {}));

interface EventInfoPanelProps {
    eventUUID: string;
    onClose?: () => void;
}

export default function EventInfoPanel({ eventUUID, onClose }: EventInfoPanelProps) {
    const post = usePost();
    const { copy } = useCopyToClipboard();
    const [isEditing, setIsEditing] = useState(false);
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
    // Where events repeat (the calendar's one store), the calendar's own API
    // says what the /event routes can't: how a series repeats and the
    // version a change is made from. An instance of a series is changed or
    // deleted through it, for the scope the person picks (D-CAL-6).
    const repeats = useFeature(FEATURE_CALENDAR_REPEATS);
    const { data: apiRes, mutate: mutateApi } = useFetch<{ data: ApiEvent }>(
        repeats && eventUUID && !eventUUID.startsWith("gcal-") ? apiEventUrl(eventUUID) : "",
        undefined,
        undefined,
        OWN_ERRORS,
    );
    const apiEvent = apiRes?.data;
    const { ask: askScope, prompt: scopePrompt } = useScopePrompt();
    const { ask: askTell, prompt: tellPrompt } = useTellGuests();
    useWhenIdle(fetchAhead);

    const currentUserUUID = selfProfile?.data?.user_uuid;
    const isCreator = event?.event_created_by?.user_uuid === currentUserUUID;
    const isParticipant = event?.event_participants?.some(p => p.user_uuid === currentUserUUID);

    // The Event Form's values while it is being edited (calendar FORM):
    // read from the calendar's own API where it keeps its events, else from
    // the event as listed (the old stores), when Edit is pressed.
    const [draft, setDraft] = useState<EventFormValues | null>(null);
    const [was, setWas] = useState<EventFormValues | null>(null);
    const [problem, setProblem] = useState<FormProblem | null>(null);
    const [saving, setSaving] = useState(false);
    // Another event opened: an edit of the last one is left.
    const eventId = event?.event_uuid;
    React.useEffect(() => {
        setIsEditing(false);
        setDraft(null);
    }, [eventId]);
    // The form's values come with the edit kit, fetched when the page was idle,
    // so usually here already: from the calendar's API where it keeps its
    // events, else from the event as listed (the old stores).
    React.useEffect(() => {
        if (!isEditing || draft || !event) return;
        let live = true;
        const zone = readerZone();
        EventFormView.warm().then(
            (m) => {
                if (!live) return;
                const values = apiEvent ? m.eventValues(apiEvent, m.ownReminders(event), zone) : m.listedValues(event, zone);
                setDraft(values);
                setWas(values);
            },
            () => {},
        );
        return () => {
            live = false;
        };
    }, [isEditing, draft, event, apiEvent]);

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
    const callLink = joinLinkOf(event);
    const join = joinOffer(callLink, start, end, new Date());

    // Edit opens the Event Form with the event as it is now; Save sends what
    // changed (components/calendar/form/saveEvent): through the calendar's own
    // API, asking the scope for an instance and "Tell guests?" for a change
    // guests would hear of, or through the /event routes for the old stores.
    // After this and following or all events, its id may name another
    // instance, so the panel closes and the lists show where everything went.
    const startEditing = () => {
        setDraft(null);
        setProblem(null);
        setIsEditing(true);
    };
    const stopEditing = () => {
        setIsEditing(false);
        setDraft(null);
    };
    const saveDraft = async () => {
        if (!draft || !was || saving) return;
        // Here already: the draft came with it.
        const m = await EventFormView.warm();
        const wrong = m.formProblem(draft);
        setProblem(wrong);
        if (wrong) return;
        const go = async () => {
            setSaving(true);
            const deps = { makeRequest: post.makeRequest, askScope, askTell };
            const r = apiEvent ? await m.saveEventChange(deps, { v: draft, was, api: apiEvent, organiser: isCreator }) : await m.saveLegacyChange(deps, event.event_uuid, draft);
            setSaving(false);
            if (!r.saved) {
                // Changed meanwhile: read again, and the edit stays open. Gone: the panel says so.
                if (r.why === "stale") void mutateApi();
                if (r.why === "gone") void mutate();
                return;
            }
            stopEditing();
            if (r.moved) {
                closeGone();
                return;
            }
            await Promise.all([mutate(), mutateApi()]);
            refreshLists();
        };
        // A booked meeting asks before its time changes, naming its guest (CAL-BUG-4).
        const booking = event.event_booking;
        const times = m.whenOf(draft);
        const at = (w: { at?: string; date?: string }) => new Date(w.at ?? `${w.date}T00:00:00`);
        const minute = (d: Date) => Math.floor(d.getTime() / 60_000);
        const moved = minute(at(times.start)) !== minute(start) || minute(at(times.end)) !== minute(end);
        if (!booking || !moved) return go();
        dispatch(openUI({
            key: 'confirmAlert',
            data: {
                ...bookedMeetingConfirm(booking, "move", at(times.start), at(times.end)),
                onConfirm: go,
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
            await post.makeRequest(deleteEventRequest(event.event_uuid));
            closeGone();
        } catch {
            // The toast said why.
        }
    };

    const handleDelete = async () => {
        // One instance of a series: which of them go to the trash.
        if (apiEvent && isInstanceId(apiEvent.id)) {
            const scope = await askScope("delete");
            if (!scope) return;
            try {
                await post.makeRequest(deleteApiEventRequest(apiEvent.id, scope, apiEvent.sequence));
                closeGone();
            } catch {
                // The toast said why.
            }
            return;
        }
        dispatch(openUI({
            key: 'confirmAlert',
            data: {
                ...deleteEventConfirm(event),
                destructive: true,
                onConfirm: executeDelete
            }
        }));
    };

    // Which calendar it is on, in that calendar's hue, the way the calendar
    // draws it: dot and word under the title, as a task's status sits under its.
    const onGoogle = event.event_uuid.startsWith("gcal-");

    // Guests' answers (calendar A2), where the calendar keeps them: a guest
    // answers, with a note for the organiser, until the event is over; the
    // organiser sees who said what, asks again, and copies the link of a
    // guest invited by email.
    const guestView = eventGuests(event, currentUserUUID);
    const ended = end <= new Date();
    const answering = !onGoogle && !isCreator && guestView.answered && guestView.mine !== undefined && !ended;
    const answer = async (a: Answer, note?: string) => {
        const ok = await sendAnswer({ post, askScope, selfId: currentUserUUID }, event, a, note);
        if (ok !== null) {
            await mutate();
            refreshLists();
        }
        return ok;
    };
    const nudge = async () => {
        try {
            const res = await post.makeRequest<unknown, { asked?: number }>(nudgeGuestsRequest(event.event_uuid));
            const asked = res?.asked ?? 0;
            toast(asked
                ? { title: `Asked ${asked} guest${asked === 1 ? "" : "s"} again` }
                : { title: "Nobody else to ask", description: "Everyone has answered, or was asked in the last day." });
            await mutate();
        } catch {
            // The toast said why.
        }
    };
    const copyLink = async (email: string, name: string) => {
        try {
            const res = await post.makeRequest<{ email: string }, { url?: string }>(guestLinkRequest(event.event_uuid, email));
            if (res?.url) void copy(res.url, `${name}'s answer link. Anyone with it can answer as them.`);
        } catch {
            // The toast said why.
        }
    };
    // The organiser's "Email me when guests answer" is the series', for an instance of one.
    const setEmailOnAnswers = async (on: boolean) => {
        if (!apiEvent) return;
        const failureTitle = "Couldn't change how you hear of answers";
        try {
            const target = isInstanceId(apiEvent.id)
                ? await post.makeRequest<unknown, ApiEvent>({ ...readApiEventRequest(seriesIdOf(apiEvent.id)), quiet: false, showErrorToast: true, failureTitle })
                : apiEvent;
            if (target) await post.makeRequest({ ...patchApiEventRequest(target.id, { sequence: target.sequence, email_on_answers: on }), failureTitle });
        } catch {
            // The toast said why.
        }
        void mutateApi();
    };
    // What the person can do with the event, once: quiet icon buttons in the
    // right panel's header, where hovering names them; on the phone's page,
    // where nothing hovers, Edit with its name and the rest in a labelled menu
    // (PTC-53).
    // (The AI edition adds a prep brief and "Find a better time" here.)
    const viewActions: EventAction[] = [
        ...(isCreator
            ? [
                  { label: "Delete event", icon: Trash2, onSelect: handleDelete, destructive: true },
                  { label: "Edit event", icon: Edit2, onSelect: startEditing, main: true },
              ]
            : isParticipant
              ? [
                    // A guest the organiser lets change the event edits it too (not what guests may do).
                    ...(apiEvent?.guests_can_modify ? [{ label: "Edit event", icon: Edit2, onSelect: startEditing, main: true }] : []),
                    { label: "Leave event", icon: LogOut, onSelect: handleLeave, destructive: true },
                ]
              : []),
    ];

    const actions = isEditing ? (
        <>
            <Button variant="ghost" size="sm" className="h-8" onClick={stopEditing}>
                Cancel
            </Button>
            <Button size="sm" className="h-8" onClick={() => void saveDraft()} disabled={saving || !draft} aria-busy={saving || undefined}>
                {saving ? "Saving…" : "Save"}
            </Button>
        </>
    ) : inPanel ? (
        <>
            {viewActions.map((a) => (
                // A destructive one is red only when it is about to act: at rest
                // it is one of the row's quiet buttons. Its press and hover tint
                // are the layer's danger tone (data-tone), not a fill of its own.
                <Button key={a.label} variant="ghost" size="icon" data-tone={a.destructive ? "danger" : undefined} className={cn("h-8 w-8 text-muted-foreground", a.destructive ? "hover:text-danger-ink" : "hover:text-foreground")} title={a.label} aria-label={a.label} onClick={a.onSelect}>
                    <a.icon className="h-4 w-4" aria-hidden="true" />
                </Button>
            ))}
        </>
    ) : (
        <PhoneEventActions actions={viewActions} />
    );

    return (
        <EventPanelFrame
            inPanel={inPanel}
            actions={actions}
            // A guest answers at the panel's foot (calendar A2), while it's to come.
            footer={
                !isEditing && answering ? (
                    <YourAnswer
                        answer={guestView.mine}
                        note={guestView.faces.find((f) => f.key === currentUserUUID)?.note}
                        organiserName={displayNameOf(event.event_created_by) || "the organiser"}
                        onAnswer={answer}
                        className=""
                    />
                ) : undefined
            }
        >
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
                        {/* Its first action, while there is a call to join
                            (lib/calendar/joinLink), as the event's pop card has it. */}
                        {callLink && join ? (
                            <Button asChild size="sm" variant={join === "primary" ? "default" : "secondary"} className="mt-4">
                                <a href={callLink} target="_blank" rel="noopener noreferrer">
                                    <Video />
                                    Join call
                                </a>
                            </Button>
                        ) : null}

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
                                    {allDay ? "All day" : isSameDay(start, end) ? `${clockTime(start)} to ${clockTime(end)}` : `${shortDateTime(start)} to ${shortDateTime(end)}`}
                                </dd>
                            </div>
                            {apiEvent?.recurrence ? (
                                <div className={fieldRow()} data-event-repeats="">
                                    <dt className={fieldLabel}>Repeats</dt>
                                    <dd className="flex min-h-8 min-w-0 items-center truncate text-sm text-foreground">
                                        {apiEvent.recurrence.text || "Repeats"}
                                    </dd>
                                </div>
                            ) : null}
                            {/* Each person's own reminders (calendar A5), where the calendar keeps them;
                                none for a guest who said no, as nobody is reminded of those. */}
                            {event.event_reminders && !onGoogle && !ended && (isCreator || guestView.mine !== "declined") ? (
                                <div className={fieldRow()} data-event-reminders="">
                                    <dt className={fieldLabel}>Reminders</dt>
                                    <dd className="flex min-h-8 min-w-0 items-center">
                                        <Reminders.View
                                            render={(m) => (
                                                <m.ReminderRow
                                                    event={event}
                                                    phone={!inPanel}
                                                    onSaved={() => {
                                                        void mutate();
                                                        refreshLists();
                                                    }}
                                                />
                                            )}
                                            fallback={<span className="min-h-7" aria-hidden="true" data-reminders-loading="" />}
                                        />
                                    </dd>
                                </div>
                            ) : null}
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
                                    <dt className={fieldLabel}>Organiser</dt>
                                    <dd className="flex min-h-8 min-w-0 items-center gap-2 text-sm text-foreground">
                                        <IdentityMark
                                            variant="avatar"
                                            size={20}
                                            id={avatarSeed(event.event_created_by)}
                                            label={displayNameOf(event.event_created_by) || "Unknown"}
                                            src={event.event_created_by.user_profile_object_key ? `${GetEndpointUrl.PublicAttachmentURL}?objKey=${event.event_created_by.user_profile_object_key}` : undefined}
                                        />
                                        <span className="truncate">{displayNameOf(event.event_created_by) || "Unknown"}</span>
                                    </dd>
                                </div>
                            )}
                        </dl>

                        <EventGuestList
                            guests={guestView}
                            organiser={isCreator}
                            ended={ended}
                            onNudge={() => void nudge()}
                            onCopyLink={(email, name) => void copyLink(email, name)}
                            emailOnAnswers={apiEvent?.email_on_answers}
                            onEmailOnAnswers={apiEvent ? (on) => void setEmailOnAnswers(on) : undefined}
                        />

                        <section className="mt-6 space-y-2">
                            <h3 className={sectionTitle}>Notes</h3>
                            {event.event_description && !isRichNotes(event.event_description) ? (
                                // Typed into a plain field: its own line breaks.
                                <p className="whitespace-pre-line break-words text-sm leading-relaxed text-foreground">{event.event_description}</p>
                            ) : event.event_description ? (
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

                    </div>
                ) : draft ? (
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            void saveDraft();
                        }}
                        onKeyDown={submitOnModEnter}
                        data-event-edit=""
                    >
                        <EventFormView.View
                            render={(m) => (
                                <m.EventForm
                                    values={draft}
                                    onChange={setDraft}
                                    full={!!apiEvent}
                                    organiser={isCreator}
                                    exclude={currentUserUUID ? [currentUserUUID] : []}
                                    problem={problem}
                                    titleClassName="font-sans text-xl font-medium tracking-tight sm:text-2xl"
                                    autoFocusTitle
                                    layout="panel"
                                />
                            )}
                            fallback={<EventPanelSkeleton />}
                        />
                    </form>
                ) : (
                    // The edit kit on its way (rarely: it is fetched when the page is idle).
                    <EventPanelSkeleton />
                )}
            {scopePrompt}
            {tellPrompt}
        </EventPanelFrame>
    );
}

/** Something the person can do with an event, from its panel or its page: a menu row with its icon. */
interface EventAction extends EventMenuItem {
    icon: React.ElementType;
    /** The phone page's one named button. */
    main?: boolean;
}

/** The phone page's actions (PTC-53): the main one with its name, the rest in a labelled menu. */
function PhoneEventActions({ actions }: { actions: EventAction[] }) {
    const main = actions.find((a) => a.main);
    const rest = actions.filter((a) => !a.main);
    return (
        <>
            {main ? (
                <Button variant="secondary" size="sm" onClick={main.onSelect}>
                    <main.icon aria-hidden="true" />
                    {main.label}
                </Button>
            ) : null}
            {rest.length ? (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="More actions">
                            <Ellipsis />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                        <EventMenuRows items={rest} />
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : null}
        </>
    );
}

/**
 * The panel's frame in every state (loading, missing, read, edited), so its
 * header and its body's inset never move between them. In the desktop right
 * panel the shared 48px header carries "Event", the view's actions and the
 * close button; on the phone's own page the app bar already says where you
 * are and has the way back, so the actions take a row of their own.
 */
function EventPanelFrame({ inPanel, actions, footer, children }: { inPanel: boolean; actions?: React.ReactNode; footer?: React.ReactNode; children: React.ReactNode }) {
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
            {/* Pinned at the foot, a hairline above, however long the notes run:
                the guest's answer, as the card and the phone's sheet keep it. */}
            {footer ? (
                <div className="shrink-0 border-t border-line px-6 py-3" data-event-panel-foot="">
                    {footer}
                </div>
            ) : null}
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
