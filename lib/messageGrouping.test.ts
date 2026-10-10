import { describe, expect, it } from "vitest"
import { continuedFlags, continuesFrom, GROUP_WINDOW_MS, withContinuation } from "./messageGrouping"
import type { FlatItem } from "@/types/virtual"

type Msg = { id: string; by: string; at: string; bot?: boolean; reply?: boolean; body?: string; reactions?: number }

const t0 = Date.parse("2026-10-10T09:00:00Z")
const at = (minutes: number) => new Date(t0 + minutes * 60_000).toISOString()
const g = (m: Msg) => ({ author: m.by, at: m.at, isBot: m.bot, standalone: m.reply })

function flat(days: Msg[][]): FlatItem<Msg>[] {
  return days.flatMap((day, i) => [
    { type: "separator" as const, date: `d${i}`, key: `separator${i}` },
    ...day.map((m) => ({ type: "item" as const, data: m, key: m.id })),
  ])
}
const flags = (items: FlatItem<Msg>[]) => items.filter((i) => i.type === "item").map((i) => !!i.continued)

describe("continuesFrom", () => {
  it("joins the same person within five minutes, inclusive", () => {
    expect(continuesFrom(g({ id: "a", by: "u1", at: at(0) }), g({ id: "b", by: "u1", at: at(5) }))).toBe(true)
    expect(GROUP_WINDOW_MS).toBe(300_000)
  })

  it("starts a new group after five minutes, for another person, or with no one above", () => {
    expect(continuesFrom(g({ id: "a", by: "u1", at: at(0) }), g({ id: "b", by: "u1", at: at(5.01) }))).toBe(false)
    expect(continuesFrom(g({ id: "a", by: "u1", at: at(0) }), g({ id: "b", by: "u2", at: at(1) }))).toBe(false)
    expect(continuesFrom(null, g({ id: "b", by: "u1", at: at(1) }))).toBe(false)
  })

  it("never groups a bot, which speaks for many people, or a reply, which quotes another message", () => {
    expect(continuesFrom(g({ id: "a", by: "bot", at: at(0), bot: true }), g({ id: "b", by: "bot", at: at(1), bot: true }))).toBe(false)
    expect(continuesFrom(g({ id: "a", by: "u1", at: at(0) }), g({ id: "b", by: "u1", at: at(1), reply: true }))).toBe(false)
  })

  it("does not join when the order or the time can't be trusted", () => {
    expect(continuesFrom(g({ id: "a", by: "u1", at: at(3) }), g({ id: "b", by: "u1", at: at(1) }))).toBe(false)
    expect(continuesFrom(g({ id: "a", by: "u1", at: "" }), g({ id: "b", by: "u1", at: at(1) }))).toBe(false)
    expect(continuesFrom({ author: "u1", at: "not a date" }, { author: "u1", at: at(0) })).toBe(false)
  })

  it("reads epoch seconds as the API sometimes sends them", () => {
    const s = Math.floor(t0 / 1000)
    expect(continuesFrom({ author: "u1", at: s }, { author: "u1", at: s + 120 })).toBe(true)
    expect(continuesFrom({ author: "u1", at: s }, { author: "u1", at: s + 301 })).toBe(false)
  })
})

describe("withContinuation", () => {
  const day = [
    { id: "1", by: "maya", at: at(0) },
    { id: "2", by: "maya", at: at(1) },
    { id: "3", by: "maya", at: at(2) },
    { id: "4", by: "sam", at: at(3) },
    { id: "5", by: "maya", at: at(4) },
  ]

  it("marks the second and later messages of a turn", () => {
    expect(flags(withContinuation(flat([day]), g))).toEqual([false, true, true, false, false])
  })

  it("starts a group under every day heading, even for the same person a minute later", () => {
    const items = withContinuation(flat([[{ id: "1", by: "maya", at: at(0) }], [{ id: "2", by: "maya", at: at(1) }]]), g)
    expect(flags(items)).toEqual([false, false])
  })

  it("keeps earlier flags when a message arrives live at the end", () => {
    const before = flags(withContinuation(flat([day]), g))
    const after = flags(withContinuation(flat([[...day, { id: "6", by: "maya", at: at(4.5) }]]), g))
    expect(after.slice(0, before.length)).toEqual(before)
    expect(after.at(-1)).toBe(true)
  })

  it("regroups when a message in the middle is deleted", () => {
    // Without Sam's message, Maya's fifth continues her third.
    const without = day.filter((m) => m.id !== "4")
    expect(flags(withContinuation(flat([without]), g))).toEqual([false, true, true, true])
  })

  it("does not change when a message is edited or reacted to", () => {
    const edited = day.map((m) => (m.id === "2" ? { ...m, body: "edited", reactions: 3 } : m))
    expect(flags(withContinuation(flat([edited]), g))).toEqual(flags(withContinuation(flat([day]), g)))
  })

  it("leaves items that start a group as the same objects, so their rows need not re-render", () => {
    const items = flat([day])
    const out = withContinuation(items, g)
    expect(out[1]).toBe(items[1])
    expect(out[0]).toBe(items[0])
  })
})

describe("continuedFlags", () => {
  it("does the same for a thread's replies", () => {
    const replies = [
      { id: "r1", by: "maya", at: at(0) },
      { id: "r2", by: "maya", at: at(2) },
      { id: "r3", by: "jonas", at: at(3) },
      { id: "r4", by: "jonas", at: at(20) },
    ]
    expect(continuedFlags(replies, g)).toEqual([false, true, false, false])
  })
})
