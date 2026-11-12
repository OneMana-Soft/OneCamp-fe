// A board's polls while it's presented (miro-28 to_win 4): a member reads the board's list once and again on every
// MESSAGE_POLL_UPDATE the board's topic carries for it (a vote, a close, a poll started), so the tally moves without a
// reload; a share link's guest hears no MQTT and asks its own list every 5 s. A refused read says why; offline, the
// last list stays.

import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"

const net = vi.hoisted(() => ({ offline: false, topics: [] as string[], heard: undefined as undefined | ((m: string, t: string) => void), guest: vi.fn() }))
vi.mock("@/hooks/useMqttTopic", () => ({
  useMqttTopic: ({ topic, onMessage }: { topic: string; onMessage?: (m: string, t: string) => void }) => {
    net.topics.push(topic)
    net.heard = topic ? onMessage : undefined
  },
}))
vi.mock("@/lib/connectivity", () => ({ isAppOffline: () => net.offline, subscribeConnectivity: () => () => {} }))
// The guest's list is asked through the app's one guest poller (components/guest/guestPoll), with publicApi's own
// backoff (retryDelayMs); only the call is the test's.
vi.mock("@/services/publicApi", async (real) => ({ ...(await real<typeof import("@/services/publicApi")>()), publicCall: (...a: unknown[]) => net.guest(...a) }))

import { useSlidePolls } from "@/components/board/useSlidePolls"

const view = (votes: number) => ({
  id: "p1", channel_uuid: "", question: "Ship Friday?", multiple: false, options: [{ id: "y", text: "Yes", votes }, { id: "n", text: "No", votes: 0 }],
  voters: votes, mine: [], closed: false, can_close: false, created_by: "", board_uuid: "b1", frame_id: "f1",
})
const said = (board: string, type = 30) => JSON.stringify({ type, data: { type: 1, poll_uuid: "p1", board_uuid: board, frame_id: "f1" } })

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  net.offline = false
  net.topics = []
  net.heard = undefined
  net.guest.mockReset()
})

describe("a member's polls on a presented board", () => {
  it("reads the board's list, and reads it again on each poll message for this board, never for another", async () => {
    let votes = 0
    const http = { get: vi.fn(async () => ({ data: { data: [view(votes)] } })), post: vi.fn() }
    const { result } = renderHook(() => useSlidePolls({ board: "b1", http: http as never, topic: "boards/b1" }))
    await waitFor(() => expect(result.current.polls?.[0]?.voters).toBe(0))
    expect(http.get).toHaveBeenCalledWith("/board/polls/b1", { suppressErrorToast: true })
    expect(net.topics.at(-1)).toBe("boards/b1")

    votes = 2
    act(() => net.heard?.(said("b1"), "boards/b1"))
    await waitFor(() => expect(result.current.polls?.[0]?.voters).toBe(2))
    expect(http.get).toHaveBeenCalledTimes(2)

    act(() => net.heard?.(said("b2"), "boards/b1"))
    act(() => net.heard?.(said("b1", 29), "boards/b1"))
    await new Promise((r) => setTimeout(r, 20))
    expect(http.get).toHaveBeenCalledTimes(2)
  })

  it("says why a read was refused, and keeps the last list while offline", async () => {
    const http = { get: vi.fn(async () => Promise.reject({ response: { status: 404, data: { msg: "There's no such board." } } })), post: vi.fn() }
    const { result } = renderHook(() => useSlidePolls({ board: "b1", http: http as never, topic: "boards/b1" }))
    await waitFor(() => expect(result.current.state).toBe("failed"))
    expect(result.current.reason).toBe("There's no such board.")
    expect(result.current.polls).toBeUndefined()

    http.get.mockImplementation(async () => ({ data: { data: [view(1)] } }) as never)
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.state).toBe("ready"))
    net.offline = true
    http.get.mockImplementation(async () => Promise.reject(new Error("Network Error")))
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.state).toBe("offline"))
    expect(result.current.polls?.[0]?.voters).toBe(1)
  })

  it("puts a poll a vote, a close or a start sent back into the list at once", async () => {
    const http = { get: vi.fn(async () => ({ data: { data: [view(0)] } })), post: vi.fn() }
    const { result } = renderHook(() => useSlidePolls({ board: "b1", http: http as never, topic: "boards/b1" }))
    await waitFor(() => expect(result.current.polls).toHaveLength(1))
    act(() => result.current.put({ ...view(1), mine: ["y"] }))
    expect(result.current.polls?.[0]).toMatchObject({ voters: 1, mine: ["y"] })
  })
})

describe("a share link's guest's polls", () => {
  it("are its link's list, asked every 5 s, with no MQTT", async () => {
    vi.useFakeTimers()
    net.guest.mockResolvedValue({ ok: true, data: { polls: [view(1)], workspace_name: "Acme" } })
    const { result } = renderHook(() => useSlidePolls({ token: "tok" }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(net.guest).toHaveBeenCalledWith("/guest/board-polls/tok")
    expect(result.current.polls?.[0]?.voters).toBe(1)
    expect(net.topics.every((t) => t === "")).toBe(true)

    net.guest.mockResolvedValue({ ok: true, data: { polls: [view(3)], workspace_name: "Acme" } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(net.guest).toHaveBeenCalledTimes(2)
    expect(result.current.polls?.[0]?.voters).toBe(3)
  })

  it("asks through the app's one guest poller: never while the page is hidden, longer after each failure, and never before the server's Retry-After", async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, "random").mockReturnValue(0.5) // no spread: 5 s, 10 s, 20 s…
    const shown = (state: "visible" | "hidden") => Object.defineProperty(document, "visibilityState", { value: state, configurable: true })
    const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
    shown("visible")
    net.guest.mockResolvedValue({ ok: true, data: { polls: [view(1)], workspace_name: "Acme" } })
    renderHook(() => useSlidePolls({ token: "tok" }))
    await wait(10)
    expect(net.guest).toHaveBeenCalledTimes(1)
    // A hidden tab asks nothing on its turns, and asks again once it's shown.
    shown("hidden")
    await wait(15_000)
    expect(net.guest).toHaveBeenCalledTimes(1)
    shown("visible")
    await wait(5_000)
    expect(net.guest).toHaveBeenCalledTimes(2)
    // A server that's down: 5 s, then 10 s, then 20 s between asks.
    net.guest.mockResolvedValue({ ok: false, status: 503, msg: "" })
    await wait(5_000)
    expect(net.guest).toHaveBeenCalledTimes(3)
    await wait(5_000)
    expect(net.guest).toHaveBeenCalledTimes(4)
    await wait(9_000)
    expect(net.guest).toHaveBeenCalledTimes(4)
    await wait(1_000)
    expect(net.guest).toHaveBeenCalledTimes(5)
    // A busy one's Retry-After (the link's read limit): no ask before it, however short the backoff.
    net.guest.mockResolvedValue({ ok: false, status: 429, msg: "", retryAfter: 45 })
    await wait(20_000)
    expect(net.guest).toHaveBeenCalledTimes(6)
    await wait(44_000)
    expect(net.guest).toHaveBeenCalledTimes(6)
    await wait(1_000)
    expect(net.guest).toHaveBeenCalledTimes(7)
    vi.restoreAllMocks()
  })

  it("says a dead link's words", async () => {
    net.guest.mockResolvedValue({ ok: false, status: 404, msg: "This link was turned off." })
    const { result } = renderHook(() => useSlidePolls({ token: "tok" }))
    await waitFor(() => expect(result.current.state).toBe("failed"))
    expect(result.current.reason).toBe("This link was turned off.")
  })
})
