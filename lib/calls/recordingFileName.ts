import { format } from "date-fns"

/** The one player's download name for a recording that started at `at`: "Recording 2026-11-06 14.05.mp4". Pure. */
export function recordingFileName(at: string): string {
  const date = new Date(at)
  return `Recording ${Number.isNaN(date.getTime()) ? "" : format(date, "yyyy-MM-dd HH.mm")}`.trim() + ".mp4"
}

/** The one player's title. A call nobody recorded has no file: it is "Call on 12 Nov 2026". A recording is its
 *  file's name, from its row or, when a link opened the player before the row was known, from its start
 *  (the transcript's answer carries it); with neither, plain "Recording". Pure. */
export function playerTitle({ fileName, startedAt, transcriptOnly }: { fileName?: string; startedAt?: string; transcriptOnly?: boolean }): string {
  const date = new Date(startedAt ?? "")
  const known = !!startedAt && !Number.isNaN(date.getTime())
  // A name its host gave the call (an event's "<title> transcript") stands; a recording's file name, which a call
  // nobody recorded doesn't have, gives way to its day.
  if (transcriptOnly) return fileName && !fileName.endsWith(".mp4") ? fileName : known ? `Call on ${format(date, "d MMM yyyy")}` : "Call"
  return fileName || (known ? recordingFileName(startedAt) : "Recording")
}
