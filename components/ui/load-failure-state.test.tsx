import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const toast = vi.hoisted(() => vi.fn(() => ({ dismiss: () => {} })))
vi.mock("@/hooks/use-toast", () => ({ toast, useToast: () => ({ toast }) }))

const { LoadFailureState } = await import("./load-failure-state")
const { READ_FAILURE_BEAT_MS, tellReadFailure } = await import("@/lib/http/loadFailure")

const status = (code: number) => ({ response: { status: code } })

/**
 * The three things a screen can say about its one thing when reading it
 * failed (PTC-1, PTC-4): not yours, gone, or not loaded. A project nobody
 * could see drew its whole chrome with a live New task and "a connection
 * problem"; a task that was never there said the same.
 */
describe("LoadFailureState", () => {
  beforeEach(() => toast.mockClear())
  afterEach(cleanup)

  it("says a project that isn't the reader's is theirs to ask for, with the way back", () => {
    const { container } = render(<LoadFailureState error={status(403)} noun="project" back={{ label: "Back to projects", href: "/app/project" }} />)
    expect(screen.getByRole("heading", { name: "You can't see this project" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Back to projects" }).getAttribute("href")).toBe("/app/project")
    expect(container.querySelector("[data-load-failure]")?.getAttribute("data-load-failure")).toBe("no-access")
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull()
  })

  it("puts the screen's Request access in place of the way back", () => {
    render(
      <LoadFailureState
        error={status(403)}
        noun="doc"
        back={{ label: "Back to docs", href: "/app/doc" }}
        requestAccess={<button type="button">Request access</button>}
        noAccessDetail="Its owner can let you in."
      />,
    )
    expect(screen.getByRole("button", { name: "Request access" })).toBeTruthy()
    expect(screen.getByText("Its owner can let you in.")).toBeTruthy()
    expect(screen.queryByRole("link", { name: "Back to docs" })).toBeNull()
  })

  it.each([404, 410, 400])("says %i is gone, with no Try again", (code) => {
    const { container } = render(<LoadFailureState error={status(code)} noun="task" back={{ label: "Back to My Tasks", href: "/app/myTask" }} />)
    expect(screen.getByRole("heading", { name: "This task doesn't exist or was deleted" })).toBeTruthy()
    expect(container.querySelector("[data-load-failure]")?.getAttribute("data-load-failure")).toBe("gone")
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull()
  })

  it("says an answer with nothing in it is gone, and a way back may be a button", () => {
    const close = vi.fn()
    render(<LoadFailureState error={undefined} noun="task" back={{ label: "Close", onClick: close }} goneDetail="It may be in a project you're not in." />)
    expect(screen.getByText("It may be in a project you're not in.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(close).toHaveBeenCalledTimes(1)
  })

  it.each([500, 503])("says %i couldn't be loaded, and Try again reads it again", (code) => {
    const retry = vi.fn()
    const { container } = render(<LoadFailureState error={status(code)} noun="board" onRetry={retry} back={{ label: "Back to boards", href: "/app/board" }} />)
    expect(screen.getByText("Couldn't load this board")).toBeTruthy()
    expect(screen.getByText(/Nothing has been lost/)).toBeTruthy()
    expect(container.querySelector("[data-load-failure]")?.getAttribute("data-load-failure")).toBe("failed")
    fireEvent.click(screen.getByRole("button", { name: /try again/i }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it("says a dropped connection couldn't be loaded", () => {
    render(<LoadFailureState error={new Error("Network Error")} noun="table" onRetry={() => {}} />)
    expect(screen.getByText("Couldn't load this table")).toBeTruthy()
  })

  it("takes the kind from the screen when it already knows", () => {
    render(<LoadFailureState kind="gone" error={status(500)} noun="project" />)
    expect(screen.getByRole("heading", { name: "This project doesn't exist or was deleted" })).toBeTruthy()
  })

  it("says it in place, so the read's toast stays quiet", () => {
    vi.useFakeTimers()
    try {
      render(<LoadFailureState error={status(404)} noun="project" />)
      tellReadFailure(status(404))
      act(() => {
        vi.advanceTimersByTime(READ_FAILURE_BEAT_MS + 10)
      })
      expect(toast).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
