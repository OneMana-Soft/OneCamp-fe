import { describe, expect, it } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useEditInPlace } from "./useEditInPlace"

// F-06: a message edit whose save failed closed and put the old words back,
// and what was typed was gone.
describe("an edit in place", () => {
  it("closes on Save, and opens again holding what was typed when the save fails", async () => {
    let answer!: (saved: boolean) => void
    const save = () => new Promise<boolean>((resolve) => (answer = resolve))
    const { result } = renderHook(() => useEditInPlace(save))
    act(() => result.current.open())
    expect(result.current.editing).toBe(true)

    act(() => result.current.finish("<p>Ship it Friday</p>"))
    expect(result.current.editing).toBe(false)
    await act(async () => answer(false))
    expect(result.current).toMatchObject({ editing: true, draft: "<p>Ship it Friday</p>" })

    // Cancelling then drops what failed.
    act(() => result.current.cancel())
    expect(result.current).toMatchObject({ editing: false, draft: undefined })
  })

  it("stays closed when the save goes through, or when the host says nothing", async () => {
    const saved = renderHook(() => useEditInPlace(async () => true))
    await act(async () => saved.result.current.finish("<p>ok</p>"))
    expect(saved.result.current).toMatchObject({ editing: false, draft: undefined })

    const quiet = renderHook(() => useEditInPlace(() => undefined))
    await act(async () => quiet.result.current.finish("<p>ok</p>"))
    expect(quiet.result.current.editing).toBe(false)
  })

  it("opens fresh, without an old failed draft", async () => {
    const { result } = renderHook(() => useEditInPlace(async () => false))
    await act(async () => result.current.finish("<p>typed</p>"))
    expect(result.current.draft).toBe("<p>typed</p>")
    act(() => result.current.cancel())
    act(() => result.current.open())
    expect(result.current).toMatchObject({ editing: true, draft: undefined })
  })
})
