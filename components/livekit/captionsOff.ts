/**
 * Why captions can't come on, in words (zoom-09 C2). In server mode with no
 * transcriber running, captions are off rather than falling through to a
 * browser or a provider: /config/client says so (transcription_off_reason)
 * and so does a refused switch. One plain line; only a workspace admin is
 * pointed at the card that starts it. transcription_disabled keeps its words.
 */
export const TRANSCRIBER_NOT_RUNNING = "transcriber_not_running"
const DOWN = "Captions are off: this workspace's transcriber isn't running."
const ASK = `${DOWN} Ask an admin to start it.`
const START = "Start it in Admin > Transcription"

/** The line a person reads on pressing Captions, or null when captions can come on. Pure. */
export function captionsOffSaid(reason: string | undefined, admin: boolean): { title: string; link?: { href: string; label: string } } | null {
  if (reason !== TRANSCRIBER_NOT_RUNNING) return null
  return admin ? { title: DOWN, link: { href: "/app/admin?tab=transcription", label: START } } : { title: ASK }
}

/** The Captions control's label while they can't come on: off, and why; undefined when they can. Pure. */
export const captionsOffLabel = (reason: string | undefined): string | undefined => (reason === TRANSCRIBER_NOT_RUNNING ? DOWN : undefined)

/** The server's refusal to turn captions on, in words; undefined for a code with none. Pure. */
export function captionsRefusal(code: string, admin: boolean): string | undefined {
  if (code === "transcription_disabled") return "Captions are turned off for this workspace. An admin can turn them on under Call transcription."
  if (code === TRANSCRIBER_NOT_RUNNING) return admin ? `${DOWN} ${START}.` : ASK
  return undefined
}
