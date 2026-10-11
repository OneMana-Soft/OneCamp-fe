import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { Bar } from "@/components/ui/progress"
import { growStyle } from "@/hooks/useGrow"

afterEach(cleanup)

/** A progress bar fills by scaleX, never by width (work.md W08). */
describe("the progress bar", () => {
  it("scales its fill, and turns moss when all is done", () => {
    const { container, rerender } = render(<Bar value={65} label="Q4 launch, 65%" />)
    const fill = container.querySelector<HTMLElement>("[data-bar-fill]")!
    expect(fill.style.transform).toBe("scaleX(0.65)")
    expect(fill.style.width).toBe("")
    expect(fill.className).toContain("bg-progress")
    rerender(<Bar value={100} label="done" />)
    expect(container.querySelector("[data-bar-fill]")!.className).toContain("bg-camp-moss")
  })

  it("draws a pace tick where the work should be", () => {
    const { container } = render(<Bar value={40} pace={55} label="Goal" size={6} />)
    expect(container.querySelector<HTMLElement>("[data-pace-tick]")!.style.left).toBe("55%")
  })

  it("grows on transform, staggered and capped", () => {
    expect(growStyle(0).animation).toContain("work-grow-x")
    expect(growStyle(3).animationDelay).toBe("48ms")
    expect(growStyle(100).animationDelay).toBe("240ms")
    expect(growStyle(0, "y").transformOrigin).toBe("center bottom")
  })
})
