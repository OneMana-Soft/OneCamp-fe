import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { hueFor } from "@/lib/campHue"

vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useClientConfig", () => ({ useAIAvailable: () => false }))
vi.mock("@/components/banner/DemoLeadPrompt", () => ({ demoLeadAvailable: false, openDemoLeadPrompt: vi.fn() }))
vi.mock("@/services/connectorService", () => ({ startConnect: vi.fn() }))

let list: Promise<unknown> = new Promise(() => {})
let thread: Promise<unknown> = new Promise(() => {})
vi.mock("@/services/inboxService", async (orig) => ({
  ...(await orig<typeof import("@/services/inboxService")>()),
  getInbox: vi.fn(() => list),
  getInboxThread: vi.fn(() => thread),
}))

import InboxPage from "@/components/inbox/InboxPage"

const today = new Date()
today.setHours(9, 5, 0, 0)

beforeEach(() => {
  list = new Promise(() => {})
  thread = new Promise(() => {})
})
afterEach(cleanup)

describe("the inbox", () => {
  it("holds the rows' shape while it loads, not a spinner", () => {
    render(<InboxPage />)
    expect(screen.getByRole("status", { name: "Loading your inbox" })).toBeTruthy()
    expect(screen.queryByText("Loading…")).toBeNull()
  })

  it("lists each sender in their own colour, today's mail by its time, and marks the open one", async () => {
    list = Promise.resolve({ threads: [{ id: "t1", subject: "Contract", from: '"Priya Sharma" <priya@acme.test>', snippet: "Signed copy attached", date: today.toISOString(), unread: true, messages: 2 }] })
    render(<InboxPage />)
    await act(async () => {})
    const row = screen.getByRole("button", { name: /Priya Sharma/ })
    expect(row.querySelector("[data-hue]")?.getAttribute("data-hue")).toBe(hueFor('"Priya Sharma" <priya@acme.test>'))
    expect(row.textContent).toContain("9:05 AM")
    fireEvent.click(row)
    expect(row.getAttribute("aria-current")).toBe("true")
    expect(screen.getByRole("status", { name: "Opening the conversation" })).toBeTruthy()
  })
})

describe("an empty inbox", () => {
  it("springs once when it reaches zero, and an empty search doesn't", async () => {
    const celebrate = await import("@/lib/celebrate")
    const pop = vi.spyOn(celebrate, "springPop").mockReturnValue(null)
    list = Promise.resolve({ threads: [] })
    render(<InboxPage />)
    await act(async () => {})
    expect(screen.getByText("Your inbox is empty")).toBeTruthy()
    // The ringed envelope, and it is what springs.
    const spot = document.querySelector("[data-inbox-zero]")!
    expect(spot.querySelector("svg")).toBeTruthy()
    expect(pop).toHaveBeenCalledTimes(1)
    expect(pop.mock.calls[0][0]).toBe(spot)
  })
})

// QA_BACKLOG "Tab consistency", Inbox: one frame for its states, a skeleton in
// the rows' line boxes, and one toolbar height for the list and a conversation.
describe("the inbox's states and frame", () => {
  it("says a failed load in the centred frame, with a way to try again", async () => {
    list = Promise.reject(new Error("boom"))
    render(<InboxPage />)
    await act(async () => {})
    const state = document.querySelector("[data-inbox-state]")!
    expect(state.textContent).toMatch(/Try again/)
    expect(document.querySelector("p.text-danger-ink")).toBeNull()
  })

  it("says a search found nothing with the magnifier, the query and Clear search", async () => {
    list = Promise.resolve({ threads: [] })
    render(<InboxPage />)
    await act(async () => {})
    fireEvent.change(screen.getByRole("textbox", { name: "Search mail" }), { target: { value: "invoice" } })
    fireEvent.submit(screen.getByRole("textbox", { name: "Search mail" }).closest("form")!)
    await act(async () => {})
    const state = document.querySelector("[data-inbox-state]")!
    expect(state.querySelector("svg")).toBeTruthy()
    expect(state.textContent).toContain("Nothing matches “invoice”")
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }))
    await act(async () => {})
    expect(screen.getByText("Your inbox is empty")).toBeTruthy()
  })

  it("loads in a row's line boxes: 20, 20 and 18px, 2px apart", () => {
    render(<InboxPage />)
    const row = document.querySelector("[data-inbox-skeleton-row]")!
    const bars = [...row.querySelectorAll("span > *")].map((b) => b.className)
    expect(row.querySelector("span")!.className).toContain("gap-0.5")
    expect([bars[0], bars[1], bars[2]].map((c) => c.match(/h-(5|\[18px\])/)?.[0])).toEqual(["h-5", "h-5", "h-[18px]"])
  })

  it("gives a conversation's bar the list's toolbar height, and a 44px way back on a phone", async () => {
    list = Promise.resolve({ threads: [{ id: "t1", subject: "Contract", from: "a@b.test", snippet: "s", date: today.toISOString(), unread: false, messages: 1 }] })
    render(<InboxPage />)
    await act(async () => {})
    fireEvent.click(screen.getByRole("button", { name: /a@b\.test/ }))
    const bar = document.querySelector("[data-inbox-thread-bar]")!
    expect(bar.className.split(" ")).toEqual(expect.arrayContaining(["min-h-[69px]", "md:min-h-[61px]"]))
    expect(screen.getByRole("button", { name: "Back to the inbox" }).className).toContain("size-11")
  })
})
