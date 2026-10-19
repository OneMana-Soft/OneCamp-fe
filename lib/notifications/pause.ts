/**
 * Pausing notifications, Slack's way: for a while, or until a moment. The
 * server holds the pause (push and email both wait on it); this device keeps a
 * copy so a foreground push that was already in flight stays quiet too.
 * Pure apart from the localStorage pair, so the choices are tested against
 * fixed clocks.
 */
import { formatSendAt, schedulePresets, type SchedulePreset } from "@/lib/messages/schedulePresets"

/** The server's limit: a forgotten pause should end on its own. */
export const MAX_PAUSE_MS = 7 * 24 * 60 * 60 * 1000

export function pausePresets(now: Date): SchedulePreset[] {
  const after = (minutes: number, label: string) => ({ label, at: new Date(now.getTime() + minutes * 60_000) })
  return [
    after(30, "For 30 minutes"),
    after(60, "For 1 hour"),
    after(120, "For 2 hours"),
    ...schedulePresets(now)
      .filter((p) => p.at.getTime() - now.getTime() <= MAX_PAUSE_MS)
      .map((p) => ({ ...p, label: `Until ${p.label.replace(/^(Later|Tomorrow)/, (w) => w.toLowerCase())}` })),
  ]
}

/**
 * When a "For ..." pause ends, said beside it ("until 8:10 PM"), so each
 * choice shows its end time. The "Until ..." presets already name their end:
 * nothing. clock writes a time in the reader's own clock. Pure.
 */
export function pauseEndsLine(preset: SchedulePreset, clock: (d: Date) => string): string {
  return /^For /.test(preset.label) ? `until ${clock(preset.at)}` : ""
}

/** The end of a pause still in force, or null. */
export function activePause(until: string | null | undefined, now: number = Date.now()): Date | null {
  if (!until) return null
  const d = new Date(until)
  return Number.isNaN(d.getTime()) || d.getTime() <= now ? null : d
}

const KEY = "oc_dnd_until"

/** This device's copy of the pause; null resumes. */
export function rememberPause(until: Date | string | null) {
  try {
    const d = until ? new Date(until) : null
    if (d && !Number.isNaN(d.getTime())) localStorage.setItem(KEY, String(d.getTime()))
    else localStorage.removeItem(KEY)
  } catch {
    /* storage blocked: the server still holds the pause */
  }
}

/** Whether this device should stay quiet right now. */
export function isPausedHere(now: number = Date.now()): boolean {
  try {
    const until = Number(localStorage.getItem(KEY))
    return Number.isFinite(until) && until > now
  } catch {
    return false
  }
}

/** The menu wording for the current state. */
export function pauseMenuLabel(pausedUntil: Date | null, focusUntil: Date | null = null): string {
  if (focusUntil && (!pausedUntil || focusUntil >= pausedUntil)) return `Focus time until ${formatSendAt(focusUntil)}`
  return pausedUntil ? "Resume notifications" : "Pause notifications…"
}

/** "Paused · 1 h 20 m", for the sun pill beside the status line while a pause runs. */
export function pauseLeftLabel(until: Date, now: Date = new Date()): string {
  const mins = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60_000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `Paused · ${h ? `${h} h${m ? ` ${m} m` : ""}` : `${m} m`}`
}
