import { format } from "date-fns"

/** The one player's download name for a recording that started at `at`: "Recording 2026-11-06 14.05.mp4". Pure. */
export function recordingFileName(at: string): string {
  const date = new Date(at)
  return `Recording ${Number.isNaN(date.getTime()) ? "" : format(date, "yyyy-MM-dd HH.mm")}`.trim() + ".mp4"
}
