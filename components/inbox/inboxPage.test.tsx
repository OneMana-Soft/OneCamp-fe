import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { hueFor } from "@/lib/campHue"

vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
let ai = false
vi.mock("@/hooks/useClientConfig", () => ({ useAIAvailable: () => ai }))
vi.mock("@/services/connectorService", () => ({ startConnect: vi.fn() }))

let list: Promise<unknown> = new Promise(() => {})
let thread: Promise<unknown> = new Promise(() => {})
let replyFails = false
vi.mock("@/services/inboxService", async (orig) => ({
  ...(await orig<typeof import("@/services/inboxService")>()),
  getInbox: vi.fn(() => list),
  getInboxThread: vi.fn(() => thread),
  replyToThread: vi.fn(() => (replyFails ? Promise.reject(new Error("nope")) : Promise.resolve())),
  summarizeThread: vi.fn(() => new Promise(() => {})),
}))

import InboxPage from "@/components/inbox/InboxPage"

const today = new Date()
today.setHours(9, 5, 0, 0)
const row = (id: string, from: string, extra: object = {}) => ({ id, subject: "Contract", from, snippet: "Signed copy attached", date: today.toISOString(), unread: false, messages: 1, ...extra })
const msg = (id: string, from: string, body = "<p>Hello</p>") => ({ id, from, to: "sam@acme.test", date: today.toISOString(), subject: "Contract", body })

beforeEach(() => {
  list = new Promise(() => {})
  thread = new Promise(() => {})
  replyFails = false
  ai = false
})
afterEach(cleanup)

describe("Mail's frame (I1)", () => {
  it("has a 400px list and a 720px reading measure, with one header across both", async () => {
    list = Promise.resolve({ threads: [row("t1", "a@b.test")] })
    thread = Promise.resolve({ id: "t1", subject: "Contract", gmail_url: "https://mail.google.com/x", messages: [msg("m1", "a@b.test")] })
    render(<InboxPage />)
    await act(async () => {})
    expect(document.querySelector("[data-inbox-header]")!.className).toContain("h-[52px]")
    expect(document.querySelector("[data-inbox-list]")!.className).toContain("md:w-[400px]")
    fireEvent.click(screen.getByRole("button", { name: /a@b\.test/ }))
    await act(async () => {})
    expect(document.querySelector("[data-inbox-measure]")!.className).toContain("max-w-[720px]")
  })

  it("moves with J and K, opens with ↵ and goes back with Esc", async () => {
    list = Promise.resolve({ threads: [row("t1", "a@b.test"), row("t2", "c@d.test")] })
    thread = Promise.resolve({ id: "t2", subject: "Contract", gmail_url: "u", messages: [msg("m1", "c@d.test")] })
    render(<InboxPage />)
    await act(async () => {})
    fireEvent.keyDown(window, { key: "j" })
    fireEvent.keyDown(window, { key: "j" })
    const rows = document.querySelectorAll("[data-inbox-row]")
    expect(rows[1].hasAttribute("data-selected")).toBe(true)
    fireEvent.keyDown(window, { key: "Enter" })
    await act(async () => {})
    expect(screen.getByRole("button", { name: /c@d\.test/ }).getAttribute("aria-current")).toBe("true")
    fireEvent.keyDown(window, { key: "Escape" })
    expect(screen.getByText("Pick a conversation")).toBeTruthy()
  })

  it("focuses the search with /", async () => {
    list = Promise.resolve({ threads: [] })
    render(<InboxPage />)
    await act(async () => {})
    fireEvent.keyDown(window, { key: "/" })
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Search mail" }))
  })
})

describe("the list", () => {
  it("holds eight feed rows' shape while it loads, not a spinner", () => {
    render(<InboxPage />)
    const status = screen.getByRole("status", { name: "Loading your inbox" })
    expect(status.querySelectorAll("[data-hub-skeleton][data-density=feed]")).toHaveLength(8)
  })

  it("draws each conversation as a feed row: the sender in their colour, unread as a dot, today's mail by its time", async () => {
    list = Promise.resolve({ threads: [row("t1", '"Priya Sharma" <priya@acme.test>', { unread: true, messages: 2 })] })
    render(<InboxPage />)
    await act(async () => {})
    const r = document.querySelector("[data-inbox-row]")!
    expect(r.getAttribute("data-density")).toBe("feed")
    expect(r.querySelector("[data-hue]")?.getAttribute("data-hue")).toBe(hueFor('"Priya Sharma" <priya@acme.test>'))
    expect(r.querySelector(".hub-unread-dot")!.hasAttribute("data-read")).toBe(false)
    expect(r.textContent).toContain("9:05 AM")
    expect(r.textContent).toContain("Signed copy attached")
  })

  it("says Gmail is not answering, inline, with Try again", async () => {
    list = Promise.reject(new Error("boom"))
    render(<InboxPage />)
    await act(async () => {})
    const state = document.querySelector('[data-inbox-state="error"]')!
    expect(state.textContent).toContain("Gmail isn’t answering.")
    expect(state.textContent).toContain("Try again")
  })

  it("says a search found nothing, start-aligned, with Clear search", async () => {
    list = Promise.resolve({ threads: [] })
    render(<InboxPage />)
    await act(async () => {})
    fireEvent.change(screen.getByRole("textbox", { name: "Search mail" }), { target: { value: "invoice" } })
    fireEvent.submit(screen.getByRole("textbox", { name: "Search mail" }).closest("form")!)
    await act(async () => {})
    const state = document.querySelector('[data-inbox-state="search"]')!
    expect(state.className).toContain("items-start")
    expect(state.textContent).toContain("Nothing matches “invoice”")
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }))
    await act(async () => {})
    expect(screen.getByText("Inbox zero")).toBeTruthy()
  })
})

