import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"

// A page reads the store once: each case starts it afresh from what storage holds.
type Module = typeof import("./choices")
let m: Module
const fresh = async () => {
  vi.resetModules()
  m = await import("./choices")
}
const view = () => renderHook(() => m.useCalendarChoices()).result.current.view
const KEY = "onecamp:calendar-view"
const DEFAULTS = { span: "4d", density: "comfortable", weekends: true, weekNumbers: false, weekStartsOn: 1 }

beforeEach(async () => {
  localStorage.clear()
  await fresh()
})

describe("how the views are laid out, on this device", () => {
  it("is the defaults until chosen", () => {
    expect(view()).toEqual(DEFAULTS)
  })

  it("keeps only what is well formed", async () => {
    localStorage.setItem(KEY, JSON.stringify({ span: "2w", density: "fit", weekends: false, weekNumbers: true, weekStartsOn: 0 }))
    await fresh()
    expect(view()).toEqual({ span: "2w", density: "fit", weekends: false, weekNumbers: true, weekStartsOn: 0 })
    for (const bad of [JSON.stringify({ span: "9d", density: "huge", weekends: "no", weekStartsOn: 3 }), "{not json", "null", "5"]) {
      localStorage.setItem(KEY, bad)
      await fresh()
      expect(view(), bad).toEqual(DEFAULTS)
    }
  })

  it("keeps a choice for next time, and redraws whatever shows it", () => {
    const shown = renderHook(() => m.useCalendarChoices())
    act(() => m.choose((c) => ({ view: { ...c.view, density: "compact", weekStartsOn: 0 } })))
    expect(shown.result.current.view).toMatchObject({ density: "compact", weekStartsOn: 0, span: "4d" })
    expect(JSON.parse(localStorage.getItem(KEY) ?? "{}")).toMatchObject({ density: "compact", weekStartsOn: 0 })
    // The calendars' own choices are left as they were.
    expect(localStorage.getItem("onecamp:calendars-hidden")).toBeNull()
  })
})
