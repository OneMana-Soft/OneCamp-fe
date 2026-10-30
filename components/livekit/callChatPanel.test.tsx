import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { CallThreadRead } from "@/lib/calls/callThread"

const readCallThread = vi.fn()
const writeInCallThread = vi.fn()
vi.mock("@/services/callThreadService", () => ({
  readCallThread: (...a: unknown[]) => readCallThread(...a),
  writeInCallThread: (...a: unknown[]) => writeInCallThread(...a),
}))

import CallChatPanel from "./CallChatPanel"

// The call's chat (CALLS-3b): what everyone in the call reads and writes, kept
// up to date while it's open on CHAT-LEAD-2's conditions for polling.

const at = (min: number) => new Date(Date.UTC(2026, 9, 22, 9, min)).toISOString()
const msg = (id: string, author: string, text: string, min: number) => ({ id, author, text, created_at: at(min) })
const chat = (o: Partial<CallThreadRead> = {}): CallThreadRead => ({
  post: msg("p1", "Maya Chen", "Maya Chen started a call", 0),
  replies: [],
  can_reply: true,
  latest: at(0),
  ...o,
})
const target = { sessionId: "s1" }
/** The names over each run of messages, in order. */
const authors = () => screen.getAllByText((_, el) => el?.hasAttribute("data-chat-author") ?? false).map((el) => el.textContent)
let visibility: DocumentVisibilityState = "visible"

