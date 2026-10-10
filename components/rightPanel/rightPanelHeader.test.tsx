import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { TooltipProvider } from "@/components/ui/tooltip"

// Every view in the right panel opens under the one 48px header. A view with
// controls of its own (an event's Edit or Delete) hands them to the header,
// which draws them just left of the close button, on the title row's centre
// line, rather than in a second row of its own that moved the panel's top.

vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false }) }))

import { RightPanelHeader } from "./rightPanelHeader"

afterEach(cleanup)

function header(node: React.ReactNode) {
  return render(<TooltipProvider>{node}</TooltipProvider>)
}

describe("the right panel's header", () => {
  it("draws a view's own actions in the title row, just before the close button", () => {
    header(<RightPanelHeader titleKey="event" actions={<button type="button">Edit</button>} />)
    const row = screen.getByRole("banner")
    const edit = screen.getByRole("button", { name: "Edit" })
    const close = screen.getByRole("button", { name: "Close panel" })
    // One group on the right, centred on the row like the title.
    expect(row.className).toMatch(/\bitems-center\b/)
    expect(row.className).toMatch(/\bh-12\b/)
    const group = close.closest("[data-panel-actions]") as HTMLElement
    expect(group).not.toBeNull()
    expect(group.contains(edit)).toBe(true)
    expect(group.className).toMatch(/\bitems-center\b/)
    // Before the close button, so closing stays the last thing on the row.
    expect(edit.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Event")
  })

  it("is the same header as before for a view with nothing to add", () => {
    header(<RightPanelHeader titleKey="thread" />)
    const group = screen.getByRole("button", { name: "Close panel" }).closest("[data-panel-actions]") as HTMLElement
    expect(group.querySelectorAll("button")).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Thread")
  })
})
