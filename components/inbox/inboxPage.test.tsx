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
