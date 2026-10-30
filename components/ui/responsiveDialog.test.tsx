import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// On a computer the responsive dialog keeps the one overlay layout
// (app/overlay.css): its content is a floating column, the body between the
// header and the footer is the one scroller, and the actions stay in the
// footer, out of what scrolls, however tall the body.
vi.mock("@/components/ui/overlayMode", async (actual) => ({ ...(await actual<object>()), useSheetMode: () => false }))

const { ResponsiveDialog } = await import("./responsive-dialog")

afterEach(cleanup)

describe("the responsive dialog on a computer", () => {
  it("scrolls its body, never its root, with the actions pinned in the footer", () => {
    render(
      <ResponsiveDialog title="Bring your work over" footer={<button type="button">Next</button>} onClose={() => {}}>
        <p>Every tool you can import from</p>
      </ResponsiveDialog>,
    )
    const body = screen.getByText("Every tool you can import from").closest("[data-overlay-body]")
    expect(body).toBeTruthy()
    expect(body!.closest("[data-overlay]")?.getAttribute("data-overlay")).toBe("float")
    const next = screen.getByRole("button", { name: "Next" })
    expect(next.closest("[data-overlay-footer]")).toBeTruthy()
    expect(next.closest("[data-overlay-body]")).toBeNull()
  })

  it("points a reader at its words when it has some, and says it has none when it hasn't", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { unmount } = render(
      <ResponsiveDialog title="Your first steps" description="Step 1 of 4" footer={<button type="button">Next</button>} onClose={() => {}}>
        <p>Who works with you?</p>
      </ResponsiveDialog>,
    )
    const described = screen.getByRole("dialog").getAttribute("aria-describedby")
    expect(described && document.getElementById(described)?.textContent).toBe("Step 1 of 4")
    unmount()
    render(
      <ResponsiveDialog title="Bring your work over" footer={<button type="button">Next</button>} onClose={() => {}}>
        <p>Every tool you can import from</p>
      </ResponsiveDialog>,
    )
    expect(screen.getByRole("dialog").hasAttribute("aria-describedby")).toBe(false)
    expect(warn.mock.calls.flat().join(" ")).not.toMatch(/Missing `Description`/)
    warn.mockRestore()
  })
})
