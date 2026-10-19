import { UserProfileDataInterface } from "@/types/user";
import type { EventBooking } from "@/lib/calendar/bookedMeeting";

export interface CalendarEventInterface {
    uid?: string;
    event_uuid: string;         // 'uuid' in struct, 'event_uuid' in JSON
    event_title: string;        // 'event_title' in JSON
    event_description?: string; // 'event_description' in JSON
    event_start_time: string;   // 'event_start_time' in JSON
    event_end_time: string;     // 'event_end_time' in JSON
    event_created_by?: UserProfileDataInterface; // 'event_created_by' in JSON
    event_google_calendar_id?: string;
    event_participants?: UserProfileDataInterface[];
    /** Focus time: the creator's notifications pause while it runs. */
    event_is_focus?: boolean;
    /** Time off: the creator is away; the workload counts those working days out of their capacity. */
    event_is_away?: boolean;
    /**
     * A Google all-day event: placed by event_start_date and event_end_date
     * ("YYYY-MM-DD", the end exclusive), never by its midnight-UTC instants
     * (lib/calendar/allDay).
     */
    event_all_day?: boolean;
    event_start_date?: string;
    event_end_date?: string;
    /** Someone booked it through a booking page: shown to its creator only, while the booking is to come. */
    event_booking?: EventBooking;
    /** Each guest's answer, from the calendar's one store (calendar A2): members by uuid, guests invited by email by address. */
    event_guests?: EventGuest[];
    /**
     * The reader's own reminders for it (calendar A5, the one store): minutes
     * before it starts (an all-day event's, before 00:00 of its first day);
     * empty for none. event_reminders_default says they set none and these
     * are the default's.
     */
    event_reminders?: number[];
    event_reminders_default?: boolean;
    /** Its own colour, one of the camp hues (the Event Form), and where it is: from the one store. */
    event_hue?: string;
    event_location?: string;
    isTask?: boolean;
}

/** One guest's answer to an event: needs_action, accepted, declined or tentative, with their note. */
export interface EventGuest {
    user_uuid?: string;
    email?: string;
    name?: string;
    role: string;
    response: string;
    note?: string;
    /** To the organiser alone: whether a guest by email was emailed their invitation. */
    invite?: "sent" | "not_sent" | "failed";
}

export interface GetEventsResponse {
    data: CalendarEventInterface[];
    msg?: string;
}

// Payload for creating/updating respects camelCase still
export interface CreateEventPayload {
    title: string;
    description?: string;
    startTime: string;
    endTime: string;
    syncToGoogleCalendar?: boolean;
    participants?: string[];
    isFocus?: boolean;
    isAway?: boolean;
}
