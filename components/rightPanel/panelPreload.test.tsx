import { readFileSync } from "node:fs"
import { join } from "node:path"

import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The right panel's code is fetched ahead of its first open (fluid-18,
// FLUIDITY-LEAD 20 Oct 2026). The preload lived in RightPanel, which the shell
// mounts only while the panel is open, so it never ran before the first open:
// a task's first panel waited for 441 KB of code in 21 chunks at the click
// (437 ms at 1x on fixtures).
const threads = vi.hoisted(() => ({ preloaded: 0 }))
const router = vi.hoisted(() => ({ prefetch: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => router }))
vi.mock("@/components/conversation/ThreadPanel", () => ({ ThreadPanel: () => null, preloadThreadPanels: () => void threads.preloaded++ }))

type Panel = typeof import("@/components/rightPanel/rightPanel")
let PreloadPanels: Panel["PreloadPanels"]
let PRELOAD_AFTER_MS: number
let panelLoaders: Panel["panelLoaders"]
let QUIET_MS: number

/** Each panel's loader, watched: it is called when its code is fetched. */
function watchLoaders() {
  return Object.keys(panelLoaders).map((k) => vi.spyOn(panelLoaders, k as keyof typeof panelLoaders).mockResolvedValue({} as never))
}
const calls = (loads: ReturnType<typeof watchLoaders>) => loads.map((l) => l.mock.calls.length)

/** Lets `ms` pass, settling promises on the way (a loader's, the quiet module's import). */
async function pass(ms: number) {
  for (let left = ms; left > 0; left -= 10) await act(async () => void vi.advanceTimersByTime(Math.min(10, left)))
}

beforeEach(async () => {
  threads.preloaded = 0
  router.prefetch.mockReset()
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] })
  // The idle moment comes at once.
  vi.stubGlobal("requestIdleCallback", (cb: () => void) => setTimeout(cb, 0) as unknown as number)
  vi.stubGlobal("cancelIdleCallback", (id: number) => clearTimeout(id))
  // Fresh modules: the fake clock starts again, and no earlier press counts.
  vi.resetModules()
  ;({ PreloadPanels, PRELOAD_AFTER_MS, panelLoaders } = await import("@/components/rightPanel/rightPanel"))
  ;({ QUIET_MS } = await import("@/lib/ui/whenQuiet"))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("the right panel's code, fetched ahead", () => {
  // The first test pays for loading rightPanel's modules: on a busy machine that took 10 s.
  it("is fetched once the page is quiet after the first press, one panel at a time", { timeout: 30000 }, async () => {
    const loads = watchLoaders()
    render(<PreloadPanels />)
    expect(calls(loads).every((n) => n === 0)).toBe(true)
    fireEvent.pointerDown(window)
    await vi.dynamicImportSettled()
    // Not on the frames of what the press started (the calendar's open, G then K).
    await pass(QUIET_MS - 50)
    expect(calls(loads).every((n) => n === 0)).toBe(true)
    await pass(60)
    // One fetch alone (the inbox's route comes first): each in an idle moment of its own.
    expect(router.prefetch.mock.calls.length + calls(loads).reduce((a, b) => a + b, 0)).toBe(1)
    await pass(300)
    expect(calls(loads)).toEqual(loads.map(() => 1))
    expect(threads.preloaded).toBe(1)
  })

  it("waits again for every key that comes while it waits", async () => {
    const loads = watchLoaders()
    render(<PreloadPanels />)
    fireEvent.keyDown(window, { key: "g" })
    await vi.dynamicImportSettled()
    await pass(QUIET_MS / 2)
    fireEvent.keyDown(window, { key: "k" })
    await pass(QUIET_MS - 50)
    expect(calls(loads).every((n) => n === 0)).toBe(true)
    await pass(300)
    expect(calls(loads)).toEqual(loads.map(() => 1))
  })

  it("is fetched after a while when nobody presses anything", async () => {
    const loads = watchLoaders()
    render(<PreloadPanels />)
    await pass(PRELOAD_AFTER_MS - 10)
    expect(calls(loads).every((n) => n === 0)).toBe(true)
    await pass(20)
    await vi.dynamicImportSettled()
    await pass(QUIET_MS + 300)
    expect(calls(loads)).toEqual(loads.map(() => 1))
    expect(threads.preloaded).toBe(1)
  })

  // The inbox's code (210 KB) and Settings' (161 KB) came only at the press
  // (fluid-02, fluid-14): they are fetched first, in the same quiet moments.
  it("fetches the inbox's and Settings' routes first, once the page is quiet", async () => {
    const loads = watchLoaders()
    render(<PreloadPanels />)
    fireEvent.pointerDown(window)
    await vi.dynamicImportSettled()
    await pass(QUIET_MS - 50)
    expect(router.prefetch).not.toHaveBeenCalled()
    await pass(400)
    expect(router.prefetch.mock.calls.map((c) => c[0])).toEqual(["/app/inbox", "/app/settings"])
    // In full, with the page's own code, as IntentLink's prefetch={true}: "auto" left it for the press.
    expect(router.prefetch.mock.calls.every((c) => c[1]?.kind === "full")).toBe(true)
    const firstPanel = Math.min(...loads.map((l) => l.mock.invocationCallOrder[0]))
    expect(Math.max(...router.prefetch.mock.invocationCallOrder)).toBeLessThan(firstPanel)
  })

  it("is mounted by the shell beside the page, never inside the open panel", () => {
    const root = join(__dirname, "..", "..")
    const layout = readFileSync(join(root, "app/app/LayoutContent.tsx"), "utf8")
    const panel = readFileSync(join(root, "components/rightPanel/rightPanel.tsx"), "utf8")
    // The shell mounts it once, outside the `rightPanelState.isOpen &&`
    // branch that holds the panel. A tablet draws the same shell: split view
    // folded the tablet's own return into it (21 Oct).
    expect(layout.match(/<PreloadPanels \/>/g)?.length).toBe(1)
    const openBranch = layout.slice(layout.indexOf("{rightPanelState.isOpen && ("))
    expect(openBranch.slice(0, openBranch.indexOf("</ResizablePanel>"))).not.toMatch(/PreloadPanels/)
    // One preload: RightPanel no longer holds its own.
    expect(panel.slice(panel.indexOf("export const RightPanel"))).not.toMatch(/usePreloadPanels\(\)/)
  })
})
