// What a recording with nothing to play says of itself, in one place for the
// player's stage and the list's row (CALL-BUG-16, V-32).
//
// "failed": the recording broke (out of memory, storage refused the upload).
// "empty": it captured nothing. A call's recorder starts on the first picture or
// sound, and one stopped before anything came through (every camera off and
// every microphone muted, or stopped within seconds) has nothing in it. That
// isn't a fault, and it used to be told as one: "This recording couldn't be
// saved".

export type NothingToPlayState = "failed" | "empty"

export interface NothingToPlay {
  state: NothingToPlayState
  /** The player's title. */
  title: string
  /** The player's line under the title. */
  detail: string
  /** The list row's words for it. */
  short: string
}

const SAYS: Record<NothingToPlayState, Omit<NothingToPlay, "state">> = {
  failed: {
    title: "This recording couldn't be saved",
    detail: "Something went wrong while the call was being recorded, so there's nothing to play.",
    short: "Couldn't be saved",
  },
  empty: {
    title: "Nothing was recorded",
    detail: "No camera, microphone or screen came through before it stopped, so there's nothing to play.",
    short: "Nothing recorded",
  },
}

/**
 * Where a recording is kept, which is where it can be deleted: a channel's or a
 * chat's recordings, or an event's "Recordings & notes" (its call's, meet-02).
 */
export type RecordingHome = "conversation" | "event"

const DELETED_FROM: Record<RecordingHome, string> = {
  conversation: "It can be deleted from its channel's or chat's recordings.",
  event: "It can be deleted from its event's Recordings & notes.",
}

/** What a recording says when its status leaves nothing to play; null for one that plays or is on its way. Pure. */
export function nothingToPlay(status: unknown, home: RecordingHome = "conversation"): NothingToPlay | null {
  if (status !== "failed" && status !== "empty") return null
  const says = SAYS[status]
  return { state: status, ...says, detail: `${says.detail} ${DELETED_FROM[home]}` }
}

/** What the player's transcript read has answered so far. */
export interface TranscriptRead {
  /** It has a transcript route to read. An event's call plays by the event's own route, with none. */
  source: boolean
  /** Its first page has answered, with words or with a failure. */
  answered: boolean
  /** The lines it has. */
  lines: number
  /** The read failed, so whether there are words isn't known. */
  failed: boolean
}

/**
 * How the player lays out its Transcript panel beside the stage: "panel" keeps
 * it, "none" leaves the stage the whole sheet, and "wait" keeps the stage's
 * loading state with no panel. A recording with nothing to play keeps the
 * panel only for words to read: with none, the stage says why on its own, and
 * an empty "No transcript available" panel took half a phone's sheet beside it
 * (DESIGN-BUILD-28 on V-32). Until its transcript's first page answers, which
 * of the two isn't known, so it waits, and the sheet lays out once: deciding
 * early drew the stage's message full width, then moved it when the words
 * came (DESIGN-BUILD-29). A failed read keeps the panel, which says so with
 * Try again, so the words of a failed recording don't vanish. A player with no
 * transcript to read keeps no panel: it can't know the words, so it doesn't
 * say there are none beside a row that counts them (an event's call, meet-02).
 * `status` is the player's, or the row's while the player's is on its way. Pure.
 */
export function transcriptLayout(status: unknown, read: TranscriptRead): "panel" | "none" | "wait" {
  if (!read.source) return "none"
  if (read.lines > 0 || nothingToPlay(status) === null) return "panel"
  if (!read.answered) return "wait"
  return read.failed ? "panel" : "none"
}
