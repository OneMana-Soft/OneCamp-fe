import type { AxiosError } from "axios"
import type { TranscriptLine } from "@/types/transcriptLine"
import { failureWords, loadFailure, type LoadFailure } from "@/lib/http/loadFailure"

/**
 * A call's transcript, exported and corrected (zoom-05). Pure: the player's
 * transcript panel (components/dialog/transcriptTools) asks these what to
 * offer and what to say.
 */

/** The files a transcript exports to, as the server makes them (transcriptExport, 65fd234ac). */
export type TranscriptFormat = "vtt" | "srt" | "txt"
export const TRANSCRIPT_FORMATS: { format: TranscriptFormat; label: string }[] = [
  { format: "vtt", label: "WebVTT (.vtt)" },
  { format: "srt", label: "SubRip (.srt)" },
  { format: "txt", label: "Plain text (.txt)" },
]

export interface CorrectRight {
  /** The line's speaker (transcript_from.user_uuid). */
  speaker?: string
  /** Who is looking. */
  me?: string
  /**
   * The place's Delete of the recording, as its host already gives it: in a
   * channel, its moderators OR a workspace admin (ch_is_admin || user_is_admin,
   * components/channel/channelRecording); in a chat, anyone in it.
   */
  mayDelete: boolean
  /** An event's call: its transcript is the calendar's, and the server answers 404 to a correction. */
  eventCall: boolean
  /** A guard only: no caller sets it today, since a guest has no account and so no `me`. */
  guest?: boolean
}

/**
 * Whether a line offers its pencil. The server's rule, mirrored, never
 * widened (business/Recording/transcriptCorrection.go correctable(); the
 * delete right by controllers/Recording/transcriptCorrection.go mayDelete()
 * -> inChannel()/inChat()): the line's speaker, or whoever may delete the
 * recording where it is kept. Never a guest's, never an event call's. The
 * server stays the judge; this only keeps a pencil off a line it would refuse.
 */
export function mayCorrectLine(r: CorrectRight): boolean {
  if (r.eventCall || r.guest || !r.me) return false
  return r.speaker === r.me || r.mayDelete
}

/** The panel's own read, asked for a file (the server names it). */
export function exportUrl(source: string, format: TranscriptFormat): string {
  return `${source}${source.includes("?") ? "&" : "?"}format=${format}`
}

/** A failed export: one sentence, with Try again only where a retry can work (a refusal can't). */
export function exportFailure(error: unknown): { words: string; retry: boolean } {
  const kind = loadFailure(error)
  return kind === "failed" ? { words: "Couldn't export the transcript.", retry: true } : { words: failureWords(kind, "transcript").title, retry: false }
}

export function correctionPath(egressId: string, uid: string): string {
  return `/calls/recordings/${encodeURIComponent(egressId)}/transcript/lines/${encodeURIComponent(uid)}`
}

export interface CorrectionRefusal {
  words: string
  /** On a 409, the line as it is now. */
  line?: TranscriptLine
  /** On a 409, the line's new words to show, when the server's sentence doesn't already quote them. */
  now?: string
}

/** What a refused correction says. The server's own sentence where it gives one (409 names who changed it to what). */
export function correctionRefusal(error: unknown): CorrectionRefusal {
  const res = (error as AxiosError<{ msg?: unknown; line?: TranscriptLine }>)?.response
  if (!res) return { words: "Couldn't save the correction. Check your connection and try again." }
  const said = typeof res.data?.msg === "string" && res.data.msg ? res.data.msg : ""
  switch (res.status) {
    case 409: {
      // The new words once: as "Now:" only where the sentence doesn't already say them.
      const now = res.data?.line?.transcript_text
      return { words: said || "Someone changed this line first.", line: res.data?.line, now: now !== undefined && !said.includes(now) ? now : undefined }
    }
    case 403:
      return { words: said || "You can't correct this line." }
    case 404:
      return { words: said || "That line isn't in this transcript." }
    case 400:
      return { words: "A line can't be empty or longer than 4,000 characters." }
    default:
      return { words: "Couldn't save the correction. Try again in a moment." }
  }
}

/** Save is off for empty or unchanged words, and while offline. */
export function maySave(draft: string, current: string, offline: boolean): boolean {
  const text = draft.trim()
  return !offline && text !== "" && text !== current.trim()
}

/** A corrected line's mark: what was said, and who changed it when. None for a line as said. */
export function correctedMark(line: TranscriptLine, when: (iso: string) => string): { said: string; by: string } | null {
  if (!line.transcript_corrected_at || line.transcript_original_text === undefined) return null
  const name = line.transcript_corrected_by?.user_full_name?.trim() || "someone"
  return { said: `Said: ${line.transcript_original_text}`, by: `Corrected by ${name}, ${when(line.transcript_corrected_at)}` }
}

/** V-1104: a refused recording beside words that read is the recording's refusal; both refused, the call's. */
export function stageNoun(transcriptReadable: boolean): "call" | "recording" {
  return transcriptReadable ? "recording" : "call"
}

/** V-1102: a download that failed, read as the stage reads it; a refusal says the shared words, with no try again. */
export function downloadRefusal(kind: LoadFailure): { title: string; description: string } {
  if (kind === "failed") return { title: "Couldn't download the recording", description: "Its link didn't come back. Try again in a moment." }
  const words = failureWords(kind, "recording")
  return { title: words.title, description: words.detail }
}
