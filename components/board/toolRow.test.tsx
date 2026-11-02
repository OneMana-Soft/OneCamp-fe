import { render } from "@testing-library/react"
import * as React from "react"
import { describe, expect, it, vi } from "vitest"

// A phone's tool row (miro-40 H1): at 44px a tool, Excalidraw's row is wider
// than a phone's screen, so Insert image, Eraser and More tools sat past its
// right edge with no way to reach them, and focusing one slid the whole board
// sideways under a strip no touch reached. The row is a strip that scrolls
// sideways (data-edge-fade, app/interaction.css's one rule for every strip),
// marked by the one canvas every board draws through (boardExcalidraw: the
// board page, a guest's viewer and both call stages), not by each page.

// Excalidraw at a phone's width, reduced to its tool row (0.18's mobile
// layout): the board's own wrapper is what is under test.
vi.mock("@excalidraw/excalidraw", async () => {
  const { createElement } = await import("react")
  return {
    Excalidraw: () =>
      createElement(
        "div",
        { className: "excalidraw excalidraw--mobile" },
        createElement("div", { className: "Island App-toolbar App-toolbar--mobile", "data-testid": "board-row" }),
      ),
  }
})
vi.mock("@/components/minimal-tiptap/extensions/links-media/adminHosts", () => ({ ensureAdminHosts: () => new Promise(() => {}) }))

import BoardExcalidraw from "./boardExcalidraw"
import { useToolRowEdgeFade } from "./toolRow"

describe("a board's tool row on a phone", () => {
  it("is a strip that scrolls on every board: the canvas every board draws through marks it", () => {
    const { getByTestId } = render(<BoardExcalidraw embedView={() => null} />)
    expect(getByTestId("board-row").hasAttribute("data-edge-fade")).toBe(true)
  })
})

// The marker itself, on any frame that holds a canvas (DESIGN-BUILD-24 on a
// call's stage first): the row is the canvas's own and drawn again as the
// canvas likes.
function Frame({ children }: { children?: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null)
  useToolRowEdgeFade(ref)
  return (
    <div ref={ref} data-testid="frame">
      {children}
    </div>
  )
}

describe("the tool row's marker", () => {
  it("is marked as a strip that scrolls, there at once and drawn again later", async () => {
    const { getByTestId } = render(
      <Frame>
        <div className="Island App-toolbar App-toolbar--mobile" data-testid="row" />
      </Frame>,
    )
    expect(getByTestId("row").hasAttribute("data-edge-fade")).toBe(true)
    const again = document.createElement("div")
    again.className = "Island App-toolbar App-toolbar--mobile"
    getByTestId("frame").appendChild(again)
    await new Promise((done) => setTimeout(done, 0))
    expect(again.hasAttribute("data-edge-fade")).toBe(true)
  })

  it("leaves everything else in the frame alone", () => {
    const { getByTestId } = render(
      <Frame>
        <div className="Island App-toolbar" data-testid="wide-row" />
      </Frame>,
    )
    expect(getByTestId("wide-row").hasAttribute("data-edge-fade")).toBe(false)
  })
})
