import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactElement } from "react"
import { TooltipProvider } from "@/components/ui/tooltip"

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true, isTablet: false }) }))
vi.mock("@/components/later/SaveForLater", () => ({ SaveForLaterButton: () => null }))

const item = (id: string, title: string) => ({ id, item_type: "doc", item_id: `d-${id}`, link: `/app/doc/d-${id}`, title, context: "Docs", created_at: "2026-10-10T08:00:00Z" })
let items = [item("a", "Q4 launch plan"), item("b", "Launch sync notes")]
const done = vi.fn(async () => {})
const remove = vi.fn(async () => {})
vi.mock("@/hooks/useLater", () => ({
  useLaterList: () => ({ data: { data: { items, due: 0 } }, isLoading: false, isError: false, mutate: vi.fn() }),
  useLaterActions: () => ({ done, remove, save: vi.fn(), remind: vi.fn(), refresh: vi.fn() }),
}))
let lastToast: { title?: string; action?: ReactElement } | null = null
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: (t: typeof lastToast) => (lastToast = t) }) }))

import { LaterItems } from "@/components/later/LaterPage"

const mount = (state: "open" | "done") =>
  render(
    <TooltipProvider>
      <LaterItems state={state} />
    </TooltipProvider>,
  )

beforeEach(() => {
  items = [item("a", "Q4 launch plan"), item("b", "Launch sync notes")]
  done.mockClear()
  remove.mockClear()
  lastToast = null
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("Later", () => {
  // Marking done waited for the change and a refetch of both lists.
  it("takes a row away the moment it's marked done, and Undo puts it back", async () => {
    mount("open")
    fireEvent.click(screen.getAllByRole("button", { name: "Mark done" })[0])
    expect(screen.queryByText("Q4 launch plan")).toBeNull()
    expect(done).toHaveBeenCalledWith("a", true)
    render(lastToast!.action!)
    await act(async () => {
      fireEvent.click(screen.getByText("Undo"))
    })
    expect(done).toHaveBeenCalledWith("a", false)
    expect(screen.getByText("Q4 launch plan")).toBeTruthy()
  })

  it("removes behind an Undo, and an undone removal never reaches the server", async () => {
    vi.useFakeTimers()
    mount("done")
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0])
    expect(screen.queryByText("Q4 launch plan")).toBeNull()
    render(lastToast!.action!)
    fireEvent.click(screen.getByText("Undo"))
    expect(screen.getByText("Q4 launch plan")).toBeTruthy()
    await act(async () => {
      vi.advanceTimersByTime(10_000)
    })
    expect(remove).not.toHaveBeenCalled()
  })

  it("removes on the server once the Undo has gone", async () => {
    vi.useFakeTimers()
    mount("done")
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0])
    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })
    expect(remove).toHaveBeenCalledWith("a")
  })
})
