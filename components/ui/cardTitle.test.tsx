import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { CardTitle } from "@/components/ui/card"

afterEach(cleanup)

describe("CardTitle as", () => {
  it("stays a div by default", () => {
    const { container } = render(<CardTitle>Billing</CardTitle>)
    expect(container.firstElementChild?.tagName).toBe("DIV")
    expect(screen.queryByRole("heading")).toBeNull()
  })

  it("is a heading at the level asked for", () => {
    render(<CardTitle as="h3">Billing</CardTitle>)
    expect(screen.getByRole("heading", { name: "Billing", level: 3 })).toBeTruthy()
  })
})
