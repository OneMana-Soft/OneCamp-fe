// CALL-BUG-14 (AI edition): an in-call AI answer comes from the server, for
// the participant who asked. Any participant could once send an answer for
// any question id and replace OneCamp AI's words in everyone's panel.
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"

type Handler = (...args: unknown[]) => void
const handlers = new Set<Handler>()
const publishData = vi.fn(() => Promise.resolve())
const room = {
  state: "connected",
  localParticipant: { publishData },
  on: (_e: string, fn: Handler) => {
    handlers.add(fn)
    return room
  },
  off: (_e: string, fn: Handler) => {
    handlers.delete(fn)
    return room
  },
}
vi.mock("@livekit/components-react", () => ({
  useRoomContext: () => room,
  useLocalParticipant: () => ({ localParticipant: { identity: "sam", name: "Sam Rivera" } }),
}))
const authedStreamFetch = vi.fn()
vi.mock("@/lib/utils/streamFetch", () => ({ authedStreamFetch: (...a: unknown[]) => authedStreamFetch(...a) }))

import { useInCallAgent } from "./useInCallAgent"

const send = (msg: object, from?: { identity: string; name?: string }) =>
  act(async () => handlers.forEach((fn) => fn(new TextEncoder().encode(JSON.stringify(msg)), from, undefined, "oc.ai")))

afterEach(() => {
  cleanup()
  handlers.clear()
  vi.clearAllMocks()
})

describe("CALL-BUG-14: only the server answers, and only for the asker", () => {
  it("ignores an answer sent by a participant, or for someone else, and takes the server's", async () => {
    const { result } = renderHook(() => useInCallAgent("ch-1", () => ""))
    await send({ v: 1, t: "q", id: "q1", question: "What did we decide?", askedByName: "Maya" }, { identity: "maya", name: "Maya Chen" })
    expect(result.current.items[0]).toMatchObject({ id: "q1", askedByName: "Maya Chen", askerId: "maya", streaming: true })

    // Jonas, a participant, tries to put words in OneCamp AI's mouth.
    await send({ v: 1, t: "a", id: "q1", answer: "We approved the budget.", askedById: "maya" }, { identity: "jonas" })
    expect(result.current.items[0].answer).toBe("")
    // The server, but for another asker.
    await send({ v: 1, t: "a", id: "q1", answer: "Wrong question.", askedById: "jonas" })
    expect(result.current.items[0].answer).toBe("")
    // The server, for Maya.
    await send({ v: 1, t: "a", id: "q1", answer: "To ship on Friday.", askedById: "maya" })
    expect(result.current.items[0]).toMatchObject({ answer: "To ship on Friday.", streaming: false })
  })

  it("asks with the question's id, and never broadcasts an answer itself", async () => {
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('data: {"content":"Friday."}\n\ndata: {"done":true}\n\n'))
        c.close()
      },
    })
    authedStreamFetch.mockResolvedValueOnce({ ok: true, body })
    const { result } = renderHook(() => useInCallAgent("ch-1", () => "Maya: ship it"))
    await act(async () => {
      await result.current.ask("When do we ship?")
    })
    const id = result.current.items[0].id
    expect(authedStreamFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ jsonBody: expect.objectContaining({ question_id: id, room_id: "ch-1" }) }))
    expect(result.current.items[0]).toMatchObject({ answer: "Friday.", mine: true, streaming: false })
    const sent = (publishData.mock.calls as unknown as [Uint8Array][]).map(([b]) => JSON.parse(new TextDecoder().decode(b)))
    expect(sent.map((m) => m.t)).toEqual(["q"])
    // The server's copy of the asker's own answer changes nothing.
    await send({ v: 1, t: "a", id, answer: "Something else.", askedById: "sam" })
    expect(result.current.items[0].answer).toBe("Friday.")
  })
})

describe("an ask that fails (UX-CALLS-H2)", () => {
  const answered = () =>
    new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('data: {"content":"Jonas."}\n\ndata: {"done":true}\n\n'))
        c.close()
      },
    })

  it("says why in plain words, offline or a server fault, and Try again replaces the failed ask with a new one", async () => {
    authedStreamFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    authedStreamFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: "Internal Server Error", json: async () => ({ msg: "Failed to call model: dial tcp 10.0.0.4:11434" }) })
    authedStreamFetch.mockResolvedValueOnce({ ok: true, body: answered() })
    const { result } = renderHook(() => useInCallAgent("ch-1", () => ""))
    await act(async () => {
      await result.current.ask("Who writes the notes?")
    })
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].error).toBe("Couldn't reach the assistant. Check your connection and try again.")

    await act(async () => {
      await result.current.retry(result.current.items[0].id)
    })
    // The server's own text for a fault stays out of the panel.
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].error).toBe("The assistant couldn't answer just now. Try again in a moment.")

    await act(async () => {
      await result.current.retry(result.current.items[0].id)
    })
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0]).toMatchObject({ question: "Who writes the notes?", answer: "Jonas.", mine: true, streaming: false })
    expect(result.current.items[0].error).toBeUndefined()
    expect(authedStreamFetch).toHaveBeenCalledTimes(3)
  })

  it("keeps a refusal's own words, and retries only the asker's own failed ask", async () => {
    authedStreamFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: "Forbidden", json: async () => ({ msg: "You're not in this call." }) })
    const { result } = renderHook(() => useInCallAgent("ch-1", () => ""))
    await act(async () => {
      await result.current.ask("Who writes the notes?")
    })
    expect(result.current.items[0].error).toBe("You're not in this call.")
    // Someone else's question: nothing to retry.
    await send({ v: 1, t: "q", id: "q-maya", question: "And the date?", askedByName: "Maya Chen" }, { identity: "maya", name: "Maya Chen" })
    await act(async () => {
      await result.current.retry("q-maya")
    })
    expect(authedStreamFetch).toHaveBeenCalledTimes(1)
  })
})
