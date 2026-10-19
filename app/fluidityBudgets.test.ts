import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { check, missed, problems } from "../scripts/fluidity/budgets.mjs"

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
