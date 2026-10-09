import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GUEST_BUSY_RETRY_MS, GUEST_POLL_MS, GuestNotYet, useGuestAnswer } from "./guestUi"
import type { PublicResult } from "@/services/publicApi"

function Page({ ask }: { ask: () => Promise<PublicResult<string>> }) {
  const { data, trouble } = useGuestAnswer("link", ask)
  return data ? <p>{data}</p> : <GuestNotYet trouble={trouble} loading={<p>Loading</p>} />
}

const fail = (status: number): PublicResult<string> => ({ ok: false, status, msg: "" })
const flush = () => act(async () => {})

describe("a guest page that can't load yet", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("says the server couldn't be reached, and loads once it answers", async () => {
    const ask = vi.fn<() => Promise<PublicResult<string>>>()
      .mockResolvedValueOnce(fail(503))
      .mockResolvedValueOnce(fail(0))
      .mockResolvedValueOnce({ ok: true, data: "The launch plan" })
    render(<Page ask={ask} />)
    await flush()
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't reach the server, retrying…")
    expect(screen.queryByText("This link is no longer available")).not.toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(GUEST_POLL_MS))
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't reach the server, retrying…")
    await act(() => vi.advanceTimersByTimeAsync(GUEST_POLL_MS))
    expect(screen.getByText("The launch plan")).toBeInTheDocument()
    expect(ask).toHaveBeenCalledTimes(3)
  })

  it("waits a minute after too many requests", async () => {
    const ask = vi.fn<() => Promise<PublicResult<string>>>()
      .mockResolvedValueOnce(fail(429))
      .mockResolvedValueOnce({ ok: true, data: "The launch plan" })
    render(<Page ask={ask} />)
    await flush()
    expect(screen.getByRole("status")).toHaveTextContent("Too many requests, wait a minute.")
    await act(() => vi.advanceTimersByTimeAsync(GUEST_POLL_MS))
    expect(ask).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(GUEST_BUSY_RETRY_MS))
    expect(screen.getByText("The launch plan")).toBeInTheDocument()
  })

  it("gives up on a dead link", async () => {
    const ask = vi.fn<() => Promise<PublicResult<string>>>().mockResolvedValue(fail(404))
    render(<Page ask={ask} />)
    await flush()
    expect(screen.getByText("This link is no longer available")).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(GUEST_BUSY_RETRY_MS * 2))
    expect(ask).toHaveBeenCalledTimes(1)
  })
})
