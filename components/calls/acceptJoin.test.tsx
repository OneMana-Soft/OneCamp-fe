import { StrictMode } from "react"
import { act, cleanup, render, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import AcceptJoin from "@/components/calls/AcceptJoin"
import { useAccepted } from "@/lib/calls/acceptJoin"
import { accepted, takeAccepted, withdrawAccepted } from "@/lib/calls/accepting"
import type { CallLifecycle } from "@/components/livekit/useCallLifecycle"

const DOOR = "/app/meet/chat/c1"
const OTHER = "/app/meet/grp/g1"
const life = (phase: CallLifecycle["phase"], join: CallLifecycle["join"]) => ({ phase, join }) as CallLifecycle

afterEach(() => {
  cleanup()
  act(() => accepted(""))
})

// Accept on a ring (slack-06 H2) names its call's door; that door's call view
// checks it as it draws and loads the join only then (components/calls/AcceptJoin),
// which says when its join is over, for the ring's card to go (DESIGN-BUILD-118 F1).
describe("Accept joins at its call's door, once", () => {
  it("the door sees Accept, even when it is already open", () => {
    const door = renderHook(() => useAccepted(DOOR))
    const other = renderHook(() => useAccepted(OTHER))
    expect(door.result.current).toBe(false)
    act(() => accepted(DOOR))
    expect(door.result.current).toBe(true)
    expect(other.result.current).toBe(false)
  })

  it("the join takes it once, with the microphone on and the camera off", () => {
    act(() => accepted(DOOR))
    const join = vi.fn()
    render(
      <StrictMode>
        <AcceptJoin door={DOOR} life={life("prejoin", join)} />
      </StrictMode>,
    )
    expect(join).toHaveBeenCalledTimes(1)
    expect(join).toHaveBeenCalledWith({ audioEnabled: true, videoEnabled: false })
    expect(takeAccepted(DOOR)).toBe(false)
  })

  it("refused: back at the prejoin, the ring hears it once and the door is clear; nothing joins again", () => {
    const over = vi.fn()
    const door = renderHook(() => useAccepted(DOOR))
    act(() => accepted(DOOR, over))
    const join = vi.fn()
    const view = render(<AcceptJoin door={DOOR} life={life("prejoin", join)} />)
    // Under way: the door is still Accept's, and the ring's card says Joining….
    view.rerender(<AcceptJoin door={DOOR} life={life("joining", join)} />)
    expect(door.result.current).toBe(true)
    expect(over).not.toHaveBeenCalled()
    act(() => view.rerender(<AcceptJoin door={DOOR} life={life("prejoin", join)} />))
    expect(over).toHaveBeenCalledTimes(1)
    expect(door.result.current).toBe(false)
    view.unmount()
    expect(over).toHaveBeenCalledTimes(1)
    expect(join).toHaveBeenCalledTimes(1)
  })

  it("in the call, the door's view goes: the ring hears it", () => {
    const over = vi.fn()
    act(() => accepted(DOOR, over))
    const view = render(<AcceptJoin door={DOOR} life={life("prejoin", vi.fn())} />)
    expect(over).not.toHaveBeenCalled()
    act(() => view.unmount())
    expect(over).toHaveBeenCalledTimes(1)
  })

  it("nothing joins without an Accept for this door", () => {
    const join = vi.fn()
    act(() => accepted(OTHER))
    render(<AcceptJoin door={DOOR} life={life("prejoin", join)} />)
    expect(join).not.toHaveBeenCalled()
    expect(withdrawAccepted(OTHER)).toBe(true)
  })

  it("an Accept no door took is taken back; one a door took is the door's to end", () => {
    const over = vi.fn()
    act(() => accepted(DOOR, over))
    expect(withdrawAccepted(DOOR)).toBe(true)
    expect(over).not.toHaveBeenCalled()
    act(() => accepted(DOOR, over))
    expect(takeAccepted(DOOR)).toBe(true)
    expect(withdrawAccepted(DOOR)).toBe(false)
  })

  it("a second Accept ends the first's: its card goes", () => {
    const first = vi.fn()
    act(() => accepted(DOOR, first))
    act(() => accepted(OTHER, vi.fn()))
    expect(first).toHaveBeenCalledTimes(1)
  })
})
