import { describe, expect, it } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { playerUrls, refOfRecording } from "@/lib/calls/playerUrls"
import type { RecordingInfoInterface } from "@/types/recording"

pinTestClock()

const CH = "0b6e5d4c-3b2a-4190-8f7e-6d5c4b3a2910"
const ME = "1c7f6e5d-4c3b-4a21-9f8e-7d6c5b4a3021"
const LEE = "2d8a7f6e-5d4c-4b32-8a9f-8e7d6c5b4132"
const ANN = "3e9b8a7f-6e5d-4c43-9b8a-9f8e7d6c5243"
const GROUP = "9f3c2b1a0e9d8c7b6a5f4e3d2c1b0a99"

const rec = (o: Partial<RecordingInfoInterface>) => o as RecordingInfoInterface
const person = (user_uuid: string) => ({ user_uuid })

// The one rule the player reads a conversation's call by: the recordings list (app/app/recordings) and a board's
// calls (components/board/boardCall) both ask it.
describe("where the one player reads a conversation's call", () => {
  it("reads a channel's, a group's and a DM's by their own routes, a DM's by the other person", () => {
    expect(playerUrls({ kind: "channel", id: CH }, ME)).toEqual({ media: `/ch/getRecordingURL/${CH}`, transcript: `/ch/getRecordingTranscript/${CH}` })
    expect(playerUrls({ kind: "group", id: GROUP }, ME)).toEqual({ media: `/groupChat/getRecordingURL/${GROUP}`, transcript: `/groupChat/getRecordingTranscript/${GROUP}` })
    expect(playerUrls({ kind: "dm", id: `${ME} ${LEE}` }, ME)).toEqual({ media: `/dm/getRecordingURL/${LEE}`, transcript: `/dm/getRecordingTranscript/${LEE}` })
    expect(playerUrls({ kind: "dm", id: `${ME} ${LEE}` }, LEE).media).toBe(`/dm/getRecordingURL/${ME}`)
    // Notes to self: its other is you.
    expect(playerUrls({ kind: "dm", id: `${ME} ${ME}` }, ME).media).toBe(`/dm/getRecordingURL/${ME}`)
  })

  it("finds a recordings list row's conversation as the list always did: a channel, more than two people a group, else a DM", () => {
    const urls = (r: RecordingInfoInterface, self?: string) => playerUrls(refOfRecording(r), self)
    expect(urls(rec({ recording_channel: { ch_uuid: CH } as RecordingInfoInterface["recording_channel"] }), ME).media).toBe(`/ch/getRecordingURL/${CH}`)
    const dm = (people: string[], grouping = "") => rec({ recording_dm: { dm_participants: people.map(person), dm_grouping_id: grouping } as unknown as RecordingInfoInterface["recording_dm"] })
    expect(urls(dm([ME, LEE, ANN], GROUP), ME).transcript).toBe(`/groupChat/getRecordingTranscript/${GROUP}`)
    expect(urls(dm([ME, LEE]), ME).transcript).toBe(`/dm/getRecordingTranscript/${LEE}`)
    expect(urls(dm([ME]), ME).media).toBe(`/dm/getRecordingURL/${ME}`)
    // While the reader isn't known, the first person, as before.
    expect(urls(dm([LEE, ME])).media).toBe(`/dm/getRecordingURL/${LEE}`)
  })
})
