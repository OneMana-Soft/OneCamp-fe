import { describe, expect, it } from "vitest"
import type { FieldType, TableField } from "@/services/tableService"
import { durationText, idText, isPhone, kindText, momentText, momentTitle, ratingMax, statusGroupOf, takesOnePerson, telHref } from "./kindsMore"
import { parseDurationSeconds } from "@/lib/format/durationSeconds"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

const field = (type: FieldType, config: Record<string, unknown> = {}): TableField => ({ id: "f", table_id: "t", name: "Field", type, config: JSON.stringify(config), position: 0 })

describe("tables B1's kinds on the web", () => {
  it("write a duration as STEP5's spec E reads it: hours and minutes, seconds when the field shows them", () => {
    expect(durationText(5400, "h:mm")).toBe("1h 30m")
    expect(durationText(2700, "h:mm")).toBe("45m")
    expect(durationText(7200, "h:mm")).toBe("2h")
    expect(durationText(5415, "h:mm:ss")).toBe("1h 30m 15s")
    expect(durationText(89, "h:mm")).toBe("1m")
    expect(durationText(0, "h:mm")).toBe("0m")
    expect(durationText(-5, "h:mm")).toBe("")
  })

  it("read a duration as people write one, as the server's ParseDuration does", () => {
    for (const [text, seconds] of [["1:30", 5400], ["1:30:15", 5415], ["1h 30m", 5400], ["90m", 5400], ["45s", 45], ["1.5h", 5400], ["2d", 172800], ["2 hours", 7200], ["90", 5400], ["1.5", 90], ["1h30", 5400], ["2 hrs 15", 8100]] as const) {
      expect(parseDurationSeconds(text), text).toBe(seconds)
    }
    for (const text of ["", "soon", "1:75", "h", "-5m"]) expect(parseDurationSeconds(text), text).toBeNull()
  })

  it("take a phone number as written when it is one, and dial its digits", () => {
    expect(isPhone("+91 98765 43210")).toBe(true)
    expect(isPhone("555-0100 ext 12")).toBe(true)
    for (const t of ["call me", "12", "+91 98765 43210 then press 2", "1".repeat(41)]) expect(isPhone(t), t).toBe(false)
    expect(telHref(" +91 98765 43210 ")).toBe("tel:+919876543210")
    expect(telHref("(020) 7946-0958 ext. 12")).toBe("tel:02079460958,12")
    expect(telHref("call me")).toBeNull()
  })

  it("read when a row was made as how long ago within a week, then its day, the full moment in its tooltip", () => {
    const now = new Date("2026-10-18T12:00:00Z")
    expect(momentText("2026-10-18T11:59:40Z", now)).toBe("just now")
    expect(momentText("2026-10-18T11:48:00Z", now)).toBe("12m ago")
    expect(momentText("2026-10-18T09:00:00Z", now)).toBe("3h ago")
    expect(momentText("2026-10-17T10:00:00Z", now)).toBe("yesterday")
    expect(momentText("2026-10-16T10:00:00Z", now)).toBe("2 days ago")
    // A week to the second is a day again.
    expect(momentText("2026-10-11T12:00:01Z", now)).toBe("6 days ago")
    expect(momentText("2026-10-11T12:00:00Z", now)).toMatch(/^11 Oct$/)
    expect(momentText("2026-10-10T10:00:00Z", now)).toMatch(/^10 Oct$/)
    expect(momentText("nonsense", now)).toBe("")
    expect(momentTitle("2026-10-10T10:00:00Z")).toMatch(/^Saturday 10 October 2026, /)
  })

  it("show a row's id after its field's prefix, and nothing before it has one", () => {
    expect(idText(field("autonumber", { prefix: "DEAL" }), 12)).toBe("DEAL-12")
    expect(idText(field("autonumber"), 12)).toBe("12")
    expect(idText(field("autonumber", { prefix: "no spaces" }), 12)).toBe("12")
    expect(idText(field("autonumber", { prefix: "DEAL" }), null)).toBe("")
  })

  it("read a field's own settings, falling back where one is missing or odd", () => {
    expect(ratingMax(field("rating"))).toBe(5)
    expect(ratingMax(field("rating", { max: 10 }))).toBe(10)
    expect(ratingMax(field("rating", { max: 12 }))).toBe(5)
    expect(takesOnePerson(field("people", { one: true }))).toBe(true)
    expect(takesOnePerson(field("people"))).toBe(false)
    expect(statusGroupOf({ label: "Shipped", group: "done" })).toBe("done")
    expect(statusGroupOf({ label: "Waiting" })).toBe("todo")
  })

  it("write each kind's cell as one line for a card, a phone's list and a row's history", () => {
    expect(kindText(field("duration"), 5400)).toBe("1h 30m")
    expect(kindText(field("rating"), 4)).toBe("★ 4/5")
    expect(kindText(field("autonumber", { prefix: "OPS" }), 3)).toBe("OPS-3")
    expect(kindText(field("people"), [{ id: "u1", type: "user", label: "Maya Iyer" }, { id: "u2", type: "user", hidden: true }])).toBe("Maya Iyer, Something you can't open")
    expect(kindText(field("text"), "anything")).toBeNull()
  })
})
