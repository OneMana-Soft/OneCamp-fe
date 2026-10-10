import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

vi.mock("@/components/themeProvider/theme-toggle", () => ({ ThemeToggle: () => null }))

import { AuthField, AuthHeading, AuthShell } from "@/components/auth/AuthShell"

afterEach(cleanup)

// The frame every signed-out page shares.
describe("the signed-out frame", () => {
  // The owner's bar (the task panel, 1d8c4dd2): labels quiet, values ink, so the
  // eye goes to what is typed rather than to the words about it.
  it("draws a field's label quietly and what is typed in ink", () => {
    render(
      <AuthShell>
        <AuthField id="email" label="Email address" defaultValue="sam@example.com" />
      </AuthShell>,
    )
    const classes = (el: Element) => el.className.split(/\s+/)
    expect(classes(screen.getByText("Email address"))).toContain("text-muted-foreground")
    // The field's own text is ink; only its placeholder is muted.
    expect(classes(screen.getByLabelText("Email address"))).not.toContain("text-muted-foreground")
  })

  // Slots for the pictures that come later (the ring motif beside the sign-in,
  // a picture above a 404). Empty, nothing is drawn and the column is as it was.
  it("has a side area only when it is given one, hidden from screen readers", () => {
    const { container, rerender } = render(<AuthShell>form</AuthShell>)
    expect(container.querySelector("[data-auth-side]")).toBeNull()
    expect(container.querySelector("main")?.parentElement).toBe(container.firstElementChild)

    rerender(<AuthShell side={<svg data-testid="motif" />}>form</AuthShell>)
    const side = container.querySelector("[data-auth-side]")
    expect(side?.getAttribute("aria-hidden")).toBe("true")
    expect(side?.contains(screen.getByTestId("motif"))).toBe(true)
    expect(screen.getByRole("main").textContent).toBe("form")
  })

  it("puts a heading's picture above the heading, hidden from screen readers", () => {
    const { container, rerender } = render(<AuthHeading title="This page doesn't exist" />)
    expect(container.querySelector("[data-auth-art]")).toBeNull()

    rerender(<AuthHeading title="This page doesn't exist" art={<svg data-testid="picture" />} />)
    const art = container.querySelector("[data-auth-art]")!
    expect(art.getAttribute("aria-hidden")).toBe("true")
    const heading = screen.getByRole("heading", { level: 1 })
    expect(art.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
