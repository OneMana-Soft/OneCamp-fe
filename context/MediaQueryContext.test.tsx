import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { MediaQueryProvider, useMedia } from "./MediaQueryContext"

// A phone fires resize whenever its address bar shows or hides, which is most
// scrolls. Each one made a new context value, so everything that reads the
// screen size (the shell, the message lists, every row) rendered again.

let renders = 0
function Probe() {
  renders++
  const { isMobile } = useMedia()
  return <p>{isMobile ? "phone" : "wide"}</p>
}

function resizeTo(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width })
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height })
  act(() => {
    window.dispatchEvent(new Event("resize"))
  })
}

function mount() {
  renders = 0
  render(
    <MediaQueryProvider>
      <Probe />
    </MediaQueryProvider>,
  )
  return renders
}

afterEach(() => cleanup())

describe("MediaQueryProvider", () => {
  it("renders nothing again when only the height changes", () => {
    resizeTo(390, 664)
    const settled = mount()
    expect(screen.getByText("phone")).toBeTruthy()
    for (const h of [610, 664, 610, 664, 610, 664]) resizeTo(390, h)
    expect(renders - settled, "the address bar re-rendered the app").toBe(0)
  })

  it("renders once when a breakpoint is crossed", () => {
    resizeTo(390, 664)
    const settled = mount()
    resizeTo(800, 664)
    expect(screen.getByText("wide")).toBeTruthy()
    expect(renders - settled).toBe(1)
    resizeTo(820, 600)
    expect(renders - settled).toBe(1)
  })
})
