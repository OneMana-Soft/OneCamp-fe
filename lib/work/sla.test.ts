import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SLA_SORT, SLA_TONES, slaLabel, slaBand, slaFilterWords, slaShown, slaTone, slaWords } from "./sla"
import { NO_SLA, SLA_CHOICES, TASK_SLA } from "./slaFilter"

const now = new Date("2026-11-14T10:00:00Z")
const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000).toISOString()

// The clock every date here is written against (app/testClock).
beforeEach(() => vi.useFakeTimers({ now: new Date("2026-11-14T10:00:00Z") }))
afterEach(() => vi.useRealTimers())

describe("an SLA in words and tones (linear-24 W1)", () => {
  it("bands a running timer as Linear does: high is the server's at risk, medium the stretch as long as the warning just before it, low the rest", () => {
    // Due in 24 h, at risk from 18 h: the warning lasts 6 h, so medium starts 6 h before it, at 12 h.
    expect(slaBand({ state: "on_track", due_at: at(24), risk_at: at(18) }, now)).toBe("low")
    expect(slaBand({ state: "on_track", due_at: at(10), risk_at: at(4) }, now)).toBe("medium")
    expect(slaBand({ state: "at_risk", due_at: at(3), risk_at: at(-3) }, now)).toBe("high")
    expect(slaBand({ state: "breached", due_at: at(-2) }, now)).toBe("breached")
    expect(slaBand({ state: "met" }, now)).toBe("met")
    // No times: the server's word stands.
    expect(slaBand({ state: "on_track" }, now)).toBe("low")
  })

  it("says the time left, or how long ago it was breached, short for the chip and whole for its tip", () => {
    expect(slaWords({ state: "on_track", due_at: at(50), risk_at: at(26) }, now)).toEqual({ short: "2d", long: "SLA: 2 days left" })
    expect(slaWords({ state: "at_risk", due_at: at(3), risk_at: at(-1) }, now)).toEqual({ short: "3h", long: "SLA at risk: 3 hours left" })
    expect(slaWords({ state: "on_track", due_at: at(0.5), risk_at: at(0.25) }, now).short).toBe("30m")
    expect(slaWords({ state: "breached", due_at: at(-1) }, now)).toEqual({ short: "Breached", long: "SLA breached 1 hour ago" })
    expect(slaWords({ state: "met" }, now)).toEqual({ short: "Met", long: "SLA met" })
  })

  it("draws breached in danger, high risk in warning, medium in sun, low quiet, and a finished task's SLA with no colour", () => {
    expect(slaTone("breached")).toBe("danger")
    expect(slaTone("high")).toBe("warning")
    expect(slaTone("medium")).toBe("sun")
    expect(slaTone("low")).toBe("quiet")
    expect(slaTone("breached", true)).toBe("done")
  })

  it("shows a chip only for a task whose SLA the server sent and that the reader may read, and never for one met", () => {
    expect(slaShown({ state: "at_risk" })).toBe(true)
    expect(slaShown({ state: "met" })).toBe(false)
    expect(slaShown(undefined)).toBe(false)
    expect(slaShown({ state: "breached" }, true)).toBe(false)
  })
})

describe("the SLA filter and sort (linear-24 H3's ids)", () => {
  it("sends task_sla with the server's states and none, breaches first, and names them in words", () => {
    expect(TASK_SLA).toBe("task_sla")
    expect(SLA_CHOICES.map((c) => c.key)).toEqual(["breached", "at_risk", "on_track", "met", NO_SLA])
    expect(slaFilterWords(["breached", NO_SLA])).toBe("Breached, No SLA")
    expect(SLA_SORT).toEqual({ id: "task_sla", desc: false, label: "SLA, breaches soonest" })
  })
})

describe("one SLA state map (W1 FIX A, B)", () => {
  it("gives each state its words and tone, read by the chip, the Filter's dot and the group header", () => {
    expect(SLA_CHOICES.map((c) => [c.key, c.label, c.tone])).toEqual([
      ["breached", "Breached", "danger"], ["at_risk", "At risk", "warning"], ["on_track", "On track", "quiet"], ["met", "Met", "met"], [NO_SLA, "No SLA", "none"],
    ])
    // Met is one colour, on the chip and the dot alike.
    expect(slaTone("met")).toBe("met")
    expect(SLA_TONES.met.chip).toContain("success-ink")
    expect(SLA_TONES.met.dot).toContain("success-ink")
  })

  it("tells at risk from on track by more than hue: its own glyph and a diamond dot", () => {
    expect(SLA_TONES.warning.alert).toBe(true)
    expect(SLA_TONES.sun.alert).toBeUndefined()
    expect(SLA_TONES.quiet.alert).toBeUndefined()
    expect(SLA_TONES.warning.dot).toContain("rotate-45")
    expect(SLA_TONES.sun.dot).toContain("rounded-full")
  })

  it("takes its words from SLA_CHOICES, never a copy of its own", () => {
    expect(slaLabel("at_risk")).toBe("At risk")
    expect(slaWords({ state: "at_risk" }).short).toBe("At risk")
    expect(slaWords({ state: "on_track" }).short).toBe("On track")
    expect(slaWords({ state: "met" })).toEqual({ short: "Met", long: "SLA met" })
    expect(slaWords({ state: "breached" }).short).toBe("Breached")
  })
})
