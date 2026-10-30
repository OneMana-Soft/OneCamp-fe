import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import type { ReactElement } from "react"

import { saveDotCopy, type SaveState } from "@/components/docEditor/SaveDot"
import type { DocSaveSource } from "@/components/docEditor/docSaveState"

// The dot's reading (useDocSaveDot), set by each step, and the toasts made.
const dot = vi.hoisted(() => ({ reading: { state: "saved" as SaveState, savedAt: null as Date | null, waiting: 0 } }))
vi.mock("@/components/docEditor/docSaveState", () => ({ useDocSaveDot: () => dot.reading }))
type Made = { props: Record<string, unknown>; updates: Record<string, unknown>[]; dismissed: boolean }
const toasts = vi.hoisted(() => ({ made: [] as Made[] }))
vi.mock("@/hooks/use-toast", () => ({
  toast: (props: Record<string, unknown>) => {
    const made: Made = { props, updates: [], dismissed: false }
    toasts.made.push(made)
    return { id: String(toasts.made.length), update: (p: Record<string, unknown>) => made.updates.push(p), dismiss: () => (made.dismissed = true) }
  },
  // The list on screen, which the notice reads to hold the pill's place (docSaveNoticePill.test.tsx); none here.
  useToastState: () => ({ toasts: [] }),
}))

import { DocSaveNotice, saveAtRisk, saveNoticeOf } from "@/components/docEditor/DocSaveNotice"

// A phone's doc has no header, so no save dot (D05). The notice says what the
// dot would while this tab's work isn't stored, in the app's toast (V-21).

describe("what the save notice says", () => {
  it("is at risk while changes wait disconnected, and when a save failed", () => {
    expect(saveAtRisk("offline", 3)).toBe(true)
    expect(saveAtRisk("reconnecting", 3)).toBe(true)
    expect(saveAtRisk("failed", 0)).toBe(true)
    expect(saveAtRisk("offline", 0)).toBe(false)
    expect(saveAtRisk("reconnecting", 0)).toBe(false)
    expect(saveAtRisk("saving", 3)).toBe(false)
  })

  it("says the dot's words: waiting, then saving, then saved, which goes by itself", () => {
    const at = new Date()
    expect(saveNoticeOf("reconnecting", at, 2)).toEqual({ words: "Reconnecting. Changes are kept and will sync", tone: "warning", stays: true })
    expect(saveNoticeOf("offline", at, 1)).toEqual({ words: "Offline. Changes are kept and will sync", tone: "warning", stays: true })
    expect(saveNoticeOf("saving", at, 0)).toEqual({ words: saveDotCopy("saving", at, true), tone: "loading", stays: true })
    expect(saveNoticeOf("saved", at, 0)).toEqual({ words: saveDotCopy("saved", at, true), tone: "success", stays: false })
    expect(saveNoticeOf("saved", null, 0)?.words).toBe("Saved to the live doc")
    // A board's notice (V-45) speaks of the board: its server says no time, so saved is to the live board.
    expect(saveNoticeOf("saved", null, 0, { thing: "board" })?.words).toBe("Saved to the live board")
    expect(saveNoticeOf("offline", null, 2, { thing: "board" })?.words).toBe("Offline. Changes are kept and will sync")
  })

  // Beside the pill, which says Offline or Reconnecting itself, only what becomes of the work (V-21, design review).
  it("says only that the changes are kept, beside the connection pill", () => {
    for (const state of ["offline", "reconnecting"] as const) {
      expect(saveNoticeOf(state, null, 3, { besidePill: true })).toEqual({ words: "Changes are kept and will sync", tone: "warning", stays: true })
    }
    expect(saveNoticeOf("failed", null, 0, { besidePill: true })?.words).toBe("Not saved. Select to try again")
  })

  it("says a failed save in the error tone, with Try again, and it stays", () => {
    expect(saveNoticeOf("failed", null, 0)).toEqual({ words: "Not saved. Select to try again", tone: "error", stays: true, retry: true })
  })

  it("ends when nothing waits any more", () => {
    expect(saveNoticeOf("offline", null, 0)).toBeNull()
    expect(saveNoticeOf("reconnecting", null, 0)).toBeNull()
    expect(saveNoticeOf("connecting", null, 0)).toBeNull()
  })
})

describe("the save notice", () => {
  const source = { provider: null, live: true } as DocSaveSource
  const retry = vi.fn()
  const view = () => <DocSaveNotice source={source} onRetry={retry} />
  const read = (state: SaveState, waiting = 0, savedAt: Date | null = null) => (dot.reading = { state, savedAt, waiting })

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    toasts.made.length = 0
    retry.mockClear()
    read("saved")
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("says nothing for a blip", () => {
    const { rerender } = render(view())
    read("reconnecting", 1)
    rerender(view())
    act(() => void vi.advanceTimersByTime(1_900))
    read("saved")
    rerender(view())
    act(() => void vi.advanceTimersByTime(5_000))
    expect(toasts.made).toHaveLength(0)
  })

  it("follows a spell of waiting changes until they are stored, then ends", () => {
    const { rerender } = render(view())
    read("reconnecting", 1)
    rerender(view())
    act(() => void vi.advanceTimersByTime(2_000))
    expect(toasts.made).toHaveLength(1)
    const made = toasts.made[0]
    expect(made.props).toEqual({ title: "Reconnecting. Changes are kept and will sync", tone: "warning", duration: Infinity, action: undefined })

    read("offline", 4)
    rerender(view())
    expect(made.updates.at(-1)).toMatchObject({ title: "Offline. Changes are kept and will sync", tone: "warning", duration: Infinity })

    read("saving")
    rerender(view())
    expect(made.updates.at(-1)).toMatchObject({ title: "Saving your changes", tone: "loading", duration: Infinity })

    const at = new Date()
    read("saved", 0, at)
    rerender(view())
    expect(made.updates.at(-1)).toMatchObject({ title: saveDotCopy("saved", at, true), tone: "success", duration: 4_000 })

    // Ended: what follows is the dot's quiet states, never said.
    const updates = made.updates.length
    read("saving")
    rerender(view())
    act(() => void vi.advanceTimersByTime(5_000))
    expect(made.updates).toHaveLength(updates)
    expect(toasts.made).toHaveLength(1)
    expect(made.dismissed).toBe(false)
  })

  it("says a failed save with Try again, which is the session's retry", () => {
    const { rerender } = render(view())
    read("failed")
    rerender(view())
    act(() => void vi.advanceTimersByTime(2_000))
    expect(toasts.made).toHaveLength(1)
    const { props } = toasts.made[0]
    expect(props).toMatchObject({ title: "Not saved. Select to try again", tone: "error", duration: Infinity })
    const action = props.action as ReactElement<{ altText: string; onClick: () => void }>
    expect(action.props.altText).toBe("Try again")
    action.props.onClick()
    expect(retry).toHaveBeenCalledOnce()
  })

  it("closes when nothing waits any more without a save, and a new spell is a new notice", () => {
    const { rerender } = render(view())
    read("offline", 2)
    rerender(view())
    act(() => void vi.advanceTimersByTime(2_000))
    read("offline", 0)
    rerender(view())
    expect(toasts.made[0].dismissed).toBe(true)

    read("offline", 1)
    rerender(view())
    act(() => void vi.advanceTimersByTime(2_000))
    expect(toasts.made).toHaveLength(2)
  })

  it("goes with the doc", () => {
    const { rerender, unmount } = render(view())
    read("reconnecting", 1)
    rerender(view())
    act(() => void vi.advanceTimersByTime(2_000))
    unmount()
    expect(toasts.made[0].dismissed).toBe(true)
  })
})
