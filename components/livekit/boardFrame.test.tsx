import { render } from "@testing-library/react"
import * as React from "react"
import { describe, expect, it } from "vitest"
import { useToolRowEdgeFade } from "./boardFrame"

// A board on a call's stage, on a phone (DESIGN-BUILD-24): the canvas's tool
// row is wider than the frame, so it scrolls, and it fades as every strip
// that scrolls sideways does (data-edge-fade, app/interaction.css). The row
// is the canvas's own and drawn again as the canvas likes.
function Frame({ children }: { children?: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null)
  useToolRowEdgeFade(ref)
  return (
    <div ref={ref} data-testid="frame">
      {children}
    </div>
  )
}

describe("a board's tool row on a call's stage", () => {
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
