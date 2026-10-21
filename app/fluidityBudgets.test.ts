import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { check, missed, problems } from "../scripts/fluidity/budgets.mjs"
import { addNet, fingerScroll, netBytes, scrollGesture, sumSelectors, touchStrokes } from "../scripts/fluidity/lib.mjs"

// The fluidity budgets, held whole (Fluidity budgets #6; PLATFORM-LEAD, 17 Oct
// 2026). Every budgets file is sound and registered, every scenario
// scripts/fluidity/run.mjs runs exists, and the one checker decides a run the
// way the budgets say. A broken file fails here, on every quick check, rather
// than the night it runs.

const DIR = "scripts/fluidity"
const registry = JSON.parse(readFileSync(join(DIR, "scenarios.json"), "utf8")) as {
  scenarios: Record<string, { script: string; budgets: string; covers: string[]; needs: string; cpu: number[]; args?: string[]; gate?: boolean }>
}
const scenarios = Object.values(registry.scenarios)
const covered = scenarios.flatMap((s) => s.covers)
const budgetFiles = readdirSync(DIR).filter((f) => f.endsWith("-budgets.json"))

describe("the fluidity budgets", () => {
  it("are each sound: an owner, a source, a max at or above its target, and a scenario that runs", () => {
    const found = budgetFiles.flatMap((f) => (problems(JSON.parse(readFileSync(join(DIR, f), "utf8")), { scenarios: covered }) as string[]).map((p) => `${f}: ${p}`))
    expect(found).toEqual([])
  })

  it("are each run by a registered scenario, and every registration names files that exist", () => {
    expect(budgetFiles.filter((f) => !scenarios.some((s) => s.budgets === f))).toEqual([])
    for (const [name, s] of Object.entries(registry.scenarios)) {
      expect(existsSync(join(DIR, s.script)), `${name}: ${s.script}`).toBe(true)
      expect(existsSync(join(DIR, s.budgets)), `${name}: ${s.budgets}`).toBe(true)
      expect(["build", "fixtures", "demo"], `${name}: needs`).toContain(s.needs)
      expect(s.cpu.length > 0 && s.cpu.every((c) => Number.isInteger(c) && c >= 1), `${name}: cpu`).toBe(true)
      expect(s.covers.length, `${name}: covers`).toBeGreaterThan(0)
    }
  })

  it("gate on something deterministic: what the full gate runs needs only the build", () => {
    const gate = scenarios.filter((s) => s.gate)
    expect(gate.length).toBeGreaterThan(0)
    expect(gate.filter((s) => s.needs !== "build")).toEqual([])
  })
})

describe("the one table of route ceilings", () => {
  const table = JSON.parse(readFileSync(join(DIR, "route-ceilings.json"), "utf8")) as {
    about: string[]
    routes: Record<string, { source?: number; gzipKB?: number; target?: { gzipKB?: number; source?: number }; owner?: string }>
    beyondHome: Record<string, { source: number }>
  }

  it("says what it holds, and every line is a number at or above its target", () => {
    expect(table.about.length).toBeGreaterThan(0)
    const bad: string[] = []
    for (const [file, c] of Object.entries(table.routes)) {
      if (typeof c.source !== "number") bad.push(`${file}: no source ceiling`)
      if (c.gzipKB !== undefined && typeof c.gzipKB !== "number") bad.push(`${file}: gzipKB isn't a number`)
      if (/\/page\.tsx$/.test(file) && typeof c.gzipKB !== "number") bad.push(`${file}: a page with no gzip ceiling`)
      for (const k of ["source", "gzipKB"] as const) {
        const t = c.target?.[k]
        if (t !== undefined && typeof c[k] === "number" && (c[k] as number) < t) bad.push(`${file}: ${k} ${c[k]} under its target ${t}; a met ceiling is its target`)
      }
      if (c.target && !c.owner) bad.push(`${file}: a target with no owner`)
    }
    for (const [file, c] of Object.entries(table.beyondHome)) if (typeof c.source !== "number") bad.push(`beyondHome ${file}: no source ceiling`)
    expect(bad).toEqual([])
  })
})

