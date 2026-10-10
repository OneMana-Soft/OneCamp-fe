import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { Badge } from "@/components/ui/badge"

afterEach(cleanup)

describe("Badge caps", () => {
  it("is sentence case: no uppercase, no wide tracking, first letter capitalised", () => {
    const { container } = render(<Badge caps>task</Badge>)
    const badge = container.firstElementChild as HTMLElement
    expect(badge.className).not.toContain("uppercase")
    expect(badge.className).not.toContain("tracking-wider")
    expect(screen.getByText("task").className).toContain("first-letter:uppercase")
  })

  it("leaves a badge without caps exactly as its children", () => {
    const { container } = render(<Badge>Paid</Badge>)
    expect((container.firstElementChild as HTMLElement).textContent).toBe("Paid")
    expect(container.querySelector(".first-letter\\:uppercase")).toBeNull()
  })
})
