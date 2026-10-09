import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GuestNotYet, useGuestAnswer, useGuestPoll, type GuestPollOutcome } from "./guestUi"
import type { PublicResult } from "@/services/publicApi"

function Page({ ask }: { ask: () => Promise<PublicResult<string>> }) {
  const { data, trouble } = useGuestAnswer("link", ask)
  return data ? <p>{data}</p> : <GuestNotYet trouble={trouble} loading={<p>Loading</p>} />
}

function Poller({ tick, every }: { tick: (first: boolean) => Promise<GuestPollOutcome>; every: number }) {
  useGuestPoll("link", every, tick)
  return null
}

const fail = (status: number, retryAfter?: number): PublicResult<string> => ({ ok: false, status, msg: "", retryAfter })
const flush = () => act(async () => {})
const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

describe("a guest page that can't load yet", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(Math, "random").mockReturnValue(0.5) // no spread: 5 s, 10 s, 20 s…
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true })
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("says the server couldn't be reached, asks again less and less often, and loads once it answers", async () => {
    const ask = vi.fn<() => Promise<PublicResult<string>>>()
      .mockResolvedValueOnce(fail(503))
      .mockResolvedValueOnce(fail(0))
      .mockResolvedValueOnce(fail(502))
      .mockResolvedValueOnce({ ok: true, data: "The launch plan" })
    render(<Page ask={ask} />)
    await flush()
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't reach the server, retrying…")
    expect(screen.queryByText("This link is no longer available")).not.toBeInTheDocument()

    await wait(5_000)
    expect(ask).toHaveBeenCalledTimes(2)
    await wait(9_999)
    expect(ask).toHaveBeenCalledTimes(2) // the second wait is ten seconds
    await wait(1)
    expect(ask).toHaveBeenCalledTimes(3)
    await wait(20_000)
    expect(screen.getByText("The launch plan")).toBeInTheDocument()
    expect(ask).toHaveBeenCalledTimes(4)
  })

  it("waits as long as the server's Retry-After says", async () => {
    const ask = vi.fn<() => Promise<PublicResult<string>>>()
      .mockResolvedValueOnce(fail(429, 90))
      .mockResolvedValueOnce({ ok: true, data: "The launch plan" })
    render(<Page ask={ask} />)
    await flush()
    expect(screen.getByRole("status")).toHaveTextContent("Too many requests, wait a minute.")
    await wait(89_000)
    expect(ask).toHaveBeenCalledTimes(1)
    await wait(1_000)
    expect(screen.getByText("The launch plan")).toBeInTheDocument()
  })

  it("gives up on a dead link", async () => {
    const ask = vi.fn<() => Promise<PublicResult<string>>>().mockResolvedValue(fail(404))
    render(<Page ask={ask} />)
    await flush()
    expect(screen.getByText("This link is no longer available")).toBeInTheDocument()
    await wait(300_000)
    expect(ask).toHaveBeenCalledTimes(1)
  })
})

describe("a guest page keeping itself up to date", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(Math, "random").mockReturnValue(0.5)
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true })
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("polls at its pace, backs off while the server fails, and returns to its pace", async () => {
    const tick = vi.fn<(first: boolean) => Promise<GuestPollOutcome>>()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false, retryAfter: 120 })
      .mockResolvedValue({ ok: true })
    render(<Poller tick={tick} every={5_000} />)
    await flush()
    expect(tick).toHaveBeenNthCalledWith(1, true)
    await wait(5_000) // the pace: a failure
    await wait(5_000) // first wait: 5 s
    expect(tick).toHaveBeenCalledTimes(3)
    await wait(10_000) // second: 10 s, and the server asks for two minutes
    expect(tick).toHaveBeenCalledTimes(4)
    await wait(119_000)
    expect(tick).toHaveBeenCalledTimes(4)
    await wait(1_000)
    expect(tick).toHaveBeenCalledTimes(5)
    await wait(5_000) // back to its pace
    expect(tick).toHaveBeenCalledTimes(6)
    expect(tick).toHaveBeenLastCalledWith(false)
  })

  it("skips its turns while the page is hidden", async () => {
    const tick = vi.fn<(first: boolean) => Promise<GuestPollOutcome>>().mockResolvedValue({ ok: true })
    render(<Poller tick={tick} every={5_000} />)
    await flush()
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true })
    await wait(20_000)
    expect(tick).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true })
    await wait(5_000)
    expect(tick).toHaveBeenCalledTimes(2)
  })
})
