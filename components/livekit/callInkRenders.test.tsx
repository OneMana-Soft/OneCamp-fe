// lib/testing/reactRenders must load before React DOM: this file's first import.
import { renders } from "@/lib/testing/reactRenders"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { fakeCallRoom } from "@/lib/testing/callRoom"
import { installPointerEvent } from "@/lib/testing/pointerEvent"
import { CallInkContext, ShareInk, useCallInk } from "./callInk"

// What ink costs the call (CODE-REVIEWER-126, S3): a stroke sends a packet
// every 50 ms per person drawing, and the stage's tiles and the dock aren't
// memoised. A drawn point or a packet draws again the layer of the share it
// falls on, and never the call that holds the ink, nor anything beside it.

const SHARE = "ana|screen_share"

/** The dock beside the share's layer, as the call draws it: nothing of ink in it. */
function Dock() {
  return <div data-dock="" />
}

/** The call: it holds the ink (useCallInk), as MyVideoConference does, and draws the dock and the share's layer. */
function Call({ room }: { room: unknown }) {
  const ink = useCallInk(room as never)
  return (
    <CallInkContext.Provider value={ink}>
      <Dock />
      <ShareInk share={SHARE} name="Ana" frame={{ w: 1920, h: 1080 }} />
    </CallInkContext.Provider>
  )
}

/** How many times a component drew since the count began. */
const drawn = (name: string) => Number(new RegExp(`(?:^|, )${name} (\\d+)(?:,|$)`).exec(renders.top(1000))?.[1] ?? 0)

beforeAll(() => installPointerEvent())

beforeEach(() => {
  // A 1000 x 1000 tile, as callInk.test.tsx's: the 16:9 frame in it is 562.5 tall, from y 218.75.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 1000, height: 1000, right: 1000, bottom: 1000, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("ink draws only the layer of the share it falls on", () => {
  it("draws your stroke and the call's packets there, and never the call or its dock", () => {
    const f = fakeCallRoom()
    const { container } = render(<Call room={f.room} />)
    fireEvent.click(screen.getByRole("button", { name: "Annotate Ana's screen" }))
    renders.reset()
    const surface = container.querySelector("[data-ink-surface]")!
    fireEvent.pointerDown(surface, { clientX: 500, clientY: 500, pointerId: 1, button: 0 })
    for (let x = 510; x <= 600; x += 10) fireEvent.pointerMove(surface, { clientX: x, clientY: 500, pointerId: 1 })
    fireEvent.pointerUp(surface, { clientX: 600, clientY: 500, pointerId: 1 })
    f.receive("ink", { share: SHARE, id: "b1", at: 0, p: [0, 0, 9, 9], end: false }, "ben")
    f.receive("ink", { share: SHARE, id: "b1", at: 2, p: [20, 20], end: true }, "ben")
    expect(container.querySelectorAll("[data-ink-stroke]"), "your stroke and Ben's").toHaveLength(2)
    expect(drawn("ShareInk"), renders.top()).toBeGreaterThan(0)
    expect(drawn("Call"), `the call drew again: ${renders.top()}`).toBe(0)
    expect(drawn("Dock"), `the dock drew again: ${renders.top()}`).toBe(0)
  })
})