describe("the one checker", () => {
  const file = {
    about: ["a test"],
    budgets: {
      keyP95Ms: { owner: "A2", source: "a test", scenario: "docs", cpu1: { max: 32, target: 32 }, cpu4: { max: 50, target: 50 } },
      socketsPerTab: { owner: "A2", source: "a test", scenario: "docs", max: 1, target: 1 },
      noisyMs: { owner: "C11", source: "a test", scenario: "docs", enforce: false, max: 10, target: 10 },
      bookingMs: { owner: "B5", source: "a test", scenario: "booking", max: 100, target: 100 },
    },
  }

  it("holds a run to the max at its CPU, and a budget for every CPU at any", () => {
    const rows = check(file, { keyP95Ms: 40, socketsPerTab: 1, noisyMs: 5, bookingMs: 50 }, { cpu: 1 }) as Array<{ metric: string; ok: boolean | null }>
    expect(rows.map((r) => [r.metric, r.ok])).toEqual([["keyP95Ms", false], ["socketsPerTab", true], ["noisyMs", true], ["bookingMs", true]])
    expect((check(file, { keyP95Ms: 40, socketsPerTab: 1, noisyMs: 5, bookingMs: 50 }, { cpu: 4 }) as Array<{ ok: boolean }>)[0].ok).toBe(true)
  })

  it("fails a run on a budget missed or never measured, never on a report-only one", () => {
    expect(missed(check(file, { keyP95Ms: 10, socketsPerTab: 1, noisyMs: 99, bookingMs: 50 }, { cpu: 1 }))).toBe(0)
    expect(missed(check(file, { keyP95Ms: 10, socketsPerTab: 2, noisyMs: 1, bookingMs: 50 }, { cpu: 1 }))).toBe(1)
    // A step that failed in every run has no value: it doesn't pass.
    expect(missed(check(file, { keyP95Ms: 10, noisyMs: 1, bookingMs: 50 }, { cpu: 1 }))).toBe(1)
    // Unless the run never asked for it.
    expect(missed(check(file, { keyP95Ms: 10, noisyMs: 1, bookingMs: 50 }, { cpu: 1, skipMissing: true }))).toBe(0)
  })

  it("checks only the scenarios that ran", () => {
    const rows = check(file, { bookingMs: 500 }, { cpu: 1, scenarios: ["booking"] }) as Array<{ metric: string }>
    expect(rows.map((r) => r.metric)).toEqual(["bookingMs"])
  })

  // A surface the phone doesn't have (the timeline, a board drag, the list's
  // keys) is run on a computer at 4x, and held to a level of its own: the
  // phone's cpu4 is a different device's number (FLUIDITY-LEAD-2, 21 Oct 2026).
  it("holds a device a scenario doesn't run at that slowdown to its own level, never another device's", () => {
    const work = {
      about: ["a test"],
      budgets: {
        dragP95Ms: { owner: "A7", source: "a test", scenario: "work", cpu1: { max: 16.8, target: 16.7 }, desktop4: { max: 40, target: 33.4 } },
        openMs: { owner: "A7", source: "a test", scenario: "work", cpu1: { max: 400, target: 400 }, cpu4: { max: 1000, target: 1000 } },
        rendersPerKey: { owner: "A7", source: "a test", scenario: "work", max: 10, target: 10 },
      },
    }
    type Row = { metric: string; max: number; ok: boolean | null }
    const at = (metrics: Record<string, number>, o: object) => (check(work, metrics, o) as Row[]).map((r) => [r.metric, r.max, r.ok])
    // A computer at 4x where the scenario's 4x is a phone: only its own level.
    expect(at({ dragP95Ms: 35, openMs: 2000, rendersPerKey: 99 }, { cpu: 4, device: "desktop", ownDevice: "phone" })).toEqual([["dragP95Ms", 40, true]])
    // The phone, the scenario's own device at 4x, reads cpu4 and the one max for every CPU, as before.
    expect(at({ dragP95Ms: 35, openMs: 900, rendersPerKey: 9 }, { cpu: 4, device: "phone", ownDevice: "phone" })).toEqual([["openMs", 1000, true], ["rendersPerKey", 10, true]])
    // A scenario that runs a computer at every slowdown (split view's) reads cpu4 for it, and its own level first.
    expect(at({ dragP95Ms: 45, openMs: 900, rendersPerKey: 9 }, { cpu: 4, device: "desktop", ownDevice: "desktop" })).toEqual([["dragP95Ms", 40, false], ["openMs", 1000, true], ["rendersPerKey", 10, true]])
    // Without a device, as run.mjs's older callers ask: unchanged.
    expect(at({ dragP95Ms: 35, openMs: 900, rendersPerKey: 9 }, { cpu: 4 })).toEqual([["openMs", 1000, true], ["rendersPerKey", 10, true]])
    expect(problems(work, { scenarios: ["work"] })).toEqual([])
    const bad = { about: ["a test"], budgets: { y: { owner: "A7", source: "a test", desktop4: { max: "33.4" }, phone1: { max: 5, target: 9 } } } }
    expect(problems(bad)).toEqual(["y.desktop4: max isn't a number", "y.phone1: max 5 is under its target 9; a met budget's max is its target"])
  })

  it("names what is wrong with a budgets file", () => {
    expect(problems(file, { scenarios: ["docs", "booking"] })).toEqual([])
    const broken = { about: [], budgets: { x: { scenario: "nowhere", max: 5, target: 9 } } }
    expect(problems(broken, { scenarios: ["docs"] })).toEqual([
      "no about lines",
      "x: no owner",
      "x: no source",
      'x: scenario "nowhere" isn\'t registered',
      "x: max 5 is under its target 9; a met budget's max is its target",
    ])
  })
})

