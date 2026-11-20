import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { RecordingNotice, recordingWords } from "./RecordingNotice"
import { readCallMetadata, type CallTranscription } from "./callState"
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
  // say a transcript comes with it. Whether the AI sums the call up is the
  // server's word alone (V-951, below): without it, none names a summary.
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

  // V-951: the AI could sum a recorded call up after it, and nobody was told.
  // The server now says so in the room's switch (summary: the transcript is on
  // and kept AND the workspace makes AI summaries), and everyone in the room,
  // members and guests alike, reads it there. Only then do the confirm, the
  // notice and the screen reader say one may follow, and where. The recap
  // skips a call too short to sum up, so none promises one. AI off, the
  // edition without AI, breakouts, instant meetings and older servers say
  // nothing, and no word changes.
  it("reads the server's word on a summary: yes only for summary true while on, anything else no (V-951)", () => {
    const on = { on: true, by: "Maya Chen", where: "server", kept: true }
    expect(readCallMetadata(JSON.stringify({ transcription: { ...on, summary: true } })).transcription.summary).toBe(true)
    expect(readCallMetadata(JSON.stringify({ transcription: { ...on, summary: false } })).transcription.summary).toBe(false)
    // An older server, or one without AI, says nothing: no.
    expect(readCallMetadata(JSON.stringify({ transcription: on })).transcription.summary).toBe(false)
    expect(readCallMetadata(JSON.stringify({ transcription: { ...on, summary: "yes" } })).transcription.summary).toBe(false)
    expect(readCallMetadata(JSON.stringify({ transcription: { on: false, summary: true } })).transcription.summary).toBeFalsy()
  })

  it("while the transcript is kept and the server says the AI sums the call up, the confirm, the notice and the screen reader say one may follow, and where (V-951)", () => {
    const w = recordingWords({ place: "in #launch", by: "Maya Chen", transcript: true, summary: true })
    expect(w.confirm).toEqual({
      title: "Record this call?",
      description:
        "Everyone in it is told, and can leave. The recording, with a transcript, goes to #launch's recordings, where its members can watch it. After the call, an AI summary is posted in #launch if there's enough to sum up.",
      confirmText: "Start recording",
    })
    expect(w.title).toBe("Maya Chen started recording")
    expect(w.body).toBe("Everything said and shown from now is recorded, with a transcript. The recording goes to #launch's recordings, where its members can watch it. An AI summary may follow in #launch. Leave if you don't want to be in it.")
    expect(w.said).toBe("Maya Chen started recording, with a transcript. An AI summary may follow")
    const dm = recordingWords({ place: "with Maya Chen", transcript: true, summary: true })
    expect(dm.confirm.description).toBe(
      "Everyone in it is told, and can leave. The recording, with a transcript, goes to your conversation with Maya Chen, where only the people in it can watch it. After the call, an AI summary is posted there if there's enough to sum up.",
    )
    expect(dm.body).toContain(" An AI summary may follow in your conversation with Maya Chen. ")
    const nowhere = recordingWords({ transcript: true, summary: true })
    expect(nowhere.confirm.description).toBe(
      "Everyone in it is told, and can leave. The recording, with a transcript, stays with this conversation, for the people in it. After the call, an AI summary is posted there if there's enough to sum up.",
    )
    expect(nowhere.body).toContain(" An AI summary may follow in this conversation. ")
    expect(nowhere.said).toBe("Recording started, with a transcript. An AI summary may follow")
  })

  it("a summary is named only with a kept transcript: without one, or with the server saying no or nothing, every word is as it was (V-951)", () => {
    for (const place of ["in #launch", "with Maya Chen", undefined]) {
      // No transcript kept: nothing to sum up, whatever the switch says.
      for (const transcript of [false, undefined]) {
        const w = recordingWords({ place, by: "Maya Chen", transcript, summary: true })
        expect(w).toEqual(recordingWords({ place, by: "Maya Chen", transcript }))
        expect(JSON.stringify(w)).not.toMatch(/summar|recap|\bAI\b/i)
      }
      // The server says no, or nothing (AI off, the edition without AI, an older server): V-948's words.
      for (const summary of [false, undefined]) {
        const w = recordingWords({ place, by: "Maya Chen", transcript: true, summary })
        expect(w).toEqual(recordingWords({ place, by: "Maya Chen", transcript: true }))
        expect(JSON.stringify(w)).not.toMatch(/summar|recap|\bAI\b/i)
      }
    }
  })

  it("the notice says an AI summary may follow in the call's place only when the server says so (V-951)", () => {
    render(<RecordingNotice place="in #launch" by="Maya Chen" transcript summary onDismiss={vi.fn()} onLeave={vi.fn()} />)
    expect(screen.getByRole("status").textContent).toContain(
      "Everything said and shown from now is recorded, with a transcript. The recording goes to #launch's recordings, where its members can watch it. An AI summary may follow in #launch. Leave if you don't want to be in it.",
    )
    cleanup()
    render(<RecordingNotice place="in #launch" by="Maya Chen" transcript summary={false} onDismiss={vi.fn()} onLeave={vi.fn()} />)
    expect(screen.getByRole("status").textContent).not.toMatch(/summar|\bAI\b/i)
    cleanup()
    render(<RecordingNotice place="in #launch" by="Maya Chen" transcript={false} summary onDismiss={vi.fn()} onLeave={vi.fn()} />)
    expect(screen.getByRole("status").textContent).not.toMatch(/summar|\bAI\b/i)
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
