import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// How many suggestions wait on a doc, by its title: none, no chip; a click
// opens the list beside the doc.

let statuses: string[] = []
const emit = vi.fn()
vi.mock("@/services/proposalService", () => ({
  useDocProposals: () => ({ proposals: statuses.map((status, i) => ({ id: `p${i}`, status })) }),
}))
vi.mock("@/components/docEditor/registry/commandBus", () => ({ useDocBus: () => ({ emit }) }))

const { default: SuggestionsChip } = await import("./SuggestionsChip")

afterEach(() => {
  cleanup()
  emit.mockReset()
  statuses = []
})

describe("the suggestions chip", () => {
  it("counts the ones still to decide, and opens the list", () => {
    statuses = ["open", "partial", "accepted", "declined"]
    render(<SuggestionsChip docId="d1" />)
    const chip = screen.getByRole("button", { name: "2 suggestions waiting. Show them" })
    expect(chip.textContent).toBe("2 suggestions")
    fireEvent.click(chip)
    expect(emit).toHaveBeenCalledWith("openPanel", { kind: "suggestions" })
  })

  it("isn't there when none wait", () => {
    statuses = ["accepted"]
    render(<SuggestionsChip docId="d1" />)
    expect(document.querySelector("[data-suggestions-chip]")).toBeNull()
  })
})
