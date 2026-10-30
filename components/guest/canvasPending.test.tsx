import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { CanvasPending } from "./canvasPending"

// The canvas's place while a shared board loads: its own ground, edge to
// edge, in the ground Excalidraw draws (--board-ground), saying in words that it's opening.

afterEach(cleanup)

describe("a board's canvas while it loads", () => {
  it("holds the canvas's whole place in the canvas's own ground, not an inset card", () => {
    render(<CanvasPending />)
    const place = document.querySelector("[data-canvas-pending]")!
    for (const c of ["h-full", "w-full", "bg-board-ground"]) expect(place.classList.contains(c), c).toBe(true)
    expect(place.className).not.toMatch(/\b(rounded|shadow|m-|p-|inset|max-w)/)
    expect(place.getAttribute("aria-busy")).toBe("true")
    expect(screen.getByRole("status").textContent).toBe("Opening the board…")
  })
})
