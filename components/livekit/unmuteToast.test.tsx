import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { Room } from "livekit-client"
import type { ReactElement, ReactNode } from "react"
import { deviceSwitch, publishSwitch } from "@/lib/calls/deviceSwitch"

// "Asked to unmute" (CODE-REVIEWER-48's should-fix, 26 Oct): the notice's
// Unmute opened the microphone on its own, beside the dock's and push to
// talk's one switch, the class of the push-to-talk privacy bug.

const toast = vi.fn()
vi.mock("./callSurface", () => ({ callToast: (t: unknown) => toast(t) }))
// The notice's action outside a toast: a button with its words.
vi.mock("@/components/ui/toast", () => ({
  ToastAction: ({ altText, onClick, children }: { altText: string; onClick: () => void; children: ReactNode }) => (
    <button type="button" aria-label={altText} onClick={onClick}>
      {children}
    </button>
  ),
}))

import { askToUnmute } from "./unmuteToast"

afterEach(cleanup)

/**
 * A microphone whose switches land when the test says, as a browser's
 * permission prompt does, in a room whose dock has published its one switch.
 */
function slowMicrophone() {
  const asked: boolean[] = []
  const pending: Array<() => void> = []
  const set = (on: boolean) => {
    asked.push(on)
    return new Promise<void>((land) => pending.push(land))
  }
  const room = { localParticipant: { setMicrophoneEnabled: set } } as unknown as Room
  const dock = deviceSwitch(set, vi.fn())
  const dockGoes = publishSwitch(room, "microphone", dock)
  return { room, dock, asked, dockGoes, land: () => pending.shift()!() }
}

function unmuteButton(room: Room) {
  askToUnmute(room, "Maya asks you to unmute", undefined, "Maya")
  render((toast.mock.lastCall![0] as { action: ReactElement }).action)
  return screen.getByRole("button", { name: "Unmute your microphone" })
}

describe("asked to unmute", () => {
  it("waits for the dock's switch: pressed while the microphone turns off, it opens it once that has landed", async () => {
    const m = slowMicrophone()
    void m.dock.to(false)
    fireEvent.click(unmuteButton(m.room))
    expect(m.asked).toEqual([false])
    m.land()
    await vi.waitFor(() => expect(m.asked).toEqual([false, true]))
  })

  it("asks the browser once, however often it's pressed while the browser still asks", () => {
    const m = slowMicrophone()
    const unmute = unmuteButton(m.room)
    fireEvent.click(unmute)
    fireEvent.click(unmute)
    expect(m.asked).toEqual([true])
  })

  it("turns nothing on once the dock is down: you've left the call", () => {
    const m = slowMicrophone()
    const unmute = unmuteButton(m.room)
    m.dockGoes()
    fireEvent.click(unmute)
    expect(m.asked).toEqual([])
  })
})
