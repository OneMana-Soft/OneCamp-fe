/**
 * What the event's panel and the phone's page need to edit an event, as one
 * chunk (calendar FORM): the one form, its values from the event as the
 * calendar's API or the old stores have it, what stops a save, and the save.
 * Fetched when the page is idle and asked for on Edit, so the page that
 * reads an event carries none of it (app/firstLoad.test.ts).
 */
export { EventForm } from "@/components/calendar/form/eventForm"
export { eventValues, formProblem, listedValues, ownReminders, whenOf } from "@/lib/calendar/eventForm"
export { saveEventChange, saveLegacyChange } from "@/components/calendar/form/saveEvent"
