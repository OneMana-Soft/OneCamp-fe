import { Profiler } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import TouchableDiv from "./touchRippleAnimation"

// Message rows, recordings and posts on a phone sit in a TouchableDiv. Its
// ripple set React state on every touchstart (the first touch of every scroll
// too), rendering the row and the message inside it again, and once more when
// the ripple cleared 800ms later.

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("TouchableDiv", () => {
  it("answers a touch without rendering the row again", () => {
    vi.useFakeTimers()
    let renders = 0
    render(
      <Profiler id="row" onRender={() => renders++}>
        <TouchableDiv rippleBrightness={0.8} rippleDuration={800}>
          <p>Load test is running now.</p>
        </TouchableDiv>
      </Profiler>,
    )
    expect(renders).toBe(1)
    const row = screen.getByText("Load test is running now.").parentElement as HTMLElement
    fireEvent.touchStart(row, { touches: [{ clientX: 40, clientY: 10 }] })
    fireEvent.touchEnd(row)
    act(() => vi.advanceTimersByTime(1000))
    expect(renders, "a touch rendered the row again").toBe(1)
  })

  it("tints while pressed, in CSS, and draws nothing extra", () => {
    render(
      <TouchableDiv>
        <p>row</p>
      </TouchableDiv>,
    )
    const row = screen.getByText("row").parentElement as HTMLElement
    expect(row.className.split(/\s+/)).toEqual(expect.arrayContaining(["active:bg-highlight", "transition-colors"]))
    fireEvent.touchStart(row, { touches: [{ clientX: 4, clientY: 4 }] })
    expect(row.children).toHaveLength(1)
    expect(document.querySelectorAll("style")).toHaveLength(0)
  })

  it("still takes a click, and says when a press ends", () => {
    const onClick = vi.fn()
    const onTouch = vi.fn()
    render(
      <TouchableDiv onClick={onClick} onTouch={onTouch}>
        <p>row</p>
      </TouchableDiv>,
    )
    const row = screen.getByText("row").parentElement as HTMLElement
    fireEvent.touchEnd(row)
    fireEvent.click(row)
    expect(onTouch).toHaveBeenCalledTimes(1)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
