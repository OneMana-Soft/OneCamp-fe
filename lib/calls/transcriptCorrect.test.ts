// zoom-05 Head B: export and correction in a call's transcript. Who may
// correct a line is the server's (business/Recording/transcriptCorrection.go
// correctable(), controllers/Recording/transcriptCorrection.go mayDelete() ->
// inChannel()/inChat(), at 65fd234ac); the client mirrors it in one function,
// pinned here against the server's cases.
import { describe, expect, it } from "vitest"
import type { TranscriptLine } from "@/types/transcriptLine"
import {
  correctedMark,
  correctionPath,
  correctionRefusal,
  downloadRefusal,
  exportFailure,
  exportUrl,
  mayCorrectLine,
  maySave,
  stageNoun,
} from "./transcriptCorrect"
import { loadFailure } from "@/lib/http/loadFailure"
import { pinTestClock } from "@/lib/testing/testClock"

// Its lines carry dates (a correction's time): the clock is pinned, as every such test's is.
pinTestClock()

const me = "u-me"
const other = "u-other"
const answer = (status: number, data: unknown = {}) => ({ isAxiosError: true, response: { status, data } })

describe("who may correct a line (MAIN must 1: the server's cases as a table)", () => {
  // speaker: whose line it is; mayDelete: the place's Delete, as its host gives it
  // (in a channel, its moderators OR a workspace admin: ch_is_admin || user_is_admin,
  // as components/channel/channelRecording gives it; anyone in a chat).
  const table: [string, Parameters<typeof mayCorrectLine>[0], boolean][] = [
    ["the speaker", { speaker: me, me, mayDelete: false, eventCall: false }, true],
    ["a channel moderator", { speaker: other, me, mayDelete: true, eventCall: false }, true],
    ["a workspace admin", { speaker: other, me, mayDelete: true, eventCall: false }, true],
    ["a plain channel member", { speaker: other, me, mayDelete: false, eventCall: false }, false],
    ["a group-chat member", { speaker: other, me, mayDelete: true, eventCall: false }, true],
    ["a direct-chat member", { speaker: other, me, mayDelete: true, eventCall: false }, true],
    ["a guest, even on a line of their own", { speaker: me, me, mayDelete: true, eventCall: false, guest: true }, false],
    ["an event call, even for the speaker (B1)", { speaker: me, me, mayDelete: true, eventCall: true }, false],
  ]
  it.each(table)("%s", (_who, right, yes) => {
    expect(mayCorrectLine(right)).toBe(yes)
  })

  it("B2: another member's line only with the delete right; no viewer known, no pencil", () => {
    expect(mayCorrectLine({ speaker: other, me, mayDelete: false, eventCall: false })).toBe(false)
    expect(mayCorrectLine({ speaker: undefined, me: undefined, mayDelete: false, eventCall: false })).toBe(false)
    expect(mayCorrectLine({ speaker: "", me: "", mayDelete: false, eventCall: false })).toBe(false)
  })
})

describe("export (B4, must 3)", () => {
  it("asks the panel's own read with format=, for every place", () => {
    expect(exportUrl("/channel/getRecordingTranscript/ch1/eg1", "vtt")).toBe("/channel/getRecordingTranscript/ch1/eg1?format=vtt")
    expect(exportUrl("/chat/getRecordingTranscript/g1/eg1", "srt")).toBe("/chat/getRecordingTranscript/g1/eg1?format=srt")
    expect(exportUrl("/calendar/events/ev1/call/artefacts/k1/transcript", "txt")).toBe("/calendar/events/ev1/call/artefacts/k1/transcript?format=txt")
  })

  it("a failed export says one sentence with Try again", () => {
    expect(exportFailure({ isAxiosError: true, message: "Network Error" })).toEqual({ words: "Couldn't export the transcript.", retry: true })
    expect(exportFailure(answer(503))).toEqual({ words: "Couldn't export the transcript.", retry: true })
  })

  it("403 and 404 say the shared words with no Try again", () => {
    expect(exportFailure(answer(403, { msg: "Not Authorised" }))).toEqual({ words: "You can't see this transcript", retry: false })
    expect(exportFailure(answer(404))).toEqual({ words: "This transcript doesn't exist or was deleted", retry: false })
  })
})

