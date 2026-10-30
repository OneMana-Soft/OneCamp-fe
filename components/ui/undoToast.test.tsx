import { act, renderHook } from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

// What Undo says once it has run. A retry-later answer (503: the server kept
// the work and asks for another go, as a status whose restore didn't finish
// does) offers Retry, which runs the same undo again. Any other refusal says
// why, with nothing to retry.

const say = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ toast: say, useToast: () => ({ toast: say }) }))

const { useUndoToast } = await import("@/components/ui/undoToast")

type Shown = { title: string; description?: string; variant?: string; action?: ReactElement<{ altText: string; onClick: () => unknown }> }
const shown = (i: number) => say.mock.calls[i][0] as Shown
const press = async (i: number) => act(async () => { await shown(i).action!.props.onClick() })
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
