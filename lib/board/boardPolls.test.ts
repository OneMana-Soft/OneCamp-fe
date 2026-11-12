// Polls on a slide (miro-28 to_win 4): which poll a slide shows, the live message that moves it, and the list kept
// as votes and closes come back. Pure.

import { describe, expect, it } from "vitest"
import { MqttMessageType } from "@/services/mqttService"
import { boardPollsUrl, guestBoardPollsPath, pollHeard, readPolls, slidePollOf, withPoll, type BoardPoll } from "@/lib/board/boardPolls"

const poll = (id: string, frame: string, patch: Partial<BoardPoll> = {}): BoardPoll => ({
  id, channel_uuid: "", question: `Q ${id}`, multiple: false, options: [{ id: "a", text: "A", votes: 0 }, { id: "b", text: "B", votes: 0 }],
  voters: 0, mine: [], closed: false, can_close: false, created_by: "", board_uuid: "b1", frame_id: frame, ...patch,
})

describe("a board's polls", () => {
  it("are read from the board's list, and a share link's guest from its own", () => {
    expect(boardPollsUrl("b 1")).toBe("/board/polls/b%201")
    expect(guestBoardPollsPath("t/1")).toBe("/guest/board-polls/t%2F1")
  })

  it("keeps only polls from an answer, and nothing from one that isn't a list", () => {
    expect(readPolls(undefined)).toEqual([])
    expect(readPolls({})).toEqual([])
    expect(readPolls([poll("p1", "f1"), null, { id: 3 }, "x"])).toEqual([poll("p1", "f1")])
  })

  it("shows a slide its frame's newest poll, and none for a frame without one", () => {
    const list = [poll("p1", "f1", { closed: true }), poll("p2", "f2"), poll("p3", "f1")]
    expect(slidePollOf(list, "f1")?.id).toBe("p3")
    expect(slidePollOf(list, "f2")?.id).toBe("p2")
    expect(slidePollOf(list, "f9")).toBeUndefined()
    expect(slidePollOf(undefined, "f1")).toBeUndefined()
    expect(slidePollOf(list, "")).toBeUndefined()
  })

  it("puts a poll that came back in its place, or at the end when it's new", () => {
    const list = [poll("p1", "f1"), poll("p2", "f2")]
    const voted = poll("p1", "f1", { voters: 1, mine: ["a"] })
    expect(withPoll(list, voted)).toEqual([voted, list[1]])
    expect(withPoll(list, poll("p3", "f1")).map((p) => p.id)).toEqual(["p1", "p2", "p3"])
    expect(withPoll(undefined, voted)).toEqual([voted])
  })

  it("hears MESSAGE_POLL_UPDATE (30) for this board only", () => {
    expect(MqttMessageType.Poll_Update).toBe(30)
    const said = (data: unknown, type = 30) => JSON.stringify({ type, data })
    expect(pollHeard(said({ type: 0, poll_uuid: "p1", board_uuid: "b1", frame_id: "f1" }), "b1")).toBe(true)
    expect(pollHeard(said({ type: 1, poll_uuid: "p1", board_uuid: "b1", frame_id: "f1" }), "b1")).toBe(true)
    expect(pollHeard(said({ type: 1, poll_uuid: "p1", board_uuid: "b2" }), "b1")).toBe(false)
    expect(pollHeard(said({ type: 1, poll_uuid: "p1", channel_uuid: "c1", board_uuid: "" }), "b1")).toBe(false)
    expect(pollHeard(said({ board_uuid: "b1" }, 29), "b1")).toBe(false)
    expect(pollHeard("not json", "b1")).toBe(false)
  })
})