describe("inbox zero (I10)", () => {
  it("springs its check once and spends the day's one celebration", async () => {
    const celebrate = await import("@/lib/celebrate")
    const pop = vi.spyOn(celebrate, "springPop").mockReturnValue(null)
    const once = vi.spyOn(celebrate, "celebrateOnce").mockReturnValue(0)
    list = Promise.resolve({ threads: [] })
    render(<InboxPage />)
    await act(async () => {})
    expect(screen.getByText("Nothing new in Gmail. Back to the work.")).toBeTruthy()
    const spot = document.querySelector("[data-inbox-zero]")!
    expect(spot.querySelector("[data-hub-spot=inbox-zero]")).toBeTruthy()
    expect(pop).toHaveBeenCalledWith(spot)
    expect(once).toHaveBeenCalledWith("inbox-zero", spot, { count: 8 })
  })
})

describe("the reader", () => {
  it("opens with a skeleton in a message's shape and no box", async () => {
    list = Promise.resolve({ threads: [row("t1", "a@b.test")] })
    render(<InboxPage />)
    await act(async () => {})
    fireEvent.click(screen.getByRole("button", { name: /a@b\.test/ }))
    const status = screen.getByRole("status", { name: "Opening the conversation" })
    expect(status.className).not.toMatch(/border/)
    expect(screen.getByRole("button", { name: "Back to the inbox" }).className).toContain("size-11")
  })

  it("folds all but the last two of a long conversation, and opens one in place", async () => {
    list = Promise.resolve({ threads: [row("t1", "a@b.test")] })
    thread = Promise.resolve({
      id: "t1",
      subject: "Contract",
      gmail_url: "u",
      messages: [msg("m1", "Maya <m@x.test>"), msg("m2", "Sam <s@x.test>"), msg("m3", "Maya <m@x.test>"), msg("m4", "Sam <s@x.test>")],
    })
    render(<InboxPage />)
    await act(async () => {})
    fireEvent.click(screen.getByRole("button", { name: /a@b\.test/ }))
    await act(async () => {})
    expect(document.querySelectorAll("[data-inbox-folded]")).toHaveLength(2)
    expect(document.querySelectorAll("[data-inbox-message]")).toHaveLength(2)
    expect(screen.getByText("4 messages · Maya, Sam")).toBeTruthy()
    fireEvent.click(document.querySelector("[data-inbox-folded]")!)
    expect(document.querySelectorAll("[data-inbox-message]")).toHaveLength(3)
  })

  it("keeps a reply that failed in the box and says so above it, with Try again", async () => {
    list = Promise.resolve({ threads: [row("t1", "a@b.test")] })
    thread = Promise.resolve({ id: "t1", subject: "Contract", gmail_url: "u", messages: [msg("m1", "Maya <m@x.test>")] })
    replyFails = true
    render(<InboxPage />)
    await act(async () => {})
    fireEvent.click(screen.getByRole("button", { name: /a@b\.test/ }))
    await act(async () => {})
    const box = screen.getByRole("textbox", { name: "Reply" }) as HTMLTextAreaElement
    expect(box.placeholder).toBe("Reply to Maya…")
    fireEvent.change(box, { target: { value: "Thanks" } })
    fireEvent.click(screen.getByRole("button", { name: "Send reply" }))
    await act(async () => {})
    expect(screen.getByRole("alert").textContent).toContain("Try again")
    expect(box.value).toBe("Thanks")
  })

  it("offers no AI summary, in an edition without AI", async () => {
    ai = true
    list = Promise.resolve({ threads: [row("t1", "a@b.test")] })
    thread = Promise.resolve({ id: "t1", subject: "Contract", gmail_url: "u", messages: [msg("m1", "a@b.test"), msg("m2", "a@b.test")] })
    render(<InboxPage />)
    await act(async () => {})
    fireEvent.click(screen.getByRole("button", { name: /a@b\.test/ }))
    await act(async () => {})
    expect(document.querySelector("[data-inbox-thread-bar]")!.querySelector("button[title=\"Summarise (S)\"]")).toBeNull()
    expect(document.querySelector("[data-inbox-summary]")).toBeNull()
  })
})

describe("connecting (I2)", () => {
  it("asks to reconnect with the envelope's alert, in a 440px column, and says only you can see your mail", async () => {
    list = Promise.reject(Object.assign(new Error("409"), { response: { status: 409, data: { code: "reconnect" } } }))
    render(<InboxPage />)
    await act(async () => {})
    expect(document.querySelector("[data-hub-spot=reconnect]")).toBeTruthy()
    expect(document.querySelector("[data-inbox-connect]")!.className).toContain("max-w-[440px]")
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Reconnect Gmail")
    expect(screen.getByText("Only you can see your mail here.")).toBeTruthy()
  })
})
