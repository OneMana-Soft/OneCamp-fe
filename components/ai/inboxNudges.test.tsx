import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { configureStore } from "@reduxjs/toolkit"
import { Provider } from "react-redux"
import type { ReactElement } from "react"
import nudgeSlice from "@/store/slice/nudgeSlice"

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

const nudge = (id: string, title: string, priority = 0) => ({ id, title, body: "", kind: "generic", priority, created_at: "2026-10-10T08:00:00Z", cta_url: `/app/task/${id}`, cta_text: "" })

function mount() {
  const store = configureStore({ reducer: { nudge: nudgeSlice.reducer } })
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
  it("shows a skeleton before it has looked, never a promise", () => {
    pending = new Promise(() => {})
    mount()
    expect(screen.getByRole("status", { name: "Loading nudges" })).toBeTruthy()
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
