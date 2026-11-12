/** The calendars kept in step two ways (Google's, B6; Outlook's, B7), as people read them, and their connector (GET /connectors). Pure: the grid reads it. */
export type SyncProvider = "google" | "microsoft"

export const SYNC: Record<SyncProvider, { name: string; calendar: string; connector: string }> = {
  google: { name: "Google", calendar: "Google Calendar", connector: "google_calendar" },
  microsoft: { name: "Outlook", calendar: "Outlook Calendar", connector: "microsoft_calendar" },
}

/** GET /calendar/sync/{provider}: the person's own link. */
export const syncUrl = (provider: SyncProvider) => `/calendar/sync/${provider}`
