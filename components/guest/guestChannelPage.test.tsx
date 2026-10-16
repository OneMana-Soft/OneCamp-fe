import { Suspense } from "react"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { GuestChannelPage as Page } from "@/services/guestService"
import type { PublicResult } from "@/services/publicApi"

const getGuestChannel = vi.fn<(token: string, before?: string) => Promise<PublicResult<Page>>>()
const getGuestThread = vi.fn()
const postGuestMessage = vi.fn()
vi.mock("@/services/guestService", () => ({
  getGuestChannel: (token: string, before?: string) => getGuestChannel(token, before),
  getGuestThread: (token: string, postId: string) => getGuestThread(token, postId),
  postGuestMessage: (token: string, body: unknown) => postGuestMessage(token, body),
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
    expect(screen.queryByRole("heading", { name: "This shared channel doesn't exist or was deleted" })).not.toBeInTheDocument()

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
    expect(screen.getByRole("heading", { name: "This shared channel doesn't exist or was deleted" })).toBeInTheDocument()
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
    const nameBox = within(thread).getByRole("textbox", { name: "Your name, as the team will see it" })
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
    // "Load earlier" (design v3, admin §7 G3), a 28px ghost pill.
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Load earlier" })))
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load earlier messages. Try again.")
    expect(screen.getByRole("button", { name: "Load earlier" })).toBeEnabled()
  })
})

/**
 * Design v3 (admin §7 G3): a guest reads the channel in the app's own message
 * row, avatars and all, so a client sees the same material the team sees. The
 * name gate is the composer card, and becomes the composer in place. What a
 * guest sends shows at once, faded, until the server has it; a refusal stays
 * under it with Retry.
 */
describe("the guest channel in v3", () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it("gives every message an avatar in the author's hue, at 36px, with the body at 15/23", async () => {
    getGuestChannel.mockReset().mockResolvedValue({ ok: true, data: page })
    await open()
    const row = screen.getByText("Launch is Friday").closest("article")!
    const avatar = row.querySelector("[data-guest-avatar]")!
    expect(avatar).not.toBeNull()
    expect(avatar.className).toMatch(/\bsize-9\b/)
    expect(avatar.textContent).toBe("A")
    expect(screen.getByText("Launch is Friday").className).toMatch(/\btext-body\b/)
    expect(screen.getByText("Launch is Friday").className).toMatch(/max-w-\[760px\]/)
    // A day divider before the first message of the day.
    expect(screen.getAllByRole("separator").length).toBeGreaterThan(0)
  })

  it("morphs the name gate into the composer in the same card", async () => {
    getGuestChannel.mockReset().mockResolvedValue({ ok: true, data: { ...page, can_post: true } })
    await open()
    const card = document.querySelector("[data-guest-composer]")!
    expect(card).toHaveAttribute("data-guest-composer", "name")
    fireEvent.change(screen.getByRole("textbox", { name: "Your name, as the team will see it" }), { target: { value: "Jordan" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Continue" })))
    // The same card, now the composer, with the channel in its placeholder.
    expect(document.querySelector("[data-guest-composer]")).toBe(card)
    expect(card).toHaveAttribute("data-guest-composer", "compose")
    expect(screen.getByRole("textbox", { name: "Message #acme-launch" })).toHaveAttribute("placeholder", "Message #acme-launch")
    expect(screen.getByRole("button", { name: "Send" }).className).toMatch(/\bh-7\b/)
  })

  it("shows a sent message at once, faded, with the Guest tag, and says so when it didn't go", async () => {
    localStorage.setItem("oc_guest_name_tok", "Jordan")
    getGuestChannel.mockReset().mockResolvedValue({ ok: true, data: { ...page, can_post: true } })
    let answer: (v: unknown) => void = () => {}
    postGuestMessage.mockReset().mockImplementation(() => new Promise((r) => (answer = r)))
    await open()
    const box = screen.getByRole("textbox", { name: "Message #acme-launch" })
    fireEvent.change(box, { target: { value: "Looks great" } })
    await act(async () => fireEvent.keyDown(box, { key: "Enter" }))
    const row = screen.getByText("Looks great").closest("article")!
    expect(row).toHaveAttribute("data-pending", "true")
    expect(row.className).toMatch(/\bopacity-60\b/)
    expect(row.querySelector('[data-principal-tag="guest"]')).not.toBeNull()
    await act(async () => answer({ ok: false, status: 500, msg: "No" }))
    expect(screen.getByText("Looks great").closest("article")!.querySelector('[role="alert"]')).toHaveTextContent("Couldn't send. Retry")
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument()
  })
})
