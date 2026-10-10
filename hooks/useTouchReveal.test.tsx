import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useTouchReveal } from "./useTouchReveal"

// A message's toolbar shows on hover; an iPad cannot hover. A tap on the
// message shows it, a tap elsewhere hides it, and a mouse keeps hover.

function Row() {
  const t = useTouchReveal()
  return (
    <div data-testid="row" onPointerUp={t.onPointerUp}>
      <p>Load test is running now.</p>
      <a href="/x">a link</a>
      {t.revealed && <div role="toolbar">Reply</div>}
    </div>
  )
}

// jsdom has no PointerEvent; a MouseEvent that says which pointer it was.
class TestPointerEvent extends MouseEvent {
  pointerType: string
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerType = init.pointerType ?? ""
  }
}
beforeAll(() => {
  if (!("PointerEvent" in window)) Object.defineProperty(window, "PointerEvent", { configurable: true, value: TestPointerEvent })
})

const up = (el: Element, pointerType: string) => fireEvent.pointerUp(el, { pointerType })

afterEach(() => cleanup())

describe("useTouchReveal", () => {
  it("shows the toolbar on the row a finger taps, and hides it on a tap elsewhere", () => {
    render(
      <>
        <Row />
        <button>elsewhere</button>
      </>,
    )
    up(screen.getByText("Load test is running now."), "touch")
    expect(screen.getByRole("toolbar")).toBeTruthy()
    act(() => {
      fireEvent.pointerDown(screen.getByText("elsewhere"))
    })
    expect(screen.queryByRole("toolbar")).toBeNull()
  })

  it("leaves a mouse to hover, and a tap on a link to the link", () => {
    render(<Row />)
    up(screen.getByText("Load test is running now."), "mouse")
    expect(screen.queryByRole("toolbar")).toBeNull()
    up(screen.getByText("a link"), "touch")
    expect(screen.queryByRole("toolbar")).toBeNull()
  })
})
