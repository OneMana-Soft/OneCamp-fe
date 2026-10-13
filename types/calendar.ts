import { UserProfileDataInterface } from "@/types/user";

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
     * ("YYYY-MM-DD", the end exclusive), never by its placeholder instants
     * (lib/calendar/allDay).
     */
    event_all_day?: boolean;
    event_start_date?: string;
    event_end_date?: string;
    isTask?: boolean;
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