beforeEach(() => {
  vi.useFakeTimers({ now: Date.UTC(2026, 9, 22, 9, 30) })
  visibility = "visible"
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility })
  readCallThread.mockReset()
  writeInCallThread.mockReset()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const open = async (props: Partial<Parameters<typeof CallChatPanel>[0]> = {}) => {
  await act(async () => {
    render(<CallChatPanel target={target} onClose={() => {}} {...props} />)
  })
}
const tick = async (ms = 5_000) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe("keeping the chat up to date", () => {
  it("reads it all as it opens, then polls with the last read's latest, and reads it all again every minute", async () => {
    readCallThread.mockResolvedValueOnce({ kind: "thread", thread: chat({ latest: at(3) }) })
    readCallThread.mockResolvedValue({ kind: "unchanged" })
    await open()
    expect(readCallThread).toHaveBeenNthCalledWith(1, target, undefined)
    await tick()
    expect(readCallThread).toHaveBeenNthCalledWith(2, target, at(3))
    await tick(10 * 5_000)
    expect(readCallThread).toHaveBeenCalledTimes(12)
    await tick()
    expect(readCallThread).toHaveBeenNthCalledWith(13, target, undefined)
  })

  it("asks only while the page is in view, and reads it all on coming back", async () => {
    readCallThread.mockResolvedValue({ kind: "thread", thread: chat() })
    await open()
    visibility = "hidden"
    await tick(30_000)
    expect(readCallThread).toHaveBeenCalledTimes(1)
    visibility = "visible"
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"))
    })
    expect(readCallThread).toHaveBeenCalledTimes(2)
    expect(readCallThread).toHaveBeenLastCalledWith(target, undefined)
  })

  it("stops asking once the chat is gone, and says so", async () => {
    readCallThread.mockResolvedValueOnce({ kind: "thread", thread: chat({ replies: [msg("r1", "Jonas Weber", "Thanks", 1)] }) })
    readCallThread.mockResolvedValueOnce({ kind: "missing" })
    await open()
    await tick()
    expect(screen.getByText("This call's chat has ended.")).toBeTruthy()
    // What was read stays to be read.
    expect(screen.getByText("Thanks")).toBeTruthy()
    expect(screen.queryByRole("textbox")).toBeNull()
    await tick(60_000)
    expect(readCallThread).toHaveBeenCalledTimes(2)
  })

  it("waits for a call's message not written yet: every poll for two minutes, then every 30 s, and never gives up", async () => {
    readCallThread.mockResolvedValue({ kind: "missing" })
    await open()
    expect(screen.getByText("The call's chat opens in a moment.")).toBeTruthy()
    // The first read, then a poll every 5 s for two minutes.
    await tick(115_000)
    expect(readCallThread).toHaveBeenCalledTimes(24)
    // Then every 30 s: the server's repair writes a missed message within about 90 s.
    await tick(60_000)
    expect(readCallThread).toHaveBeenCalledTimes(26)
    await tick(10 * 60_000)
    expect(readCallThread).toHaveBeenCalledTimes(46)
    readCallThread.mockResolvedValue({ kind: "thread", thread: chat() })
    await tick(30_000)
    expect(screen.getByText("No messages yet")).toBeTruthy()
  })

  it("asks at once when a member's app hears the call's state change while waiting", async () => {
    readCallThread.mockResolvedValueOnce({ kind: "missing" })
    readCallThread.mockResolvedValueOnce({ kind: "thread", thread: chat() })
    await open()
    await act(async () => {
      window.dispatchEvent(new CustomEvent("onecamp:call-state", { detail: { session: "another" } }))
    })
    expect(readCallThread).toHaveBeenCalledTimes(1)
    await act(async () => {
      window.dispatchEvent(new CustomEvent("onecamp:call-state", { detail: { session: "s1" } }))
    })
    expect(readCallThread).toHaveBeenCalledTimes(2)
    expect(screen.getByText("No messages yet")).toBeTruthy()
  })

  it("says a trouble that passes in its own words, and keeps asking", async () => {
    readCallThread.mockResolvedValueOnce({ kind: "thread", thread: chat() })
    readCallThread.mockResolvedValueOnce({ kind: "unreachable" })
    readCallThread.mockResolvedValueOnce({ kind: "busy" })
    readCallThread.mockResolvedValue({ kind: "unchanged" })
    await open()
    await tick()
    expect(screen.getByText("Couldn't reach the server, retrying…")).toBeTruthy()
    await tick()
    expect(screen.getByText("Too many requests, wait a minute.")).toBeTruthy()
    await tick()
    expect(screen.queryByRole("status", { name: /retrying|wait a minute/ })).toBeNull()
    expect(screen.queryByText("Too many requests, wait a minute.")).toBeNull()
  })

  it("stops for good when the chat isn't open to the reader, never saying it's retrying", async () => {
    readCallThread.mockResolvedValue({ kind: "refused" })
    await open({ target: { callToken: "tok" } })
    expect(screen.getByText("This call's chat isn't open to you.")).toBeTruthy()
    await tick(60_000)
    expect(readCallThread).toHaveBeenCalledTimes(1)
    expect(screen.queryByText("Couldn't reach the server, retrying…")).toBeNull()
  })

  it("reads the whole chat once on coming back to the page, not once for each event", async () => {
    let answer: (v: unknown) => void = () => {}
    readCallThread.mockResolvedValueOnce({ kind: "thread", thread: chat() })
    await open()
    readCallThread.mockImplementationOnce(() => new Promise((r) => (answer = r)))
    readCallThread.mockResolvedValue({ kind: "unchanged" })
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"))
      window.dispatchEvent(new Event("focus"))
    })
    await act(async () => answer({ kind: "unchanged" }))
    expect(readCallThread).toHaveBeenCalledTimes(2)
  })

  it("lets no answer for a call before land on the next one", async () => {
    let late: (v: unknown) => void = () => {}
    readCallThread.mockImplementationOnce(() => new Promise((r) => (late = r)))
    readCallThread.mockResolvedValueOnce({ kind: "thread", thread: chat({ post: msg("p2", "Jo Park", "Jo Park started a call", 0) }) })
    const { rerender } = render(<CallChatPanel target={{ sessionId: "s1" }} onClose={() => {}} />)
    await act(async () => {
      rerender(<CallChatPanel target={{ sessionId: "s2" }} onClose={() => {}} />)
    })
    await act(async () => late({ kind: "thread", thread: chat() }))
    expect(screen.getByText(/Jo Park started a call/)).toBeTruthy()
    expect(screen.queryByText(/Maya Chen started a call/)).toBeNull()
  })
})

