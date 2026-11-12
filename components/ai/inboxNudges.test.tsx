import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { configureStore } from "@reduxjs/toolkit"
import { Provider } from "react-redux"
import type { ReactElement } from "react"
import nudgeSlice, { setNudges } from "@/store/slice/nudgeSlice"
import messageResyncSlice, { triggerMessageCatchUp } from "@/store/slice/messageResyncSlice"
import type { Nudge } from "@/services/nudgeService"

// Nudges are the "From OneCamp AI" group at the top of Inbox (design v3,
// shell N1); the bell that held them is retired.

vi.mock("@/components/common/withFeature", () => ({ withAI: (C: React.ComponentType) => C }))
const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))

let pending: Promise<unknown> = new Promise(() => {})
const dismissAll = vi.fn(async () => {})
vi.mock("@/services/nudgeService", () => ({
  getNudges: vi.fn(() => pending),
  dismissNudge: vi.fn(async () => {}),
  dismissAllNudges: () => dismissAll(),
}))

let lastToast: { title?: string; action?: ReactElement } | null = null
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: (t: typeof lastToast) => (lastToast = t) }) }))

import InboxNudges from "@/components/ai/InboxNudges"

const nudge = (id: string, title: string, priority = 0, unread?: boolean) => ({ id, title, body: "", kind: "generic", priority, created_at: "2026-10-10T08:00:00Z", cta_url: `/app/task/${id}`, cta_text: "", ...(unread === undefined ? {} : { unread }) })

function mount() {
  const store = configureStore({ reducer: { nudge: nudgeSlice.reducer, messageResync: messageResyncSlice.reducer } })
  render(
    <Provider store={store}>
      <InboxNudges />
    </Provider>,
  )
  return store
}

