import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const celebrateTask = vi.fn()
vi.mock("@/lib/celebrate", () => ({ celebrateTask: (el: Element) => celebrateTask(el), prefersReducedMotion: () => false }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn(), useSelector: () => undefined }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(), isSubmitting: false }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: false, isMobile: true }) }))
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copy: vi.fn() }) }))
vi.mock("@/components/later/SaveForLater", () => ({ SaveForLaterButton: () => null }))

const { RightPanelTaskHeader } = await import("@/components/rightPanel/RightPanelTaskHeader")

afterEach(() => {
  cleanup()
  celebrateTask.mockClear()
})

describe("Mark complete in the task panel", () => {
  it("bursts from the button, completes the task, and springs its moss check as it lands", () => {
    const onMarkComplete = vi.fn()
    const { rerender } = render(<RightPanelTaskHeader isAdmin canMarkComplete onMarkComplete={onMarkComplete} taskUUID="t" taskName="Ship it" />)
    const button = screen.getByRole("button", { name: "Mark task as complete" })
    act(() => void fireEvent.click(button))
    expect(celebrateTask).toHaveBeenCalledWith(button)
    expect(onMarkComplete).toHaveBeenCalledTimes(1)
    // The task is done now: the button reads "Completed", its moss disc springing in.
    rerender(<RightPanelTaskHeader isAdmin canMarkComplete={false} onMarkComplete={onMarkComplete} taskUUID="t" taskName="Ship it" />)
    const done = screen.getByRole("button", { name: "Task completed" })
    expect(done.querySelector("[data-anim='fill']")).toBeTruthy()
  })

  it("never celebrates a task that is already done: Completed reopens it, quietly", () => {
    const onReopen = vi.fn()
    render(<RightPanelTaskHeader isAdmin canMarkComplete={false} onMarkComplete={() => {}} onReopen={onReopen} taskUUID="t" taskName="Ship it" />)
    const done = screen.getByRole("button", { name: "Task completed" })
    expect(done.querySelector("[data-anim]")).toBeNull()
    fireEvent.click(done)
    expect(onReopen).toHaveBeenCalledTimes(1)
    expect(celebrateTask).not.toHaveBeenCalled()
  })

  it("is the secondary action, never an outline", () => {
    render(<RightPanelTaskHeader isAdmin canMarkComplete onMarkComplete={() => {}} taskUUID="t" taskName="Ship it" />)
    const button = screen.getByRole("button", { name: "Mark task as complete" })
    expect(button.className).not.toMatch(/\bborder-input\b|variant-outline/)
  })
})
