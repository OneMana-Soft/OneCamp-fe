import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { CountTick } from "@/components/ui/CountTick"

// DESIGN-BUILD-2 (19 Oct): a count of 1,000 and up groups its thousands, as
// the app writes numbers elsewhere ("2,505 open", a column of "2,500").
afterEach(cleanup)

describe("a count", () => {
  it("groups thousands", () => {
    const { container } = render(<CountTick value={2505} />)
    expect(container.textContent).toBe((2505).toLocaleString())
    expect(container.textContent).not.toBe("2505")
  })
  it("leaves text as it is", () => {
    const { container } = render(<CountTick value="99+" />)
    expect(container.textContent).toBe("99+")
  })
})
