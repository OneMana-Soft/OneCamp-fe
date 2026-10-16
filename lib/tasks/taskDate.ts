/**
 * A date the server sent, or null when it's unset: empty, the zero time, or
 * unreadable. Apart from lib/timeline so a list's writes (useTaskUpdate) can
 * read a date without the timeline's layout coming onto the project's first
 * screen (app/firstLoad.test.ts).
 */
export function taskDate(s?: string | null): Date | null {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) || d.getFullYear() < 1971 ? null : d
}
