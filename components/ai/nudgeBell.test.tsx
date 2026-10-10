import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { configureStore } from "@reduxjs/toolkit"
import { Provider } from "react-redux"
import type { ReactElement } from "react"
import nudgeSlice from "@/store/slice/nudgeSlice"
import { TooltipProvider } from "@/components/ui/tooltip"

vi.mock("@/components/common/withFeature", () => ({ withAI: (C: React.ComponentType) => C }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true, isTablet: false }) }))

let pending: Promise<unknown> = new Promise(() => {})
const dismissAll = vi.fn(async () => {})
vi.mock("@/services/nudgeService", () => ({
  getNudges: vi.fn(() => pending),
  dismissNudge: vi.fn(async () => {}),
  dismissAllNudges: () => dismissAll(),
}))

// The toast's Undo is the thing under test: keep what was asked to be shown.
let lastToast: { title?: string; action?: ReactElement } | null = null
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: (t: typeof lastToast) => (lastToast = t) }) }))

import NudgeBell from "@/components/ai/NudgeBell"

const nudge = (id: string, title: string) => ({ id, title, body: "", kind: "generic", priority: 0, created_at: "2026-10-10T08:00:00Z", cta_url: "", cta_text: "" })

function mount() {
  const store = configureStore({ reducer: { nudge: nudgeSlice.reducer } })
  render(
    <Provider store={store}>
      <TooltipProvider>
        <NudgeBell />
      </TooltipProvider>
    </Provider>,
  )
  return store
}

const openBell = () => fireEvent.click(screen.getByRole("button", { name: "Nudges" }))

beforeEach(() => {
  lastToast = null
  dismissAll.mockClear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("the nudge bell", () => {
  it("doesn't say you're caught up before it has looked", () => {
    pending = new Promise(() => {})
    mount()
    openBell()
    expect(screen.getByRole("status", { name: "Loading nudges" })).toBeTruthy()
    expect(screen.queryByText("You're all caught up")).toBeNull()
  })

  it("brings everything back on Undo, and never tells the server", async () => {
    vi.useFakeTimers()
    pending = Promise.resolve({ nudges: [nudge("a", "Reply to Maya"), nudge("b", "Review the PR")], open_count: 2 })
    const store = mount()
    await act(async () => {})
    openBell()
    await act(async () => {})
    fireEvent.click(screen.getByRole("button", { name: /clear all/i }))
    expect(store.getState().nudge.nudges).toHaveLength(0)
    expect(lastToast?.title).toBe("Nudges cleared")

    render(lastToast!.action!)
    fireEvent.click(screen.getByText("Undo"))
    expect(store.getState().nudge.nudges.map((n) => n.id)).toEqual(["a", "b"])
    expect(store.getState().nudge.openCount).toBe(2)

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
    openBell()
    await act(async () => {})
    fireEvent.click(screen.getByRole("button", { name: /clear all/i }))
    expect(dismissAll).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })
    expect(dismissAll).toHaveBeenCalledTimes(1)
  })
})
