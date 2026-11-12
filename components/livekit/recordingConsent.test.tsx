import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { RecordingNotice, recordingConfirm } from "./RecordingNotice"

// Recording started at one press, and the people in the call learnt of it
// from a pill they might not see (CALLS-07); captions asked first and told
// everyone with a notice. Now Record asks first, and everyone else is told,
// with Got it and Leave call (UX-CALLS-H1). The call's own wiring is in
// callConference.test.tsx ("CALLS-07").

afterEach(cleanup)

describe("recording asks first and tells everyone (UX-CALLS-H1)", () => {
  it("Record asks first, saying everyone is told and where the recording goes", () => {
    expect(recordingConfirm("in #launch")).toEqual({
      title: "Record this call?",
      description: "Everyone in it is told, and can leave. The recording goes to #launch's recordings, where its members can watch it.",
      confirmText: "Start recording",
    })
    expect(recordingConfirm("with Maya Chen").description).toBe(
      "Everyone in it is told, and can leave. The recording goes to your conversation with Maya Chen, where only the people in it can watch it.",
    )
    expect(recordingConfirm("with Maya, Jonas").description).toContain("your conversation with Maya, Jonas, where only the people in it")
    // Before the place has loaded: still where, never a guess at a name.
    expect(recordingConfirm(undefined).description).toBe("Everyone in it is told, and can leave. The recording stays with this conversation, for the people in it.")
  })

  it("everyone else is shown who started recording, with Got it and Leave call", () => {
    const onDismiss = vi.fn()
    const onLeave = vi.fn()
    render(<RecordingNotice by="Maya Chen" onDismiss={onDismiss} onLeave={onLeave} />)
    const notice = screen.getByRole("status")
    expect(notice.textContent).toContain("Maya Chen started recording")
    expect(notice.textContent).toContain("Everything said and shown from now is recorded. Leave if you don't want to be in it.")
    fireEvent.click(screen.getByRole("button", { name: "Leave call" }))
    expect(onLeave).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole("button", { name: "Got it" }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    cleanup()

    render(<RecordingNotice onDismiss={onDismiss} onLeave={onLeave} />)
    expect(screen.getByRole("status").textContent).toContain("Recording started")
  })

  it("its Leave call is the danger ink, resting and hovered, from the token (the always-dark stage resolves it), never a hex of its own", () => {
    render(<RecordingNotice by="Maya Chen" onDismiss={() => {}} onLeave={() => {}} />)
    const leave = screen.getByRole("button", { name: "Leave call" }).className.split(/\s+/)
    expect(leave).toContain("text-danger-ink")
    expect(leave).toContain("hover:text-danger-ink")
    // The ghost's own hover (the foreground: white on the stage) is merged away, not left to the stylesheet's order.
    expect(leave).not.toContain("hover:text-foreground")
    expect(leave.filter((c) => c.includes("#"))).toEqual([])
  })

  it("takes the focus only from nowhere, never from a field, and Esc is Got it", () => {
    const onDismiss = vi.fn()
    render(<RecordingNotice by="Maya Chen" onDismiss={onDismiss} onLeave={() => {}} />)
    const gotIt = screen.getByRole("button", { name: "Got it" })
    expect(document.activeElement).toBe(gotIt)
    fireEvent.keyDown(gotIt, { key: "Escape" })
    expect(onDismiss).toHaveBeenCalledTimes(1)
    cleanup()

    // Someone typing in the call's chat keeps their field.
    const field = document.createElement("textarea")
    document.body.appendChild(field)
    field.focus()
    render(<RecordingNotice by="Maya Chen" onDismiss={onDismiss} onLeave={() => {}} />)
    expect(document.activeElement).toBe(field)
    field.remove()
  })
})
