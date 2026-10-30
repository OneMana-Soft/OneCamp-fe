/**
 * The calendar area's API endpoints: what only calendar code uses (split from
 * services/endPoints.ts on 18 Oct 2026, platform P-SPEED). A route loads only its
 * own area's. An endpoint a second area comes to use moves to services/endPoints.ts
 * (app/endpointsShared.test.ts); scripts/endpoints/areas.mjs says which file is whose.
 */

export enum CalendarGet {
    GetBookingPages = "/event/bookingPages",
}

export enum CalendarPost {
    // Ranked times in each person's own hours and zone, with reasons (calendar A3).
    SuggestTimes = "/event/suggestTimes",
    // People's kept working hours in their zones (calendar A3): {people: [...]}.
    PeopleHours = "/event/hours",
    SaveBookingPage = "/event/bookingPages",
    DeleteBookingPage = "/event/bookingPages/delete",
    DeleteCalendarEvent = "/event/deleteEvent",
    LeaveEvent = "/event/leaveEvent",
    UpdateCalendarEvent = "/event/updateEvent",
}
