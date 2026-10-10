import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { StatusWord } from "@/components/ui/statusWord"

afterEach(cleanup)

// A state is a dot and a word, as the task panel's status reads: the word
// carries the meaning and stays in ink; the dot is in the status colour.
describe("a status word", () => {
  it("says the state in words, in ink, with a status-coloured dot beside it", () => {
    render(<StatusWord tone="success">On</StatusWord>)
    const word = screen.getByText("On")
    expect(word.className).toContain("text-foreground")
    const dot = word.querySelector("[aria-hidden='true']") as HTMLElement
    expect(dot.className).toContain("bg-success")
    expect(dot.className).toContain("rounded-full")
    expect(dot.className).toContain("size-1.5")
  })

  it("has a quiet dot for a state that is neither good nor bad", () => {
    render(<StatusWord>Not set up</StatusWord>)
    const dot = screen.getByText("Not set up").querySelector("[aria-hidden='true']") as HTMLElement
    expect(dot.className).toContain("bg-faint-foreground")
  })

  it("never colours the word itself, so it reads at AA in every theme", () => {
    render(<StatusWord tone="danger">Failing</StatusWord>)
    expect(screen.getByText("Failing").className).not.toMatch(/text-(destructive|danger|success|warning)/)
  })
})
