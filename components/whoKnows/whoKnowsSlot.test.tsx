import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"

// The strip's code, held back until the test lets it arrive.
const chunk = vi.hoisted(() => {
  let arrive = () => {}
  const arrived = new Promise<void>((resolve) => {
    arrive = resolve
  })
  return { arrived, arrive: () => arrive() }
})
vi.mock("@/components/whoKnows/WhoKnowsStrip", async () => {
  await chunk.arrived
  return { WhoKnowsStrip: ({ words }: { words: string }) => <p data-strip-words={words}>the strip</p> }
})

const { WhoKnowsSlot } = await import("./WhoKnowsSlot")

afterEach(cleanup)

describe("Who knows' held slot on the search page", () => {
  it("is the strip loading from the first frame, until the strip's code arrives and takes its place", async () => {
    render(<WhoKnowsSlot words=" budget " />)
    // The strip's own frame, never a blank card that reads as broken.
    const slot = screen.getByRole("region", { name: "Who knows about “budget”" })
    expect(within(slot).getByRole("status", { name: "Finding who knows" })).toBeTruthy()

    chunk.arrive()
    expect((await screen.findByText("the strip")).getAttribute("data-strip-words")).toBe(" budget ")
    expect(screen.queryByRole("status", { name: "Finding who knows" })).toBeNull()
  })

  // The strip asks from two characters; a place it would never fill would
  // close under the results after they drew.
  it("holds no place for a word too short to ask about", () => {
    const { container } = render(<WhoKnowsSlot words=" b " />)
    expect(container.innerHTML).toBe("")
  })
})
