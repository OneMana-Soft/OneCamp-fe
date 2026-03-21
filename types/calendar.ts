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
}
