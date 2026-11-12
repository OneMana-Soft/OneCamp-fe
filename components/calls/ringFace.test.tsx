import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { RING_ON, RingFace } from "@/components/calls/RingFace"

afterEach(cleanup)

/**
 * The one face a call rings, on the callee's card, its drawer and the caller's
 * stage: the face wears the still moss ring on its own circle, and a moss ring
 * pulses out from it only while it rings aloud.
 */
describe("RingFace", () => {
  it("holds the face at its size, pulsing only while it rings aloud", () => {
    const { container, rerender } = render(<RingFace pulse size={40}><span className={RING_ON} data-face="" /></RingFace>)
    const box = container.firstElementChild as HTMLElement
    expect(box.style.width).toBe("40px")
    expect(box.querySelectorAll(".ring-pulse")).toHaveLength(1)
    expect(box.querySelector("[data-face]")?.className).toBe("ring-2 ring-camp-moss")
    rerender(<RingFace pulse={false} size={40}><span data-face="" /></RingFace>)
    expect(container.querySelector(".ring-pulse")).toBeNull()
  })
})
