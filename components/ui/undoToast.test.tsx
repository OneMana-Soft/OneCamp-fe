import { act, renderHook } from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

// What Undo says once it has run. A retry-later answer (503: the server kept
// the work and asks for another go, as a status whose restore didn't finish
// does) offers Retry, which runs the same undo again. Any other refusal says
// why, with nothing to retry.

const say = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ toast: say, useToast: () => ({ toast: say }) }))

const { offerRetry, useUndoToast } = await import("@/components/ui/undoToast")

type Shown = { title: string; description?: string; variant?: string; action?: ReactElement<{ altText: string; onClick: (e: { detail: number }) => unknown }> }
const shown = (i: number) => say.mock.calls[i][0] as Shown
// A pointer's press (detail 1); the keyboard's is detail 0.
const press = async (i: number, detail = 1) => act(async () => { await shown(i).action!.props.onClick({ detail }) })
const refusal = (status: number, msg: string) => Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: { msg } } })

afterEach(() => say.mockReset())

describe("useUndoToast", () => {
  it("offers Retry on a 503, which runs the undo again; once it goes through, it says Undone", async () => {
    const unfinished = "The status is back, but its restore didn't finish. Try again in a moment."
    const undo = vi.fn().mockRejectedValueOnce(refusal(503, unfinished)).mockResolvedValueOnce(undefined)
    const onDone = vi.fn()
    const { result } = renderHook(() => useUndoToast(onDone))
    act(() => result.current("Deleted QA", undo))
    expect(shown(0)).toMatchObject({ title: "Deleted QA" })

    await press(0)
    expect(shown(1)).toMatchObject({ title: "Undo didn't finish", description: unfinished, variant: "destructive" })
    expect(shown(1).action!.props.altText).toBe("Retry")

    await press(1)
    expect(undo).toHaveBeenCalledTimes(2)
    expect(shown(2)).toMatchObject({ title: "Undone" })
    expect(onDone).toHaveBeenCalledTimes(2)
  })

  it("says why on any other refusal, with nothing to retry", async () => {
    const undo = vi.fn().mockRejectedValue(refusal(409, "A field named Budget is already here."))
    const { result } = renderHook(() => useUndoToast())
    act(() => result.current("Deleted Budget", undo))
    await press(0)
    expect(shown(1)).toMatchObject({ title: "Couldn't undo that", description: "A field named Budget is already here.", variant: "destructive" })
    expect(shown(1).action).toBeUndefined()
  })
})

// A write the server asked to have again later, offered back (V-583, V-617).
// One that holds work nothing else on screen shows (a paste's new rows,
// DESIGN-BUILD-129's F1a) stays until the person acts: Retry or its x, with no
// timer. Any other keeps the timed offer (8 s for an error with an action).
describe("offerRetry", () => {
  it("stays with no timer when asked to, keeps the timed offer otherwise, and hands back its toast", async () => {
    const handle = { id: "1", dismiss: vi.fn() }
    say.mockReturnValue(handle)
    const retry = vi.fn()
    expect(offerRetry("Not saved", "1 new row wasn't added. Try again in a moment.", retry, true)).toBe(handle)
    expect(shown(0)).toMatchObject({ title: "Not saved", variant: "destructive", duration: Infinity })
    offerRetry("Not saved", "Try again in a moment.", retry)
    expect((shown(1) as Shown & { duration?: number }).duration).toBeUndefined()
    await press(0)
    expect(retry).toHaveBeenCalledTimes(1)
  })

  // DESIGN-BUILD-129's F2: Retry pressed from the keyboard (⌥T, Tab, Enter) hands the focus back to where it was as
  // the toast came, so the toast's close leaves it there, never on the page; a pointer's press moves none.
  it("hands the focus back to where it was as the toast came when Retry is pressed from the keyboard", async () => {
    const cell = document.createElement("div")
    cell.tabIndex = 0
    document.body.append(cell)
    cell.focus()
    offerRetry("Not saved", "Try again in a moment.", vi.fn())
    const away = document.createElement("button")
    document.body.append(away)
    away.focus()
    await press(0)
    expect(document.activeElement).toBe(away)
    await press(0, 0)
    expect(document.activeElement).toBe(cell)
    cell.remove()
    away.remove()
  })
})