// A phone's scroll rows are a finger's. On 21 Oct 2026 synthesizeScrollGesture
// with a touch source moved nothing in headless Chromium (0 px on the phone's
// task list in every run), so the phone's scroll rows had been measured with a
// wheel, and a scroll that checked nothing measured an idle page
// (FLUIDITY-LEAD-2). Input.dispatchTouchEvent moves the page as a finger does.
describe("a phone's scroll", () => {
  type Box = { left: number; top: number; right: number; bottom: number }
  type Stroke = { from: { x: number; y: number }; to: { x: number; y: number } }
  const strokes = (o: { box: Box; dx?: number; dy?: number }) => touchStrokes(o) as Stroke[]

  it("is never asked of synthesizeScrollGesture as a touch, which moves nothing headless", async () => {
    const cdp = { send: async () => ({}) }
    await expect(scrollGesture(cdp, { x: 10, y: 10, dy: -100, touch: true })).rejects.toThrow(/fingerScroll/)
  })

  it("is strokes a finger can make inside the scroller's part on screen, as long as the scroll in all", () => {
    const box = { left: 0, top: 339, right: 390, bottom: 780 }
    const down = strokes({ box, dy: 5000 })
    expect(down.length).toBeGreaterThan(1)
    for (const s of down) {
      for (const p of [s.from, s.to]) {
        expect(p.y).toBeGreaterThanOrEqual(box.top)
        expect(p.y).toBeLessThanOrEqual(box.bottom)
        expect(p.x).toBe(195)
      }
      // Scrolling down, the finger moves up.
      expect(s.to.y).toBeLessThan(s.from.y)
    }
    expect(down.reduce((n, s) => n + (s.from.y - s.to.y), 0)).toBe(5000)
    const up = strokes({ box, dy: -800 })
    expect(up.every((s) => s.to.y > s.from.y)).toBe(true)
    expect(up.reduce((n, s) => n + (s.to.y - s.from.y), 0)).toBe(800)
    const right = strokes({ box, dx: 2500 })
    expect(right.every((s) => s.to.x < s.from.x && s.from.y === s.to.y && s.from.x <= box.right && s.to.x >= box.left)).toBe(true)
    expect(right.reduce((n, s) => n + (s.from.x - s.to.x), 0)).toBe(2500)
  })

  it("presses, moves, holds still and lifts each stroke through dispatchTouchEvent, so no fling follows", async () => {
    const sent: Array<{ type: string; y?: number }> = []
    const cdp = {
      send: async (method: string, p: { type: string; touchPoints: Array<{ y: number }> }) => {
        if (method === "Input.dispatchTouchEvent") sent.push({ type: p.type, y: p.touchPoints[0]?.y })
        return {}
      },
    }
    await fingerScroll(cdp, { box: { left: 0, top: 0, right: 390, bottom: 844 }, dy: 300, speed: 6000, stepMs: 1, holdMs: 1, gapMs: 1 })
    expect(sent[0].type).toBe("touchStart")
    expect(sent.at(-1)?.type).toBe("touchEnd")
    const moves = sent.filter((e) => e.type === "touchMove")
    expect(moves.length).toBeGreaterThan(1)
    expect(moves.at(-1)?.y).toBe(moves.at(-2)?.y)
    expect((sent[0].y ?? 0) - (moves.at(-1)?.y ?? 0)).toBe(300)
  })
})

