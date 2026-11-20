import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { RecordingNotice, recordingWords } from "./RecordingNotice"
import type { CallTranscription } from "./callState"
import { CaptionsNotice } from "./CallNotice"
import AskedNotice from "./AskedNotice"

// Recording started at one press, and the people in the call learnt of it
// from a pill they might not see (CALLS-07); captions asked first and told
// everyone with a notice. Now Record asks first, and everyone else is told,
// with Got it and Leave call (UX-CALLS-H1). The call's own wiring is in
// callConference.test.tsx ("CALLS-07").

afterEach(cleanup)

describe("recording asks first and tells everyone (UX-CALLS-H1)", () => {
  it("Record asks first, saying everyone is told and where the recording goes", () => {
    expect(recordingWords({ place: "in #launch" }).confirm).toEqual({
      title: "Record this call?",
      description: "Everyone in it is told, and can leave. The recording goes to #launch's recordings, where its members can watch it.",
      confirmText: "Start recording",
    })
    expect(recordingWords({ place: "with Maya Chen" }).confirm.description).toBe(
      "Everyone in it is told, and can leave. The recording goes to your conversation with Maya Chen, where only the people in it can watch it.",
    )
    expect(recordingWords({ place: "with Maya, Jonas" }).confirm.description).toContain("your conversation with Maya, Jonas, where only the people in it")
    // Before the place has loaded: still where, never a guess at a name.
    expect(recordingWords({}).confirm.description).toBe("Everyone in it is told, and can leave. The recording stays with this conversation, for the people in it.")
  })

  // V-948: people consented to a recording without being told the call's
  // words are written down too. A recording makes no transcript of its own:
  // the server keeps the call's lines only while its transcript is on and kept
  // (business/LiveKit/transcriptBusiness.go), filed under the recording as it
  // runs. Then, and only then, the confirm, the notice and the screen reader
  // say a transcript comes with it.
  it("while the call's transcript is on and kept, the confirm, the notice and the screen reader say a transcript comes with the recording (V-948)", () => {
    const w = recordingWords({ place: "in #launch", by: "Maya Chen", transcript: true })
    expect(w.confirm).toEqual({
      title: "Record this call?",
      description: "Everyone in it is told, and can leave. The recording, with a transcript, goes to #launch's recordings, where its members can watch it.",
      confirmText: "Start recording",
    })
    expect(recordingWords({ place: "with Maya Chen", transcript: true }).confirm.description).toBe(
      "Everyone in it is told, and can leave. The recording, with a transcript, goes to your conversation with Maya Chen, where only the people in it can watch it.",
    )
    expect(recordingWords({ transcript: true }).confirm.description).toBe(
      "Everyone in it is told, and can leave. The recording, with a transcript, stays with this conversation, for the people in it.",
    )
    expect(w.title).toBe("Maya Chen started recording")
    expect(w.body).toBe("Everything said and shown from now is recorded, with a transcript. The recording goes to #launch's recordings, where its members can watch it. Leave if you don't want to be in it.")
    expect(w.said).toBe("Maya Chen started recording, with a transcript")
    expect(recordingWords({ transcript: true }).said).toBe("Recording started, with a transcript")
  })

  it("with no transcript every word stays as it was, and no case names a summary (V-948)", () => {
    for (const transcript of [false, undefined]) {
      const w = recordingWords({ place: "in #launch", by: "Maya Chen", transcript })
      expect(w.confirm.description).toBe("Everyone in it is told, and can leave. The recording goes to #launch's recordings, where its members can watch it.")
      expect(w.title).toBe("Maya Chen started recording")
      expect(w.body).toBe("Everything said and shown from now is recorded. The recording goes to #launch's recordings, where its members can watch it. Leave if you don't want to be in it.")
      expect(w.said).toBe("Maya Chen started recording")
      expect(recordingWords({ transcript }).title).toBe("Recording started")
      expect(recordingWords({ transcript }).said).toBe("Recording started")
    }
    for (const transcript of [true, false]) {
      for (const place of ["in #launch", "with Maya Chen", undefined]) {
        expect(JSON.stringify(recordingWords({ place, by: "Maya Chen", transcript }))).not.toMatch(/summar|recap|\bAI\b/i)
      }
    }
  })

  // D-CL-7: the notice everyone reads names where the recording stays, in the
  // confirm's own words (one phrase for both), and a guest, who has no place,
  // is told it stays with this conversation.
  it("everyone's notice says where the recording stays, in the very words its starter's confirm used", () => {
    for (const transcript of [true, false]) {
      for (const place of ["in #launch", "with Maya Chen", "with Maya, Jonas", undefined]) {
        const w = recordingWords({ place, by: "Maya Chen", transcript })
        const goes = w.confirm.description.replace(/^.*?The recording(, with a transcript,)? /, "")
        expect(w.body).toContain(` The recording ${goes} `)
      }
    }
    expect(recordingWords({ place: "with Maya Chen" }).body).toBe(
      "Everything said and shown from now is recorded. The recording goes to your conversation with Maya Chen, where only the people in it can watch it. Leave if you don't want to be in it.",
    )
    render(<RecordingNotice by="Maya Chen" place="in #launch" onDismiss={vi.fn()} onLeave={vi.fn()} />)
    expect(screen.getByRole("status").textContent).toContain("The recording goes to #launch's recordings, where its members can watch it.")
  })

  it("the notice says a transcript comes with the recording when the call keeps one (V-948)", () => {
    render(<RecordingNotice by="Maya Chen" transcript onDismiss={vi.fn()} onLeave={vi.fn()} />)
    const notice = screen.getByRole("status")
    expect(notice.textContent).toContain("Maya Chen started recording")
    expect(notice.textContent).toContain("Everything said and shown from now is recorded, with a transcript. The recording stays with this conversation, for the people in it. Leave if you don't want to be in it.")
  })

  it("everyone else is shown who started recording, with Got it and Leave call", () => {
    const onDismiss = vi.fn()
    const onLeave = vi.fn()
    render(<RecordingNotice by="Maya Chen" onDismiss={onDismiss} onLeave={onLeave} />)
    const notice = screen.getByRole("status")
    expect(notice.textContent).toContain("Maya Chen started recording")
    expect(notice.textContent).toContain("Everything said and shown from now is recorded. The recording stays with this conversation, for the people in it. Leave if you don't want to be in it.")
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

  it("a guest's OK is busy while their answer is out: aria-busy, still focused, and a second press answers nothing; Leave call still works (zoom-09 look F1)", () => {
    const onDismiss = vi.fn()
    const onLeave = vi.fn()
    const captions = { by: "Maya Chen", where: "server" } as CallTranscription
    for (const notice of [
      (busy: boolean) => <RecordingNotice by="Maya Chen" asks={AskedNotice} busy={busy} onDismiss={onDismiss} onLeave={onLeave} />,
      (busy: boolean) => <CaptionsNotice transcription={captions} asks={AskedNotice} busy={busy} onDismiss={onDismiss} onLeave={onLeave} />,
    ]) {
      onDismiss.mockClear()
      const { rerender } = render(notice(true))
      const ok = screen.getByRole("button", { name: "OK" })
      expect(ok.getAttribute("aria-busy")).toBe("true")
      expect(document.activeElement).toBe(ok)
      fireEvent.click(ok)
      expect(onDismiss).not.toHaveBeenCalled()
      onLeave.mockClear()
      fireEvent.click(screen.getByRole("button", { name: "Leave call" }))
      expect(onLeave).toHaveBeenCalledTimes(1)
      rerender(notice(false))
      expect(ok.getAttribute("aria-busy")).toBeNull()
      fireEvent.click(ok)
      expect(onDismiss).toHaveBeenCalledTimes(1)
      cleanup()
    }
  })
})
