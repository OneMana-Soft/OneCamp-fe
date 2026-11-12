import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { configureStore } from "@reduxjs/toolkit"

import nudgeSlice, { setNudges } from "@/store/slice/nudgeSlice"
import type { Nudge } from "@/services/nudgeService"
import { pinTestClock } from "@/lib/testing/testClock"

// OneCamp AI's nudge events on a person's own topic (MESSAGE_AI_NUDGE). The
// server tells the nudges that closed for a person in one pass in ONE
// "cleared", naming them in nudge_ids (CHAT-LEAD-35's ruling), and a new one
// in full ("new"). "cleared" used to carry a count alone, so a tab
// kept a closed nudge listed until the count reached 0, then dropped them all.
// Urgent nudges count in the Inbox badge now (V-577), so either event has the
// badge read the server's count again, and a new one reads in as the feed's
// live items do: the badge, then an open Inbox's first page, then its seen write.

const calls = vi.hoisted(() => ({ arrived: 0, recount: 0 }))
vi.mock("@/lib/activity/inboxArrived", () => ({ inboxArrived: () => void calls.arrived++ }))
vi.mock("@/services/unreadCache", () => ({ recountInbox: () => void calls.recount++ }))

const { applyNudgeMessage } = await import("@/lib/ai/nudgeMessage")

pinTestClock()

const nudge = (id: string, priority = 0, unread = false): Nudge => ({
  id,
  kind: "overdue_commitment",
  title: `Nudge ${id}`,
  body: "",
  status: "open",
  priority,
  created_at: "2026-11-05T09:00:00Z",
  updated_at: "2026-11-05T09:00:00Z",
  unread,
})

function store(nudges: Nudge[]) {
  const s = configureStore({ reducer: { nudge: nudgeSlice.reducer } })
  s.dispatch(setNudges({ nudges, openCount: nudges.length }))
  return s
}

beforeEach(() => {
  calls.arrived = 0
  calls.recount = 0
})

describe("a nudge event", () => {
  it("cleared, naming two nudges: drops those two and no other, takes the server's count, and the badge reads again once", () => {
    const s = store([nudge("a", 1, true), nudge("b"), nudge("c", 1), nudge("d")])
    applyNudgeMessage(s.dispatch, { action: "cleared", nudge_ids: ["b", "c"], open_count: 2 })
    expect(s.getState().nudge.nudges.map((n) => n.id)).toEqual(["a", "d"])
    expect(s.getState().nudge.openCount).toBe(2)
    expect(calls.recount).toBe(1)
  })

  it("cleared, naming the last open one: the group empties", () => {
    const s = store([nudge("a", 1)])
    applyNudgeMessage(s.dispatch, { action: "cleared", nudge_ids: ["a"], open_count: 0 })
    expect(s.getState().nudge.nudges).toEqual([])
    expect(s.getState().nudge.openCount).toBe(0)
  })

  it("cleared with no name and nothing open (Clear all in another tab): the group empties", () => {
    const s = store([nudge("a", 1), nudge("b")])
    applyNudgeMessage(s.dispatch, { action: "cleared", open_count: 0 })
    expect(s.getState().nudge.nudges).toEqual([])
    expect(calls.recount).toBe(1)
  })

  it("new: listed with a dot when it's urgent (the badge counts it), none at priority 0, and read in as a live item", () => {
    const s = store([])
    applyNudgeMessage(s.dispatch, { action: "new", nudge_id: "u", kind: "overdue_commitment", title: "Overdue commitment", priority: 1, open_count: 1, created_at: "2026-11-05T10:00:00Z" })
    applyNudgeMessage(s.dispatch, { action: "new", nudge_id: "q", kind: "stale_question", title: "Still open?", priority: 0, open_count: 2, created_at: "2026-11-05T10:01:00Z" })
    const byId = Object.fromEntries(s.getState().nudge.nudges.map((n) => [n.id, n]))
    expect(byId.u.unread).toBe(true)
    expect(byId.q.unread).toBe(false)
    expect(s.getState().nudge.openCount).toBe(2)
    expect(calls.arrived).toBe(2)
  })

  it("new again for an open nudge (re-raised): one row, kept up to date", () => {
    const s = store([nudge("u", 1)])
    applyNudgeMessage(s.dispatch, { action: "new", nudge_id: "u", title: "Overdue commitment, again", priority: 1, open_count: 1 })
    expect(s.getState().nudge.nudges.map((n) => [n.id, n.title, n.unread])).toEqual([["u", "Overdue commitment, again", true]])
  })

  it("anything else changes nothing", () => {
    const s = store([nudge("a", 1)])
    applyNudgeMessage(s.dispatch, { action: "new" })
    applyNudgeMessage(s.dispatch, null)
    expect(s.getState().nudge.nudges.map((n) => n.id)).toEqual(["a"])
    expect(calls.arrived + calls.recount).toBe(0)
  })

  // C11 (V-581): a settle sends one cleared per person, naming only the nudges
  // that closed; a person whose nudges only went quiet gets the count alone.
  // The server always sends open_count (models/mqtt MqttNudge, no omitempty):
  // these pin the shapes, and that a missing count never reads as 0 (V-597).
  it("cleared, naming one while another only went quiet: drops the one, keeps the quiet one listed", () => {
    const s = store([nudge("a", 1, true), nudge("b", 1)])
    applyNudgeMessage(s.dispatch, { action: "cleared", nudge_ids: ["a"], open_count: 1 })
    expect(s.getState().nudge.nudges.map((n) => n.id)).toEqual(["b"])
    expect(s.getState().nudge.openCount).toBe(1)
    expect(calls.recount).toBe(1)
  })

  it("cleared with no name and a count (theirs only went quiet): every row stays, the count is the server's", () => {
    const s = store([nudge("a", 1), nudge("b")])
    applyNudgeMessage(s.dispatch, { action: "cleared", open_count: 5 })
    expect(s.getState().nudge.nudges.map((n) => n.id)).toEqual(["a", "b"])
    expect(s.getState().nudge.openCount).toBe(5)
    expect(calls.recount).toBe(1)
  })

  it("cleared with no name and no count: rows and count stay as they were, never 0", () => {
    const s = store([nudge("a", 1), nudge("b")])
    applyNudgeMessage(s.dispatch, { action: "cleared" })
    expect(s.getState().nudge.nudges.map((n) => n.id)).toEqual(["a", "b"])
    expect(s.getState().nudge.openCount).toBe(2)
    expect(calls.recount).toBe(1)
  })

  it("is how the app's MQTT handler takes them", () => {
    const handler = readFileSync(join(__dirname, "..", "..", "hooks/useMqttMessageHandler.ts"), "utf8")
    expect(handler).toMatch(/applyNudgeMessage\(dispatch, /)
    expect(handler).not.toMatch(/upsertNudge|setOpenCount/)
  })
})
