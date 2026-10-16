import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("react-redux", async (orig) => ({ ...(await orig<typeof import("react-redux")>()), useDispatch: () => vi.fn() }))
vi.mock("@/hooks/useModKey", () => ({ useModKey: () => "Ctrl" }))

import { CreateTiles } from "./HomeLists"

// Integration review, 12 Oct: off a Mac the AI tile's hint reads "Ctrl J"
// (the hub critic's fix for a ⌘ on Linux), which at 1024 beside the sidebar
// left the tile's label "As…". The hint gives way in a narrow tile, and on a
// touch screen with no keyboard (mobile T5), never the label.
describe("Home's Create tiles", () => {
  afterEach(cleanup)

  it("give their key hint up before their label", () => {
    render(<CreateTiles aiAvailable aiOpen={false} onToggleAI={() => {}} />)
    const ask = screen.getByRole("button", { name: /Ask AI/ })
    expect(ask.className).toMatch(/(^| )@container( |$)/)
    const hint = ask.querySelector(".kbd") as HTMLElement
    expect(hint.textContent).toBe("Ctrl J")
    expect(hint.className).toMatch(/(^| )@max-\[8\.5rem\]:hidden( |$)/)
    expect(hint.hasAttribute("data-kbd-hint")).toBe(true)
    const label = Array.from(ask.querySelectorAll("span")).find((s) => s.textContent === "Ask AI") as HTMLElement
    expect(label.className).toMatch(/(^| )truncate( |$)/)
  })
})
