import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render } from "@testing-library/react"

import VideoPlayer from "./videoPlayer"

// V-1161: the player hides its controls when the pointer leaves it while it
// plays. That listener was added afresh on every play and pause and never
// taken off, so each toggle left one more behind, each still holding the
// play state it was added under.

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const listenersOn = (el: () => Element | null, type: string) => {
  const added: EventListenerOrEventListenerObject[] = []
  const removed: EventListenerOrEventListenerObject[] = []
  const add = EventTarget.prototype.addEventListener
  const remove = EventTarget.prototype.removeEventListener
  vi.spyOn(EventTarget.prototype, "addEventListener").mockImplementation(function (this: EventTarget, t, fn, o) {
    if (t === type && fn && this === el()) added.push(fn)
    return add.call(this, t, fn, o)
  })
  vi.spyOn(EventTarget.prototype, "removeEventListener").mockImplementation(function (this: EventTarget, t, fn, o) {
    if (t === type && fn && this === el()) removed.push(fn)
    return remove.call(this, t, fn, o)
  })
  return { added, removed }
}

describe("VideoPlayer", () => {
  it("takes off every pointer-leave listener it adds, through play, pause and closing", () => {
    const host = document.body.appendChild(document.createElement("div"))
    // Held once found: the player has left the page by the time it tidies up.
    let player: Element | null = null
    const leave = listenersOn(() => (player ??= host.firstElementChild), "mouseleave")
    const { container, unmount } = render(<VideoPlayer url="https://files.example/clip.mp4" fileName="clip.mp4" />, { container: host })
    const video = container.querySelector("video")!
    for (let i = 0; i < 3; i++) {
      fireEvent.play(video)
      fireEvent.pause(video)
    }
    unmount()
    expect(leave.added.length).toBeGreaterThan(0)
    expect(leave.added.filter((fn) => !leave.removed.includes(fn))).toEqual([])
  })

  it("keeps its controls when the pointer leaves a paused player that played before", () => {
    const { container } = render(<VideoPlayer url="https://files.example/clip.mp4" fileName="clip.mp4" />)
    const player = container.firstElementChild!
    const video = container.querySelector("video")!
    fireEvent.play(video)
    fireEvent.pause(video)
    fireEvent.mouseLeave(player)
    const controls = container.querySelector(".transition-opacity")!
    expect(controls.className).toContain("opacity-100")
  })
})