describe("reading the chat", () => {
  it("starts with the call's message, then each run of messages under its writer's name", async () => {
    const replies = [
      { ...msg("r1", "Maya Chen", "Agenda's in the doc", 1), author_key: "k-maya" },
      { ...msg("r2", "Maya Chen", "Page 2 first", 2), author_key: "k-maya" },
      { ...msg("r3", "Gia", "Hi all", 3), guest: true },
    ]
    readCallThread.mockResolvedValue({ kind: "thread", thread: chat({ replies }) })
    await open()
    expect(screen.getByText(/Maya Chen started a call/)).toBeTruthy()
    expect(authors()).toEqual(["Maya Chen", "Gia"])
    expect(screen.getByRole("log").textContent).toContain("Page 2 first")
    // A guest is marked as the call's tiles mark them, not by "(guest)".
    const rows = document.querySelectorAll<HTMLElement>("[data-chat-message]")
    expect(within(rows[2]).getByText("Guest")).toBeTruthy()
    expect(within(rows[0]).queryByText("Guest")).toBeNull()
  })

  it("runs messages together by who wrote them, never by name: two guests called Guest are two people", async () => {
    const replies = [
      { ...msg("r1", "Guest", "Hello", 1), guest: true },
      { ...msg("r2", "Guest", "Hello from the other room", 2), guest: true },
      { ...msg("r3", "Alex Kim", "One", 3), author_key: "k-a" },
      { ...msg("r4", "Alex Kim", "Two", 4), author_key: "k-b" },
      { ...msg("r5", "Alex Kim", "Three", 5), author_key: "k-b" },
      { ...msg("r6", "Alex Kim", "Much later", 15), author_key: "k-b" },
    ]
    readCallThread.mockResolvedValue({ kind: "thread", thread: chat({ replies }) })
    await open()
    expect(authors()).toEqual(["Guest", "Guest", "Alex Kim", "Alex Kim", "Alex Kim"])
  })

  it("makes a web address a link, opened beside the call", async () => {
    readCallThread.mockResolvedValue({ kind: "thread", thread: chat({ replies: [msg("r1", "Jo Park", "Pricing draft: https://example.com/pricing?v=3, see page 2", 1)] }) })
    await open()
    const link = screen.getByRole("link", { name: "https://example.com/pricing?v=3" })
    expect(link.getAttribute("href")).toBe("https://example.com/pricing?v=3")
    // A long address is cut in the middle (MiddleName), never broken across lines.
    expect(link.querySelector("[data-middle-name]")?.getAttribute("title")).toBe("https://example.com/pricing?v=3")
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toBe("noopener noreferrer")
    expect(screen.getByRole("log").textContent).toContain("Pricing draft: https://example.com/pricing?v=3, see page 2")
  })

  it("says, before anyone writes, who reads the chat and that it stays", async () => {
    readCallThread.mockResolvedValue({ kind: "thread", thread: chat() })
    await open()
    expect(screen.getByText("No messages yet")).toBeTruthy()
    expect(screen.getByText("Everyone in the call reads this chat. It stays with the call, for the team to read later.")).toBeTruthy()
  })

  it("gives a member the conversation one tap away, and nobody else", async () => {
    readCallThread.mockResolvedValue({ kind: "thread", thread: chat() })
    const onOpen = vi.fn()
    await open({ conversation: { onOpen, open: false } })
    fireEvent.click(screen.getByRole("button", { name: "Open conversation" }))
    expect(onOpen).toHaveBeenCalled()
    cleanup()
    await open({ conversation: { onOpen, open: true } })
    expect(screen.queryByRole("button", { name: "Open conversation" })).toBeNull()
    cleanup()
    await open({ target: { callToken: "tok" } })
    expect(screen.queryByRole("button", { name: "Open conversation" })).toBeNull()
  })
})

