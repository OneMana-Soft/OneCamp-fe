import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { EventRecordings, readArtefacts } from "@/components/calendar/eventRecordings"
import { pinTestClock } from "@/lib/testing/testClock"

const ME = "0b6e5d4c-3b2a-4190-8f7e-6d5c4b3a2910"
const SAM = "1c7f6e5d-4c3b-4a21-9f8e-7d6c5b4a3021"
const LEE = "2d8a7f6e-5d4c-4b32-8a9f-8e7d6c5b4132"
const GROUP = "9f3c2b1a0e9d8c7b6a5f4e3d2c1b0a99"

afterEach(cleanup)
// The calls are past: the event is read two days after the newer one.
pinTestClock(new Date("2026-10-30T12:00:00Z"))

// meet-02, head C: an event's "Recordings & notes" list its calls as the
// calendar answers them (newest first, to whoever may read the event). A
// recorded call plays in the one player; one that wasn't is read there (C2);
// its notes open; the conversation its recap went to opens for whoever is in it.
describe("an event's Recordings & notes", () => {
  const body = {
    data: [
      { key: "EG_new", started_at: "2026-10-28T10:00:00Z", ended_at: "2026-10-28T10:42:00Z", lines: 120, notes_doc: "doc-1", recap_chat: GROUP, recorded: true },
      { key: "sess-old", started_at: "2026-10-21T10:00:00Z", ended_at: "2026-10-21T10:30:00Z", lines: 40, recap_chat: [SAM, ME].sort().join(" "), recorded: false },
    ],
  }

  it("plays a recorded call in the one player, by its key, with its words when it has some", () => {
    const onPlay = vi.fn()
    render(<EventRecordings body={body} selfUUID={ME} onPlay={onPlay} />)
    expect(screen.getByRole("region", { name: "Recordings & notes" })).toBeTruthy()
    const plays = screen.getAllByRole("button", { name: /play/i })
    expect(plays).toHaveLength(1) // a call with only a transcript has nothing to play
    fireEvent.click(plays[0])
    expect(onPlay).toHaveBeenCalledWith({ key: "EG_new", recorded: true, transcript: true })
  })

  // Head C2 (meet-02): a call that wasn't recorded still kept its words, and
  // they open in the same player, read by the event's own transcript route.
  it("reads a call that wasn't recorded in the same player, by its transcript", () => {
    const onPlay = vi.fn()
    render(<EventRecordings body={body} selfUUID={ME} onPlay={onPlay} />)
    const reads = screen.getAllByRole("button", { name: "Read transcript" })
    expect(reads).toHaveLength(1) // the recorded call plays, with its words beside it
    fireEvent.click(reads[0])
    expect(onPlay).toHaveBeenCalledWith({ key: "sess-old", recorded: false, transcript: true })
  })

  it("plays a recording with no words without asking for them, and offers nothing to read with none", () => {
    const onPlay = vi.fn()
    render(<EventRecordings body={{ data: [{ key: "EG_quiet", lines: 0, recorded: true }, { key: "sess-empty", lines: 0, recorded: false }] }} selfUUID={ME} onPlay={onPlay} />)
    expect(screen.queryAllByRole("button", { name: "Read transcript" })).toHaveLength(0)
    fireEvent.click(screen.getByRole("button", { name: "Play recording" }))
    expect(onPlay).toHaveBeenCalledWith({ key: "EG_quiet", recorded: true, transcript: false })
  })

  // DB-61's MUST 1 (head C's LIVE look): a link that leaves the event, its
  // notes or its conversation, tells the panel (onLeave), which closes, so
  // the page it opens isn't squeezed beside it. A new tab leaves nothing.
  it("tells the panel when its notes or its conversation leave the event, but not for a new tab", () => {
    const onLeave = vi.fn()
    // jsdom can't navigate: the links' own clicks go nowhere.
    const stay = (e: MouseEvent) => e.preventDefault()
    document.addEventListener("click", stay)
    try {
      render(<EventRecordings body={body} selfUUID={ME} onPlay={() => {}} onLeave={onLeave} />)
      fireEvent.click(screen.getByRole("link", { name: "Call notes" }))
      expect(onLeave).toHaveBeenCalledTimes(1)
      fireEvent.click(screen.getAllByRole("link", { name: "Conversation" })[0])
      expect(onLeave).toHaveBeenCalledTimes(2)
      fireEvent.click(screen.getAllByRole("link", { name: "Conversation" })[1], { ctrlKey: true })
      fireEvent.click(screen.getByRole("link", { name: "Call notes" }), { metaKey: true })
      expect(onLeave).toHaveBeenCalledTimes(2)
    } finally {
      document.removeEventListener("click", stay)
    }
  })

  it("links each call's notes and the conversation its recap went to", () => {
    render(<EventRecordings body={body} selfUUID={ME} onPlay={() => {}} />)
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"))
    expect(links).toEqual(["/app/doc/doc-1", `/app/chat/group/${GROUP}`, `/app/chat/${SAM}`])
  })

  it("never links a DM the reader isn't in", () => {
    render(<EventRecordings body={body} selfUUID={LEE} onPlay={() => {}} />)
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"))
    expect(links).toEqual(["/app/doc/doc-1", `/app/chat/group/${GROUP}`])
  })

  it("shows nothing when the event kept nothing, or its answer can't be read", () => {
    for (const b of [undefined, null, {}, { data: [] }, { data: "x" }, { data: [{ recorded: true }] }]) {
      const { container } = render(<EventRecordings body={b} selfUUID={ME} onPlay={() => {}} />)
      expect(container.innerHTML).toBe("")
      cleanup()
    }
  })

  it("says a transcript's length in words, one line as one", () => {
    render(<EventRecordings body={{ data: [{ key: "k1", lines: 1, recorded: false }, { key: "k2", lines: 2, recorded: false }] }} selfUUID={ME} onPlay={() => {}} />)
    expect(screen.getByText("Transcript, 1 line")).toBeTruthy()
    expect(screen.getByText("Transcript, 2 lines")).toBeTruthy()
  })

  // Follow-up 1: whoever may change the event deletes what a call made, its
  // recording and transcript (soft: the panel offers Undo). The list only
  // presents: it names what each Delete takes, and the panel asks the server.
  it("offers whoever may change the event a Delete on each call, naming what it takes", () => {
    const onDelete = vi.fn()
    render(<EventRecordings body={body} selfUUID={ME} onPlay={() => {}} onDelete={onDelete} />)
    const recording = screen.queryAllByRole("button", { name: "Delete recording" })
    const transcript = screen.queryAllByRole("button", { name: "Delete transcript" })
    expect([recording.length, transcript.length]).toEqual([1, 1])
    fireEvent.click(recording[0])
    expect(onDelete).toHaveBeenCalledWith({ key: "EG_new", what: "recording", label: expect.stringContaining("42 min") })
    fireEvent.click(transcript[0])
    expect(onDelete).toHaveBeenLastCalledWith({ key: "sess-old", what: "transcript", label: expect.stringContaining("30 min") })
  })

  it("offers no Delete to a reader who may only read the event", () => {
    render(<EventRecordings body={body} selfUUID={ME} onPlay={() => {}} />)
    expect(screen.queryAllByRole("button", { name: /delete/i })).toHaveLength(0)
  })

  it("reads only what is well formed", () => {
    expect(readArtefacts({ data: [{ key: "k", lines: "3", recorded: "yes", notes_doc: 7 }] })).toEqual([
      { key: "k", lines: 0, recorded: false },
    ])
  })
})
