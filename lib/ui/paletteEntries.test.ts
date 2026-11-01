import { afterEach, describe, expect, it, vi } from "vitest"
import { offerPaletteEntries } from "./paletteEntries"
import { forgetPaletteCode, loadPaletteSurfaces, paletteSurfaces } from "./paletteSurfaces"

// One list of what the open surfaces offer the palette (a doc's actions, the
// open task's), so every surface reaches the palette the same way (linear-28).

const stops: Array<() => void> = []
afterEach(() => {
  while (stops.length) stops.pop()!()
  forgetPaletteCode()
  vi.restoreAllMocks()
})

const entry = (id: string) => ({ id, label: id, keywords: [], run: () => {} })

describe("the palette's surfaces", () => {
  it("lists what each open surface offers, the newest first", () => {
    stops.push(offerPaletteEntries({ id: "doc", group: "This doc", entries: () => [entry("history")] }))
    stops.push(offerPaletteEntries({ id: "task", group: "This task", lead: true, entries: () => [entry("priority")] }))
    expect(paletteSurfaces().map((s) => [s.id, s.group, s.lead, s.entries.map((e) => e.id)])).toEqual([
      ["task", "This task", true, ["priority"]],
      ["doc", "This doc", false, ["history"]],
    ])
  })

  it("reads a surface's actions as the palette opens, not as it was offered", () => {
    let label = "Set priority…"
    stops.push(offerPaletteEntries({ id: "task", group: "This task", entries: () => [{ ...entry("priority"), label }] }))
    label = "Set priority (Urgent)…"
    expect(paletteSurfaces()[0].entries[0].label).toBe("Set priority (Urgent)…")
  })

  it("forgets a surface once it stops, and a stop twice does nothing", () => {
    const stopDoc = offerPaletteEntries({ id: "doc", group: "This doc", entries: () => [entry("history")] })
    stops.push(offerPaletteEntries({ id: "task", group: "This task", entries: () => [entry("status")] }))
    stopDoc()
    stopDoc()
    expect(paletteSurfaces().map((s) => s.id)).toEqual(["task"])
  })

  it("leaves out a surface with nothing to offer, and one whose actions fail", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    stops.push(offerPaletteEntries({ id: "doc", group: "This doc", entries: () => [] }))
    stops.push(offerPaletteEntries({ id: "broken", group: "Broken", entries: () => { throw new Error("gone") } }))
    stops.push(offerPaletteEntries({ id: "task", group: "This task", entries: () => [entry("status")] }))
    expect(paletteSurfaces().map((s) => s.id)).toEqual(["task"])
    expect(error).toHaveBeenCalledTimes(1)
  })

  it("lists a surface whose actions are a chunk of their own once its code has come, and fetches one id's code once", async () => {
    const load = vi.fn(() => Promise.resolve({ make: () => [entry("priority")] }))
    const stopFirst = offerPaletteEntries({ id: "task", group: "This task", load, entries: (code) => code.make() })
    expect(paletteSurfaces()).toEqual([])
    expect(await loadPaletteSurfaces()).toBe(true)
    expect(paletteSurfaces().map((s) => [s.id, s.entries.map((e) => e.id)])).toEqual([["task", ["priority"]]])
    // The next task's offer is listed at once: its code came with the first.
    stopFirst()
    stops.push(offerPaletteEntries({ id: "task", group: "This task", load, entries: (code) => code.make() }))
    expect(paletteSurfaces().map((s) => s.id)).toEqual(["task"])
    expect(await loadPaletteSurfaces()).toBe(false)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("leaves out a surface whose code didn't come, which is logged, and asks again on the next open", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const load = vi
      .fn<() => Promise<{ make: () => Array<ReturnType<typeof entry>> }>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ make: () => [entry("priority")] })
    stops.push(offerPaletteEntries({ id: "task", group: "This task", load, entries: (code) => code.make() }))
    expect(await loadPaletteSurfaces()).toBe(false)
    expect(paletteSurfaces()).toEqual([])
    expect(error).toHaveBeenCalledTimes(1)
    expect(await loadPaletteSurfaces()).toBe(true)
    expect(paletteSurfaces().map((s) => s.id)).toEqual(["task"])
  })
})
