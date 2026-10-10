import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const celebrate = vi.fn()
vi.mock("@/lib/celebrate", () => ({ celebrate: (el: Element) => celebrate(el) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn(), useSelector: () => undefined }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(), isSubmitting: false }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: false, isMobile: true }) }))
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copy: vi.fn() }) }))
vi.mock("@/components/later/SaveForLater", () => ({ SaveForLaterButton: () => null }))

const { RightPanelTaskHeader } = await import("@/components/rightPanel/RightPanelTaskHeader")

afterEach(() => {
  cleanup()
  celebrate.mockClear()
})

describe("Mark complete in the task panel", () => {
  it("bursts from the button, completes the task, and springs its check as it lands", () => {
    const onMarkComplete = vi.fn()
    const { rerender } = render(<RightPanelTaskHeader isAdmin canMarkComplete onMarkComplete={onMarkComplete} taskUUID="t" taskName="Ship it" />)
    const button = screen.getByRole("button", { name: "Mark task as complete" })
    act(() => void fireEvent.click(button))
    expect(celebrate).toHaveBeenCalledWith(button)
    expect(onMarkComplete).toHaveBeenCalledTimes(1)
    // The task is done now: the button stays a moment as "Completed", its check springing.
    rerender(<RightPanelTaskHeader isAdmin canMarkComplete={false} onMarkComplete={onMarkComplete} taskUUID="t" taskName="Ship it" />)
    const done = screen.getByRole("button", { name: "Task completed" })
    expect(done.querySelector(".animate-spring")).toBeTruthy()
  })

  it("never celebrates a task that is already done: there is no button to press", () => {
    render(<RightPanelTaskHeader isAdmin canMarkComplete={false} onMarkComplete={() => {}} taskUUID="t" taskName="Ship it" />)
    expect(screen.queryByRole("button", { name: /complete/i })).toBeNull()
    expect(celebrate).not.toHaveBeenCalled()
  })
})
