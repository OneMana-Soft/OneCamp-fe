import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import { lazyPart } from "@/lib/lazy/lazyPart"
import { PartRetry } from "@/components/ui/part-retry"

// A part whose code couldn't come says so in its own room, with Try again
// (lib/lazy/lazyPart's failed): the team's member adder, the task panel's tag
// picker and Points row, and My tasks' filters. A narrow column wraps it rather
// than cutting it (the browser check is e2e/taskPoints.spec at 1280 and 390).

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("a part that couldn't load", () => {
  it("names what it is, takes a thumb on a phone, and tries again when pressed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    let fail = true
    const load = vi.fn(() => (fail ? Promise.reject(new Error("offline")) : Promise.resolve(() => <p>The picker</p>)))
    const { Part } = lazyPart<object>(load, {
      placeholder: () => <div data-room="" />,
      failed: ({ retry }) => <PartRetry what="the member picker" retry={retry} />,
    })
    render(<Part />)
    await act(async () => {})
    const button = screen.getByRole("button", { name: "Couldn't load the member picker. Try again" })
    expect(button.className.split(/\s+/)).toEqual(expect.arrayContaining(["min-h-11", "md:min-h-7"]))
    fail = false
    fireEvent.click(button)
    await act(async () => {})
    expect(screen.getByText("The picker")).toBeTruthy()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it("wraps in a narrow column rather than cutting its words, and never parts Try again", () => {
    render(<PartRetry what="the points" retry={() => {}} />)
    const button = screen.getByRole("button", { name: "Couldn't load the points. Try again" })
    expect(button.querySelector(".truncate")).toBeNull()
    expect(screen.getByText("Try again").className).toContain("whitespace-nowrap")
  })
})