describe("writing in the chat", () => {
  const field = () => screen.getByRole("textbox", { name: "Message everyone in the call" })

  it("keeps a half-written message while the panel is closed or shows something else", async () => {
    readCallThread.mockResolvedValue({ kind: "thread", thread: chat() })
    writeInCallThread.mockResolvedValue({ ok: true })
    await open({ target: { sessionId: "draft-1" } })
    fireEvent.change(field(), { target: { value: "Before I forget" } })
    cleanup()
    await open({ target: { sessionId: "draft-1" } })
    expect((field() as HTMLTextAreaElement).value).toBe("Before I forget")
    cleanup()
    // Another call's chat has its own.
    await open({ target: { sessionId: "draft-2" } })
    expect((field() as HTMLTextAreaElement).value).toBe("")
    cleanup()
    // Sent, it's gone from the draft too.
    await open({ target: { sessionId: "draft-1" } })
    await act(async () => {
      fireEvent.keyDown(field(), { key: "Enter" })
    })
    cleanup()
    await open({ target: { sessionId: "draft-1" } })
    expect((field() as HTMLTextAreaElement).value).toBe("")
  })

  it("counts characters as the server does, an emoji as one", async () => {
    readCallThread.mockResolvedValue({ kind: "thread", thread: chat() })
    await open({ target: { sessionId: "count" } })
    fireEvent.change(field(), { target: { value: "😀".repeat(3850) } })
    expect(screen.getByText("150 characters left")).toBeTruthy()
  })

  it("sends on Enter, never on Shift+Enter, then clears the field and reads the chat again", async () => {
    readCallThread.mockResolvedValue({ kind: "thread", thread: chat() })
    writeInCallThread.mockResolvedValue({ ok: true })
    await open()
    fireEvent.change(field(), { target: { value: "  On my way  " } })
    fireEvent.keyDown(field(), { key: "Enter", shiftKey: true })
    expect(writeInCallThread).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.keyDown(field(), { key: "Enter" })
    })
    expect(writeInCallThread).toHaveBeenCalledWith(target, "On my way")
    expect((field() as HTMLTextAreaElement).value).toBe("")
    expect(readCallThread).toHaveBeenLastCalledWith(target, undefined)
  })

  it("sends nothing empty, and says a refusal in the server's words", async () => {
    readCallThread.mockResolvedValue({ kind: "thread", thread: chat() })
    writeInCallThread.mockResolvedValue({ ok: false, msg: "Too many requests, wait a minute and try again.", readOnly: false, gone: false })
    await open()
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(field(), { target: { value: "hello" } })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }))
    })
    expect(screen.getByRole("alert").textContent).toBe("Too many requests, wait a minute and try again.")
    expect((field() as HTMLTextAreaElement).value).toBe("hello")
  })

  it("shows someone who may only read why there is no field", async () => {
    readCallThread.mockResolvedValue({ kind: "thread", thread: chat({ can_reply: false }) })
    await open({ target: { callToken: "tok" } })
    expect(screen.getByText("You can read this chat, not write in it.")).toBeTruthy()
    expect(screen.queryByRole("textbox")).toBeNull()
  })

  // meet-12: the people running the call hold its chat for everyone else.
  it("gives the field's place to why while chat is held, and keeps the draft for when everyone is let again", async () => {
    readCallThread.mockResolvedValue({ kind: "thread", thread: chat() })
    await open({ target: { sessionId: "held-1" } })
    fireEvent.change(field(), { target: { value: "Can I ask something?" } })
    cleanup()
    await open({ target: { sessionId: "held-1" }, held: true })
    expect(screen.getByText("The people running the call have turned off chat for now.")).toBeTruthy()
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.queryByText("You can read this chat, not write in it.")).toBeNull()
    cleanup()
    await open({ target: { sessionId: "held-1" } })
    expect((field() as HTMLTextAreaElement).value).toBe("Can I ask something?")
  })

  it("says the hold when the server refuses a write for it, never read-only", async () => {
    readCallThread.mockResolvedValue({ kind: "thread", thread: chat() })
    writeInCallThread.mockResolvedValue({ ok: false, msg: "The people running the call have turned off chat for now.", readOnly: false, held: true, gone: false })
    await open({ target: { sessionId: "held-2" } })
    fireEvent.change(field(), { target: { value: "hello" } })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }))
    })
    expect(screen.getByRole("alert").textContent).toBe("The people running the call have turned off chat for now.")
    expect(screen.queryByText("You can read this chat, not write in it.")).toBeNull()
    expect((field() as HTMLTextAreaElement).value).toBe("hello")
  })

  it("reads a chat read during a hold as writable once the hold is lifted", async () => {
    readCallThread.mockResolvedValue({ kind: "thread", thread: chat({ can_reply: false, chat_held: true }) })
    await open({ target: { sessionId: "held-3" } })
    expect(field()).toBeTruthy()
  })

  it("turns read-only when the server says so on a write", async () => {
    readCallThread.mockResolvedValue({ kind: "thread", thread: chat() })
    writeInCallThread.mockResolvedValue({ ok: false, msg: "You can read this call's chat, but not write in it.", readOnly: true, gone: false })
    await open()
    fireEvent.change(field(), { target: { value: "hello" } })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }))
    })
    expect(screen.getByText("You can read this chat, not write in it.")).toBeTruthy()
  })
})
