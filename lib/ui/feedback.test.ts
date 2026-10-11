import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FEEDBACK, REDUCED_FRAMES, REDUCED_MS, VIBRATE_KEY, feedback, setVibration, vibrationOn } from "./feedback"

// Design v3, mobile F3: one vocabulary for "haptic" moments, the visual
// signature everywhere and a vibration where Android has one.

const ROOT = join(__dirname, "..", "..")

function mockMotion(reduced: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: reduced && q.includes("reduce"),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
}

describe("feedback, the table", () => {
  it("pins Apple's five types to their signatures and vibrations", () => {
    expect(Object.keys(FEEDBACK)).toEqual(["selection", "impact", "medium", "success", "warning"])
    expect(FEEDBACK.selection.frames).toEqual([{ transform: "scale(1)" }, { transform: "scale(1.06)" }, { transform: "scale(1)" }])
    expect(FEEDBACK.selection.vibrate).toBe(8)
    expect(FEEDBACK.impact.frames[0]).toEqual({ transform: "scale(0.97)" })
    expect(FEEDBACK.impact.duration).toBe(260)
    expect(FEEDBACK.impact.vibrate).toBe(12)
    expect(FEEDBACK.medium.frames[1]).toEqual({ transform: "scale(1.18)" })
    expect(FEEDBACK.medium.vibrate).toBe(15)
    expect(FEEDBACK.success.frames[1]).toEqual({ transform: "scale(1.12)" })
    expect(FEEDBACK.success.vibrate).toEqual([10, 40, 10])
    expect(FEEDBACK.warning.frames.map((f) => f.transform)).toEqual([0, -3, 3, -2, 2, 0].map((x) => `translateX(${x}px)`))
    expect(FEEDBACK.warning.duration).toBe(240)
    expect(FEEDBACK.warning.vibrate).toEqual([30, 40, 30])
  })

  it("moves only transform (the compositor's), never layout", () => {
    for (const sig of Object.values(FEEDBACK)) {
      for (const f of sig.frames) expect(Object.keys(f)).toEqual(["transform"])
    }
  })
})

describe("feedback, played", () => {
  let vibrate: ReturnType<typeof vi.fn>
  let animate: ReturnType<typeof vi.fn>
  beforeEach(() => {
    vibrate = vi.fn()
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true })
    animate = vi.fn()
    Element.prototype.animate = animate as unknown as Element["animate"]
    localStorage.removeItem(VIBRATE_KEY)
  })
  afterEach(() => {
    localStorage.removeItem(VIBRATE_KEY)
  })

  it("animates the element and vibrates", () => {
    mockMotion(false)
    const el = document.createElement("span")
    feedback("success", el)
    expect(vibrate).toHaveBeenCalledWith([10, 40, 10])
    expect(animate).toHaveBeenCalledWith(FEEDBACK.success.frames, { duration: 220, easing: FEEDBACK.success.easing })
  })

  it("blinks instead of scaling under reduced motion, and still vibrates", () => {
    mockMotion(true)
    const el = document.createElement("span")
    feedback("warning", el)
    expect(animate).toHaveBeenCalledWith(REDUCED_FRAMES, { duration: REDUCED_MS, easing: "linear" })
    expect(vibrate).toHaveBeenCalledWith([30, 40, 30])
  })

  it("keeps quiet when the person turned vibration off", () => {
    mockMotion(false)
    setVibration(false)
    expect(vibrationOn()).toBe(false)
    feedback("selection")
    expect(vibrate).not.toHaveBeenCalled()
    setVibration(true)
    expect(vibrationOn()).toBe(true)
  })
})

/**
 * Files from the area waves that still call navigator.vibrate themselves.
 * Empty since the integration (11 Oct): chat's long-press sheet, work's task
 * check and swipe, and the celebration tiers all call feedback(). The list
 * only shrinks.
 */
const NOT_YET_ON_FEEDBACK = new Set<string>([])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(p)
  }
  return out
}

describe("one way to vibrate", () => {
  it("is feedback(): nothing else calls navigator.vibrate", () => {
    const offenders: string[] = []
    for (const dir of ["app", "components", "hooks", "lib", "context", "store"]) {
      for (const file of walk(join(ROOT, dir))) {
        const rel = relative(ROOT, file)
        if (rel === "lib/ui/feedback.ts" || NOT_YET_ON_FEEDBACK.has(rel)) continue
        if (/\bvibrate\s*\??\.?\s*\(/.test(readFileSync(file, "utf8"))) offenders.push(rel)
      }
    }
    expect(offenders, "call feedback() from lib/ui/feedback.ts instead").toEqual([])
  })
})
