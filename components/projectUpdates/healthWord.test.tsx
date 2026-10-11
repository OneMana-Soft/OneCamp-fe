import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { HealthWord } from "@/components/projectUpdates/HealthPill"

afterEach(cleanup)

/** The health word (work.md W09): an 8 px signal dot and the word; no update yet links to writing one. */
describe("the health word", () => {
  it("says each health with its signal dot", () => {
    for (const [health, word] of [
      ["on_track", "On track"],
      ["at_risk", "At risk"],
      ["off_track", "Off track"],
    ]) {
      const { container } = render(<HealthWord health={health} />)
      expect(screen.getByText(word)).toBeInTheDocument()
      expect(container.querySelector(`[data-health-dot='${health}']`)!.className).toContain("size-2")
      cleanup()
    }
  })

  it("offers the first update when there is none and the person may write it", () => {
    const write = vi.fn()
    render(<HealthWord health="" canWrite onClick={write} />)
    fireEvent.click(screen.getByRole("button", { name: "Write the first update" }))
    expect(write).toHaveBeenCalled()
    cleanup()
    render(<HealthWord health={null} />)
    expect(screen.getByText("No update yet")).toBeInTheDocument()
  })
})
