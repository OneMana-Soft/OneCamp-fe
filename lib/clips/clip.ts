// Clips: a short voice, video or screen recording made in the composer and
// sent as an attachment (components/clips/ClipRecorder). Slack and Teams both
// cap a clip at five minutes; so does OneCamp, and at the workspace's upload
// limit, whichever comes first: a clip is a file like any other.

export type ClipKind = "voice" | "video" | "screen"

/** The longest a clip runs, in seconds. */
export const CLIP_MAX_SECONDS = 5 * 60

/** What each kind records at: enough to read a screen or see a face, small enough that minutes fit an upload limit. */
export const CLIP_BITRATES: Record<ClipKind, { video?: number; audio: number }> = {
  voice: { audio: 64_000 },
  video: { video: 900_000, audio: 64_000 },
  screen: { video: 1_200_000, audio: 64_000 },
}

const CANDIDATES: Record<"audio" | "video", string[]> = {
  // Chrome and Firefox record WebM; Safari records MP4.
  video: ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"],
  audio: ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"],
}

/** The first container this browser records the kind in, or undefined when it can't. */
export function pickMimeType(kind: ClipKind, isTypeSupported: (type: string) => boolean): string | undefined {
  return CANDIDATES[kind === "voice" ? "audio" : "video"].find((t) => {
    try {
      return isTypeSupported(t)
    } catch {
      return false
    }
  })
}

/**
 * A file extension for a recorded type: webm or mp4 for video; weba (audio-
 * only WebM), m4a or ogg for a voice clip, so it's filed and played as audio
 * (lib/utils/file/getAttachmentType goes by the extension).
 */
export function extensionOf(mime: string): string {
  const base = mime.split(";")[0].trim().toLowerCase()
  if (base === "audio/mp4") return "m4a"
  if (base === "audio/webm") return "weba"
  if (base.endsWith("/mp4")) return "mp4"
  if (base.endsWith("/ogg")) return "ogg"
  return "webm"
}

const LABEL: Record<ClipKind, string> = { voice: "Voice clip", video: "Video clip", screen: "Screen clip" }

/** "Voice clip 2026-10-08 22.15.weba": the kind and when, in the recorder's own time. */
export function clipFileName(kind: ClipKind, mime: string, at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  const day = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
  return `${LABEL[kind]} ${day} ${pad(at.getHours())}.${pad(at.getMinutes())}.${extensionOf(mime)}`
}

/**
 * Why a recording should stop now, if it should: five minutes are up, or the
 * file is about to pass the upload limit (stopped a little short, as the last
 * chunk is still to come).
 */
export function stopReason(elapsedSeconds: number, bytes: number, limitBytes: number | undefined): "time" | "size" | null {
  if (elapsedSeconds >= CLIP_MAX_SECONDS) return "time"
  if (limitBytes && limitBytes > 0 && bytes >= limitBytes * 0.94) return "size"
  return null
}

/**
 * About how long the recording can go on, in seconds: the time left, or what
 * the bytes left last at the rate so far, whichever is less. Unknown (the
 * whole time left) until a few seconds have been measured.
 */
export function secondsLeft(elapsedSeconds: number, bytes: number, limitBytes: number | undefined): number {
  const byTime = CLIP_MAX_SECONDS - elapsedSeconds
  if (!limitBytes || elapsedSeconds < 3 || bytes <= 0) return Math.max(0, byTime)
  const rate = bytes / elapsedSeconds
  return Math.max(0, Math.min(byTime, (limitBytes * 0.94 - bytes) / rate))
}
