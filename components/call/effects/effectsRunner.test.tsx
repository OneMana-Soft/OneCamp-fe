import { afterEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import { writeEffects, type CallEffects } from "@/lib/calls/processors/effects"

// When the browser's graphics are reset mid-call, the touch-up stops: the
// panel must say it is off (or "turn it on again" has nothing to turn on),
// the person hears it once, and the rest of their look stays as they chose.

const seen = vi.hoisted(() => ({
  onLost: null as null | (() => void),
  applied: 0,
  toast: vi.fn(),
  why: "This browser can't change your background. Chrome, Edge, Firefox and Safari 17 or later can.",
}))
vi.mock("@/lib/calls/processors/background", () => ({
  backgroundUnavailable: async () => seen.why,
  applyCamera: async (_track: unknown, _look: unknown, opts: { onLost?: () => void }) => {
    seen.applied++
    seen.onLost = opts.onLost ?? null
  },
}))
vi.mock("@/lib/calls/processors/strain", () => ({ lighter: () => null, watchStrain: () => () => undefined }))
vi.mock("@/components/livekit/callSurface", () => ({ callToast: seen.toast }))

const { useCallEffects } = await import("./useCallEffects")
const { useGreenRoomEffects } = await import("./useGreenRoomEffects")

afterEach(() => {
  window.localStorage.clear()
  seen.onLost = null
  seen.applied = 0
  seen.toast.mockReset()
})

/** A room whose camera is already published, with no processor on it yet. */
const roomWithCamera = () => {
  const camera = { source: "camera", track: { getProcessor: () => undefined } }
  return {
    localParticipant: {
      on: () => undefined,
      off: () => undefined,
      trackPublications: new Map([["0", camera]]),
      getTrackPublication: (source: string) => (source === "camera" ? camera : undefined),
    },
  } as never
}

describe("a touch-up the browser's graphics lost", () => {
  it("reads off in the panel, is said once, and leaves low light and the background as chosen", async () => {
    const chosen: CallEffects = { background: { kind: "blur", strength: "strong" }, noise: "standard", touchUp: "smooth", lowLight: true }
    writeEffects(chosen)
    const room = roomWithCamera()
    const { result } = renderHook(() => useCallEffects(room))
    await waitFor(() => expect(seen.onLost).not.toBeNull())
    expect(result.current.effects).toEqual(chosen)

    act(() => seen.onLost!())

    expect(result.current.effects).toEqual({ ...chosen, touchUp: "off" })
    expect(seen.toast).toHaveBeenCalledTimes(1)
    expect(seen.toast.mock.calls[0][0]).toMatchObject({ title: "Touch-up stopped" })

    // Turning it on again puts it back on the camera.
    act(() => result.current.setTouchUp("subtle"))
    await waitFor(() => expect(seen.applied).toBe(2))
    expect(result.current.effects).toEqual({ ...chosen, touchUp: "subtle" })
  })
})

// Whether backgrounds can run in this browser is the camera's processor's own check, asked from where each surface
// puts it on: the call through its runner, the green room on its preview. The chooser shows the reason it gives.
describe("whether backgrounds can run in this browser", () => {
  it("the call asks the camera's processor, and hands on its reason", async () => {
    const room = roomWithCamera()
    const { result } = renderHook(() => useCallEffects(room))
    await expect(result.current.unavailable()).resolves.toBe(seen.why)
  })

  it("the green room asks the camera's processor, and hands on its reason", async () => {
    const { result } = renderHook(() => useGreenRoomEffects(undefined))
    await expect(result.current.unavailable()).resolves.toBe(seen.why)
  })
})
