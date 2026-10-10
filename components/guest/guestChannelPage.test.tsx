import { Suspense } from "react"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { GuestChannelPage as Page } from "@/services/guestService"
import type { PublicResult } from "@/services/publicApi"

const getGuestChannel = vi.fn<(token: string, before?: string) => Promise<PublicResult<Page>>>()
const getGuestThread = vi.fn()
vi.mock("@/services/guestService", () => ({
  getGuestChannel: (token: string, before?: string) => getGuestChannel(token, before),
  getGuestThread: (token: string, postId: string) => getGuestThread(token, postId),
  postGuestMessage: vi.fn(),
}))

import GuestChannelPage from "@/app/guest/c/[token]/page"
import { GUEST_POLL_MS } from "./guestUi"

const page: Page = {
  channel: "acme-launch",
  can_post: false,
  has_more: false,
  messages: [{ id: "m1", author: "Ada", text: "Launch is Friday", created_at: "2026-10-09T10:00:00Z", reply_count: 0 }],
}
const fail = (status: number): PublicResult<Page> => ({ ok: false, status, msg: "" })

async function open() {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <GuestChannelPage params={Promise.resolve({ token: "tok" })} />
      </Suspense>,
    )
  })
}
const poll = () => act(() => vi.advanceTimersByTimeAsync(GUEST_POLL_MS))

describe("a shared channel whose server stops answering", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(Math, "random").mockReturnValue(0.5) // a retry waits exactly 5 s, then 10 s
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true })
    getGuestChannel.mockReset()
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("keeps the messages, says it's retrying, and carries on when the server is back", async () => {
    getGuestChannel.mockResolvedValueOnce({ ok: true, data: page }).mockResolvedValueOnce(fail(503)).mockResolvedValue({ ok: true, data: page })
    await open()
    expect(screen.getByText("Launch is Friday")).toBeInTheDocument()

    await poll()
    expect(screen.getByText("Launch is Friday")).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't reach the server, retrying…")
    expect(screen.queryByText("This link is no longer available")).not.toBeInTheDocument()

    await poll()
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("says so when the server is busy before the first answer", async () => {
    getGuestChannel.mockResolvedValueOnce(fail(429)).mockResolvedValue({ ok: true, data: page })
    await open()
    expect(screen.getByRole("status")).toHaveTextContent("Too many requests, wait a minute.")
    await poll()
    expect(screen.getByText("Launch is Friday")).toBeInTheDocument()
  })

  it("shows a dead link only when the link is gone", async () => {
    getGuestChannel.mockResolvedValueOnce({ ok: true, data: page }).mockResolvedValue(fail(404))
    await open()
    await poll()
    expect(screen.getByText("This link is no longer available")).toBeInTheDocument()
  })
})

describe("a guest who opens a thread before giving their name", () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it("is asked for it in the thread, which is all a phone shows", async () => {
    getGuestChannel.mockReset().mockResolvedValue({ ok: true, data: { ...page, can_post: true } })
    getGuestThread.mockReset().mockResolvedValue({ ok: true, data: { message: page.messages[0], replies: [] } })
    await open()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Reply" })))
    const thread = screen.getByRole("complementary")
    const nameBox = within(thread).getByRole("textbox", { name: "Your name" })
    expect(nameBox).toHaveAttribute("maxLength", "40")
    fireEvent.change(nameBox, { target: { value: "Priya" } })
    await act(async () => fireEvent.click(within(thread).getByRole("button", { name: "Continue" })))
    expect(within(thread).getByRole("textbox", { name: "Reply" })).toBeInTheDocument()
  })
})


describe("a guest channel whose server falters in the corners", () => {
  beforeEach(() => {
    getGuestChannel.mockReset()
    getGuestThread.mockReset()
  })
  afterEach(() => cleanup())

  it("says the thread can't load yet, instead of spinning", async () => {
    getGuestChannel.mockResolvedValue({ ok: true, data: page })
    getGuestThread.mockResolvedValue({ ok: false, status: 503, msg: "" })
    await open()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Open" })))
    const thread = screen.getByRole("complementary")
    expect(within(thread).getByRole("status")).toHaveTextContent("Couldn't reach the server, retrying…")
  })

  it("says so when earlier messages can't load, and offers the button again", async () => {
    getGuestChannel.mockImplementation(async (_t, before) =>
      before ? { ok: false, status: 503, msg: "" } : { ok: true, data: { ...page, has_more: true } },
    )
    await open()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Earlier messages" })))
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load earlier messages. Try again.")
    expect(screen.getByRole("button", { name: "Earlier messages" })).toBeEnabled()
  })
})
