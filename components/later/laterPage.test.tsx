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
const dismissed = vi.fn()
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: (t: typeof lastToast) => {
      lastToast = t
      return { id: "t", dismiss: dismissed, update: vi.fn() }
    },
  }),
}))

import { LaterItems } from "@/components/later/LaterPage"

const mount = (state: "open" | "done") =>
  render(
    <TooltipProvider>
      <LaterItems state={state} />
    </TooltipProvider>,
  )

beforeEach(() => {
  items = [item("a", "Q4 launch plan"), item("b", "Launch sync notes")]
  done.mockReset()
  done.mockImplementation(async () => {})
  remove.mockClear()
  dismissed.mockClear()
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

  // A refusal came back before the row's exit ended, which then hid the row
  // for good, under a toast saying it was done (QA F-12).
  it("brings a row back when the server refuses to mark it done, and takes back 'Marked done'", async () => {
    let refuse!: (e: unknown) => void
    done.mockImplementation(() => new Promise((_, reject) => (refuse = reject)))
    mount("open")
    fireEvent.click(screen.getAllByRole("button", { name: "Mark done" })[0])
    expect(lastToast?.title).toBe("Marked done")
    await act(async () => {
      refuse(Object.assign(new Error("Request failed with status code 500"), { response: { status: 500 } }))
    })
    expect(screen.getByText("Q4 launch plan")).toBeTruthy()
    expect(dismissed).toHaveBeenCalled()
  })

  // The request says a refused Undo itself (the request layer's toast), and
  // nothing is left unhandled: the toast's button discarded the promise.
  it("leaves nothing unhandled when the server refuses the Undo", async () => {
    done.mockImplementation(async (...args: unknown[]) => {
      if (args[1] === false) throw Object.assign(new Error("Request failed with status code 500"), { response: { status: 500 } })
    })
    const unhandled: unknown[] = []
    const note = (e: unknown) => unhandled.push(e)
    process.on("unhandledRejection", note)
    try {
      mount("open")
      fireEvent.click(screen.getAllByRole("button", { name: "Mark done" })[0])
      render(lastToast!.action!)
      await act(async () => {
        fireEvent.click(screen.getByText("Undo"))
      })
      await act(() => new Promise((r) => setTimeout(r, 0)))
    } finally {
      process.off("unhandledRejection", note)
    }
    expect(done).toHaveBeenCalledWith("a", false)
    expect(unhandled).toEqual([])
  })

  it("keeps a row back when the refusal arrives while it is still on its way out", async () => {
    vi.useFakeTimers()
    const motion = await import("@/lib/celebrate")
    const still = vi.spyOn(motion, "prefersReducedMotion").mockReturnValue(false)
    let refuse!: (e: unknown) => void
    done.mockImplementation(() => new Promise((_, reject) => (refuse = reject)))
    mount("open")
    fireEvent.click(screen.getAllByRole("button", { name: "Mark done" })[0])
    await act(async () => {
      refuse(new Error("refused"))
    })
    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })
    expect(screen.getByText("Q4 launch plan")).toBeTruthy()
    still.mockRestore()
  })

  // One row without the fields it expected took the whole page down (QA F-13).
  it("draws the rest when one row can't be drawn", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {})
    items = [{ id: "bad", title: "Broken", remind_at: "not a date" } as never, item("b", "Launch sync notes")]
    mount("open")
    expect(screen.getByText("This item couldn't be shown")).toBeTruthy()
    expect(screen.getByText("Launch sync notes")).toBeTruthy()
    quiet.mockRestore()
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

describe("Later, empty", () => {
  it("shows a small spot above its words", () => {
    items = []
    const { container } = mount("open")
    expect(screen.getByText("Nothing saved for later")).toBeTruthy()
    expect(container.querySelector("svg")).toBeTruthy()
  })
})

// CAL-BUG-6: "Remind me" from the assistant is a Later reminder now, drawn
// with a bell rather than the bookmark of a thing saved.
describe("a reminder in Later", () => {
  it("leads with a bell", () => {
    items = [{ ...item("r", "Call the bank"), item_type: "reminder", item_id: "r-1", link: "/app/later" }]
    mount("open")
    expect(screen.getByText("Call the bank")).toBeTruthy()
    expect(document.querySelector("svg.lucide-bell")).toBeTruthy()
    expect(document.querySelector("svg.lucide-bookmark")).toBeNull()
  })
})