beforeEach(() => {
  lastToast = null
  dismissAll.mockClear()
  push.mockClear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("Inbox's From OneCamp AI group", () => {
  // The group sits atop All now, where the Inbox opens (V-577), and most
  // people have no nudges: nothing at all until it has looked, so no header
  // and skeleton flash in and out above the feed on every first open.
  it("draws nothing before it has looked, so nothing flashes in and out atop All", () => {
    pending = new Promise(() => {})
    mount()
    expect(screen.queryByRole("region", { name: "From OneCamp AI" })).toBeNull()
    expect(screen.queryByRole("status", { name: "Loading nudges" })).toBeNull()
  })

  it("lists each nudge with the agent's square, and opens what it is about", async () => {
    pending = Promise.resolve({ nudges: [nudge("a", "Reply to Maya", 1), nudge("b", "Review the PR")], open_count: 2 })
    mount()
    await act(async () => {})
    expect(screen.getByRole("region", { name: "From OneCamp AI" })).toBeTruthy()
    expect(document.querySelectorAll("[data-agent-avatar]")).toHaveLength(2)
    expect(document.querySelector('[data-urgent="true"]')?.textContent).toMatch(/Reply to Maya/)
    fireEvent.click(screen.getByText("Review the PR"))
    expect(push).toHaveBeenCalledWith("/app/task/b")
  })

  // V-577: the Inbox badge counts an urgent nudge raised since the last look
  // (the server marks it `unread`), so the group draws it as the feed draws
  // what it counts: a dot, and none on one from before the look or one that
  // isn't urgent. Each has its Dismiss.
  it("draws a dot on each nudge the badge counts, by the server's mark, and a Dismiss on each", async () => {
    pending = Promise.resolve({
      nudges: [nudge("a", "Overdue commitment", 1, true), nudge("b", "Overdue since June", 1, false), nudge("c", "Review the PR", 0, false)],
      open_count: 3,
    })
    mount()
    await act(async () => {})
    const row = (title: string) => screen.getByText(title).closest("li")!
    expect(row("Overdue commitment").hasAttribute("data-unread")).toBe(true)
    expect(row("Overdue commitment").querySelector(".hub-unread-dot")?.hasAttribute("data-read")).toBe(false)
    expect(row("Overdue since June").hasAttribute("data-unread")).toBe(false)
    expect(row("Review the PR").hasAttribute("data-unread")).toBe(false)
    expect(screen.getAllByRole("button", { name: "Dismiss" })).toHaveLength(3)
  })

  // A row is a button, and its name was all of its text, Dismiss included:
  // a screen reader heard "Overdue commitment Dismiss You said..." for each
  // row atop All, and a search for Dismiss found every row beside its
  // button. The row's name is its title, its body describes it, and Dismiss
  // names one button per row (V-577).
  it("names each row by its title alone and describes it by its body, so Dismiss names only its button", async () => {
    const body = "You said you'd send the launch checklist by Monday."
    pending = Promise.resolve({ nudges: [{ ...nudge("a", "Overdue commitment", 1, true), body }, nudge("b", "Review the PR")], open_count: 2 })
    mount()
    await act(async () => {})
    const counted = screen.getByRole("button", { name: "Overdue commitment" })
    expect(counted.tagName).toBe("LI")
    expect(counted).toHaveAccessibleDescription(body)
    expect(screen.getByRole("button", { name: "Review the PR" }).tagName).toBe("LI")
    expect(screen.getByRole("button", { name: "Review the PR" })).toHaveAccessibleDescription("")
    expect(screen.getAllByRole("button", { name: /dismiss/i }).map((b) => b.tagName)).toEqual(["BUTTON", "BUTTON"])
  })

  // Opening the Inbox moves the last look, so a read after it marks nothing
  // unread (a tab switch remounts the group). What the badge counted keeps its
  // dot until it is opened, as the feed's rows do (CR-B10 M1).
  it("keeps a counted nudge's dot when the list is read again after the look, until it is opened", async () => {
    pending = Promise.resolve({ nudges: [nudge("a", "Overdue commitment", 1, true)], open_count: 1 })
    const store = mount()
    await act(async () => {})
    act(() => void store.dispatch(setNudges({ nudges: [nudge("a", "Overdue commitment", 1, false) as Nudge], openCount: 1 })))
    const row = () => screen.getByText("Overdue commitment").closest("li")!
    expect(row().hasAttribute("data-unread")).toBe(true)
    fireEvent.click(row())
    expect(push).toHaveBeenCalledWith("/app/task/a")
    expect(row().hasAttribute("data-unread")).toBe(false)
  })

  // A list read before the live connection's subscriptions were answered (a
  // reload, a cold open, a dropped connection) misses a nudge event sent in
  // between: it reached no one, and the row stayed until the next reload
  // (V-577). Each time the connection is live again (RealtimeEngine's
  // onSubscribed, on the first connection and on every reconnect), the list
  // is read again.
  it("reads its list again each time the live connection is back, so what changed in the gap shows", async () => {
    pending = Promise.resolve({ nudges: [nudge("a", "Overdue commitment", 1, true), nudge("c", "Still waiting on an answer?")], open_count: 2 })
    const store = mount()
    await act(async () => {})
    expect(screen.getByText("Still waiting on an answer?")).toBeTruthy()

    // Cleared before the first subscription was answered: its event reached no one.
    pending = Promise.resolve({ nudges: [nudge("a", "Overdue commitment", 1, true)], open_count: 1 })
    await act(async () => void store.dispatch(triggerMessageCatchUp()))
    expect(screen.queryByText("Still waiting on an answer?")).toBeNull()
    expect(store.getState().nudge.openCount).toBe(1)

    // A reconnect: one raised while the connection was down is listed.
    pending = Promise.resolve({ nudges: [nudge("n", "Reply to Maya", 1, true), nudge("a", "Overdue commitment", 1, true)], open_count: 2 })
    await act(async () => void store.dispatch(triggerMessageCatchUp()))
    expect(screen.getByText("Reply to Maya")).toBeTruthy()
    expect(store.getState().nudge.openCount).toBe(2)
  })

  it("brings everything back on Undo, and never tells the server", async () => {
    vi.useFakeTimers()
    pending = Promise.resolve({ nudges: [nudge("a", "Reply to Maya"), nudge("b", "Review the PR")], open_count: 2 })
    const store = mount()
    await act(async () => {})
    fireEvent.click(screen.getByRole("button", { name: /clear all/i }))
    expect(store.getState().nudge.nudges).toHaveLength(0)
    expect(lastToast?.title).toBe("Nudges cleared")
    render(lastToast!.action!)
    fireEvent.click(screen.getByText("Undo"))
    expect(store.getState().nudge.nudges.map((n) => n.id)).toEqual(["a", "b"])
    await act(async () => {
      vi.advanceTimersByTime(10_000)
    })
    expect(dismissAll).not.toHaveBeenCalled()
  })

  it("clears them on the server once the Undo has gone", async () => {
    vi.useFakeTimers()
    pending = Promise.resolve({ nudges: [nudge("a", "Reply to Maya")], open_count: 1 })
    mount()
    await act(async () => {})
    fireEvent.click(screen.getByRole("button", { name: /clear all/i }))
    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })
    expect(dismissAll).toHaveBeenCalledTimes(1)
  })

  it("says nothing at all when there are none", async () => {
    pending = Promise.resolve({ nudges: [], open_count: 0 })
    mount()
    await act(async () => {})
    expect(screen.queryByRole("region", { name: "From OneCamp AI" })).toBeNull()
  })
})
