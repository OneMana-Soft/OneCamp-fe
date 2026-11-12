"use client"

import { lazyView } from "@/lib/lazy/lazyView"
import { useFetch } from "@/hooks/useFetch"
import { KEY, setPreference, type Preferences } from "@/lib/preferences/usePreference"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { DEFAULT_REMINDERS_KEY, DEFAULTS_MINE, type ReminderDefaults } from "@/lib/calendar/reminders"

/**
 * A calendar's default reminders for the reader (calendar head A, gcal-5),
 * one wiring for each place that opens them: the Calendars panel's menus on a
 * computer and the calendar options drawer on a phone. The dialog's code
 * loads on the click and it opens at once; it can save only once the reader's
 * preferences are read, so a save never drops another calendar's defaults.
 */
const Part = lazyView(() => import("@/components/calendar/defaultRemindersDialog"))

/** The reader's own calendar and their invitations, as the defaults name it. */
export const MINE = { id: DEFAULTS_MINE, name: "My calendar and your invitations" }

/** Starts loading the dialog's code, for a tap about to open it. */
export const warmDefaultReminders = () => Part.warm()

/** Sets one calendar's defaults beside the other calendars' (prefs as read); why it was refused, or null. */
export async function saveDefaultReminders(prefs: Record<string, unknown>, calendarId: string, next: ReminderDefaults): Promise<string | null> {
  const before = prefs[DEFAULT_REMINDERS_KEY]
  const kept = before && typeof before === "object" ? (before as Record<string, unknown>) : {}
  try {
    await setPreference(DEFAULT_REMINDERS_KEY, { ...kept, [calendarId]: next }, before ?? null)
    return null
  } catch (err) {
    return apiErrorMessage(err, "Couldn't save those reminders. Try again.")
  }
}

/** The dialog for one calendar ("mine" is the reader's own and their invitations), a sheet on a phone. */
export function DefaultReminders({ calendar, onClose }: { calendar: { id: string; name: string }; onClose: () => void }) {
  // Not in usePreference: that loads with every page.
  const read = useFetch<{ data?: Preferences }>(KEY)
  const prefs = read?.data?.data
  return (
    <Part.View
      fallback={null}
      render={(m) => (
        <m.default
          calendar={calendar}
          read={prefs ? { all: prefs[DEFAULT_REMINDERS_KEY] } : read?.isError ? "failed" : "loading"}
          onRetry={() => void read?.mutate()}
          onClose={onClose}
          onSave={(next) => (prefs ? saveDefaultReminders(prefs, calendar.id, next) : Promise.resolve("Your reminders couldn't be read. Try again."))}
        />
      )}
    />
  )
}