describe("correction answers (B3)", () => {
  it("names the line under its recording", () => {
    expect(correctionPath("eg 1", "0x2a")).toBe("/calls/recordings/eg%201/transcript/lines/0x2a")
  })

  it("409: the server's sentence and the line's new words", () => {
    const line = { uid: "0x2a", transcript_text: "ship it friday", transcript_timestamp: 1 } as TranscriptLine
    const r = correctionRefusal(answer(409, { msg: "Asha changed this line to \"ship it friday\".", line }))
    expect(r.words).toBe("Asha changed this line to \"ship it friday\".")
    expect(r.line?.transcript_text).toBe("ship it friday")
    // MAIN M2: the sentence already quotes the new words, so they aren't said twice.
    expect(r.now).toBeUndefined()
  })

  // V-1165: the server's own sentences, curly quotes and all
  // (backend business/Recording/transcriptCorrection.go:74, and :76 where
  // nobody is named, at 283788bff). A wording change there that drops the
  // words would show them twice, or not at all: this case is where it shows.
  it("409 with the server's real sentence: its words exactly, the new words once", () => {
    const line = { uid: "0x2a", transcript_text: "ship it friday", transcript_timestamp: 1 } as TranscriptLine
    const named = "Asha Rao corrected this line since you opened it. It now reads: \u201cship it friday\u201d"
    const r = correctionRefusal(answer(409, { msg: named, line }))
    expect(r.words).toBe(named)
    expect(r.line?.transcript_text).toBe("ship it friday")
    expect(r.now).toBeUndefined()
    const unnamed = "This line reads differently now: \u201cship it friday\u201d"
    const u = correctionRefusal(answer(409, { msg: unnamed, line }))
    expect(u.words).toBe(unnamed)
    expect(u.now).toBeUndefined()
  })

  it("409 without the words in its sentence: the line's new words, once (MAIN M2)", () => {
    const line = { uid: "0x2a", transcript_text: "ship it friday", transcript_timestamp: 1 } as TranscriptLine
    expect(correctionRefusal(answer(409, { msg: "Asha changed this line first.", line })).now).toBe("ship it friday")
    expect(correctionRefusal(answer(409, { line })).now).toBe("ship it friday")
    expect(correctionRefusal(answer(409, { line })).words).toBe("Someone changed this line first.")
  })

  it("403/404/400/503 and no answer: plain words", () => {
    expect(correctionRefusal(answer(403, { msg: "You can't correct this line." })).words).toBe("You can't correct this line.")
    expect(correctionRefusal(answer(404, { msg: "That line isn't in this transcript." })).words).toBe("That line isn't in this transcript.")
    expect(correctionRefusal(answer(400, {})).words).toBe("A line can't be empty or longer than 4,000 characters.")
    expect(correctionRefusal(answer(503)).words).toBe("Couldn't save the correction. Try again in a moment.")
    expect(correctionRefusal({ isAxiosError: true, message: "Network Error" }).words).toBe("Couldn't save the correction. Check your connection and try again.")
  })

  it("Save is off for empty or unchanged words, and offline", () => {
    expect(maySave("  ", "said", false)).toBe(false)
    expect(maySave("said ", "said", false)).toBe(false)
    expect(maySave("said so", "said", true)).toBe(false)
    expect(maySave("said so", "said", false)).toBe(true)
  })
})

describe("the corrected mark (B5)", () => {
  it("says what was said, and who changed it when", () => {
    const line = {
      transcript_text: "ship it friday",
      transcript_original_text: "ship it fried eh",
      transcript_corrected_at: "2026-11-17T05:30:00Z",
      transcript_corrected_by: { user_uuid: me, user_full_name: "Asha Rao" },
      transcript_timestamp: 1,
    } as TranscriptLine
    expect(correctedMark(line, () => "17 Nov")).toEqual({ said: "Said: ship it fried eh", by: "Corrected by Asha Rao, 17 Nov" })
    expect(correctedMark({ transcript_text: "as said", transcript_timestamp: 1 } as TranscriptLine, () => "x")).toBeNull()
  })
})

describe("refusals on the stage and the download (B6)", () => {
  it("V-1104: a refused recording beside words that read says recording; both refused says call", () => {
    expect(stageNoun(true)).toBe("recording")
    expect(stageNoun(false)).toBe("call")
  })

  it("V-1102: the download says no access and gone in the shared words, with no try again", () => {
    const refused = downloadRefusal(loadFailure(answer(403)))
    expect(refused.title).toBe("You can't see this recording")
    expect(refused.description).not.toMatch(/try again/i)
    const gone = downloadRefusal(loadFailure(answer(404)))
    expect(gone.title).toBe("This recording doesn't exist or was deleted")
    expect(gone.description).not.toMatch(/try again/i)
    expect(downloadRefusal("failed")).toEqual({ title: "Couldn't download the recording", description: "Its link didn't come back. Try again in a moment." })
  })
})