// The phone list's style cost was about 50 µs an element (FLUIDITY-LEAD,
// 20 Oct); Chromium's SelectorStats trace events say which selectors take it.
describe("selector stats", () => {
  it("sum each selector's matching time over every style recalculation, slowest first", () => {
    const recalc = (timings: Array<[string, number, number, number]>) => ({
      name: "SelectorStats",
      args: { selector_stats: { selector_timings: timings.map(([selector, us, attempts, matches]) => ({ selector, style_sheet_id: "s1", "elapsed (us)": us, match_attempts: attempts, match_count: matches, fast_reject_count: 0 })) } },
    })
    const out = sumSelectors([recalc([["html[data-dragging] *", 900, 3000, 3000], [".row:has(.badge)", 300, 3000, 10]]), recalc([["html[data-dragging] *", 1200, 3000, 3000]])], 5) as {
      recalcs: number
      totalMs: number
      top: Array<{ selector: string; us: number; attempts: number; matches: number }>
    }
    expect(out.recalcs).toBe(2)
    expect(out.totalMs).toBe(2.4)
    expect(out.top.map((t) => [t.selector, t.us, t.attempts, t.matches])).toEqual([
      ["html[data-dragging] *", 2100, 6000, 6000],
      [".row:has(.badge)", 300, 3000, 10],
    ])
  })
})

// A step's script bytes are told apart: until its content is useful, and in
// its settle after (what a page warms once quiet), with the biggest files named
// (PLATFORM-LEAD-2's question on fluid-15, 21 Oct 2026).
describe("a step's bytes", () => {
  it("name the biggest scripts, and add up across a step's two takes", async () => {
    const on: Record<string, (e: unknown) => void> = {}
    const cdp = { send: async () => ({}), on: (event: string, fn: (e: unknown) => void) => void (on[event] = fn) }
    const net = (await netBytes(cdp)) as { take: () => { scriptKB: number; scripts: number; topScripts: Array<{ file: string; kb: number }> } }
    const fetched = (id: string, url: string, type: string, bytes: number) => {
      on["Network.responseReceived"]({ requestId: id, type, response: { url } })
      on["Network.loadingFinished"]({ requestId: id, encodedDataLength: bytes })
    }
    fetched("1", "http://localhost:3471/_next/static/chunks/app.js", "Script", 300 * 1024)
    fetched("2", "http://localhost:3471/_next/static/chunks/home.js", "Script", 100 * 1024)
    fetched("3", "http://localhost:3471/api/x", "XHR", 50 * 1024)
    const ready = net.take()
    expect(ready.scriptKB).toBe(400)
    expect(ready.topScripts).toEqual([
      { file: "chunks/app.js", kb: 300 },
      { file: "chunks/home.js", kb: 100 },
    ])
    fetched("4", "http://localhost:3471/_next/static/chunks/settings.js", "Script", 156 * 1024)
    const warm = net.take()
    const all = addNet(ready, warm) as { scriptKB: number; scripts: number; topScripts: Array<{ file: string }> }
    expect(all.scriptKB).toBe(556)
    expect(all.scripts).toBe(3)
    expect(all.topScripts.map((t) => t.file)).toEqual(["chunks/app.js", "chunks/settings.js", "chunks/home.js"])
  })
})
