import { afterEach, describe, expect, it } from "vitest"

import { daysDraft, exportPartLine, exportPartOf, holdChange, holdFileName, itemDay, partCursor, partGap, partGapLine, peopleChange, previewWords, putPart, queryError, queryParams, readDays, ruleWords } from "./legalHolds"
import { pinTestClock } from "@/lib/testing/testClock"

// The model reads days and dates: every test here sets the clock it reads by (app/testClock.test.ts).
pinTestClock()

const zone = process.env.TZ
afterEach(() => {
  if (zone === undefined) delete process.env.TZ
  else process.env.TZ = zone
})

const RULE = { min: 0, max: 3650, label: "calendar events" }

describe("a retention rule's days", () => {
  it("reads empty as off and a whole number in the rule's bounds as itself", () => {
    expect(readDays("", RULE)).toEqual({ days: 0 })
    expect(readDays(" 365 ", RULE)).toEqual({ days: 365 })
    expect(readDays("3650", RULE)).toEqual({ days: 3650 })
  })

  it("says why anything else can't be saved", () => {
    expect(readDays("1.5", RULE)).toEqual({ error: "Enter a whole number of days, or 0 to keep all calendar events." })
    expect(readDays("-3", RULE)).toEqual({ error: "Enter a whole number of days, or 0 to keep all calendar events." })
    expect(readDays("3651", RULE)).toEqual({ error: "Enter from 0 to 3,650 days." })
    expect(readDays("20", { ...RULE, min: 30 })).toEqual({ error: "Enter from 30 to 3,650 days." })
  })

  it("shows off as an empty field", () => {
    expect(daysDraft(0)).toBe("")
    expect(daysDraft(90)).toBe("90")
  })

  it("says what it would remove before it is saved, in the kind's own words", () => {
    expect(previewWords({ days: 0, would_remove: 0 }, "calendar events")).toBe("Off: no calendar events are removed.")
    expect(previewWords({ days: 30, would_remove: 0 }, "calendar events")).toBe("None of the workspace's calendar events would be removed at the next sweep.")
    expect(previewWords({ days: 30, would_remove: 1 }, "calendar events")).toBe("1 of the workspace's calendar events would be removed at the next sweep.")
    expect(previewWords({ days: 30, would_remove: 12_400 }, "calendar events")).toBe("12,400 of the workspace's calendar events would be removed at the next sweep.")
  })

  it("names a saved rule for its offer back, a sentence in the kind's own words", () => {
    expect(ruleWords("calendar events", 365)).toBe("Calendar events removed after 365 days")
    expect(ruleWords("calendar events", 1)).toBe("Calendar events removed after 1 day")
    expect(ruleWords("calendar events", 3650)).toBe("Calendar events removed after 3,650 days")
  })
})

describe("a hold's search", () => {
  it("sends only what is set, words trimmed", () => {
    process.env.TZ = "Asia/Kolkata"
    expect(queryParams({ q: "  ", from: "", to: "" })).toEqual({})
    expect(queryParams({ q: " board review ", from: "2026-01-01", to: "" }, { format: "ics" })).toEqual({ format: "ics", q: "board review", from: "2026-01-01T00:00:00+05:30" })
    expect(queryParams({ q: "", from: "", to: "2026-03-31" })).toEqual({ to: "2026-04-01T00:00:00+05:30" })
  })

  // The server keeps what starts from `from` and before `to`, and reads a bare day as 00:00 UTC. So From goes as the
  // admin's own midnight, and To as the next day's: the To day is kept whole, wherever the admin is.
  it("sends From as the day's local midnight and To as the next day's, in RFC 3339", () => {
    process.env.TZ = "Asia/Kolkata"
    expect(queryParams({ q: "", from: "2026-01-01", to: "2026-03-31" })).toEqual({ from: "2026-01-01T00:00:00+05:30", to: "2026-04-01T00:00:00+05:30" })
    // The day the clocks go forward: To is the next calendar day's midnight, never 24 hours on.
    process.env.TZ = "America/New_York"
    expect(queryParams({ q: "", from: "2026-03-08", to: "2026-03-08" })).toEqual({ from: "2026-03-08T00:00:00-05:00", to: "2026-03-09T00:00:00-04:00" })
    expect(queryParams({ q: "", from: "", to: "2026-12-31" })).toEqual({ to: "2027-01-01T00:00:00-05:00" })
    // Text that isn't a day goes as typed, for the server to refuse in its own words.
    expect(queryParams({ q: "", from: "2026-02-31", to: "" })).toEqual({ from: "2026-02-31" })
  })

  it("refuses what the server would, before it is sent", () => {
    expect(queryError({ q: "", from: "2026-03-01", to: "2026-02-01" })).toBe("To comes after from.")
    expect(queryError({ q: "x".repeat(201), from: "", to: "" })).toBe("A search is at most 200 characters.")
    expect(queryError({ q: "x".repeat(200), from: "2026-03-01", to: "2026-03-01" })).toBeUndefined()
  })

  it("dates an all-day item by its first day and a timed one by its start", () => {
    expect(itemDay({ start_date: "2026-11-02" })).toEqual(new Date(2026, 10, 2))
    expect(itemDay({ start: "2026-11-02T09:30:00Z" })?.toISOString()).toBe("2026-11-02T09:30:00.000Z")
    expect(itemDay({ start: "not a time" })).toBeNull()
    expect(itemDay({})).toBeNull()
  })
})

describe("a hold's people and its file", () => {
  it("sends who joined and who left, never the whole list", () => {
    expect(peopleChange(["a", "b"], ["b", "c"])).toEqual({ add: ["c"], remove: ["a"] })
    expect(peopleChange(["a"], ["a"])).toEqual({ add: [], remove: [] })
  })

  it("sends a hold's change only when something changed: its name or note as trimmed, or who joined or left", () => {
    const hold = { name: "Acme", note: "Minutes", people: ["a", "b"] }
    expect(holdChange(hold, { name: " Acme ", note: "Minutes ", people: ["b", "a"] })).toBeNull()
    expect(holdChange(hold, { name: "Acme", note: "Minutes, Q4", people: ["a", "b"] })).toEqual({ name: "Acme", note: "Minutes, Q4", add: [], remove: [] })
    expect(holdChange(hold, { name: "Acme 2", note: "Minutes", people: ["a", "b"] })).toEqual({ name: "Acme 2", note: "Minutes", add: [], remove: [] })
    expect(holdChange(hold, { name: "Acme", note: "Minutes", people: ["a", "b", "c"] })).toEqual({ name: "Acme", note: "Minutes", add: ["c"], remove: [] })
    expect(holdChange(hold, { name: "Acme", note: "Minutes", people: ["a"] })).toEqual({ name: "Acme", note: "Minutes", add: [], remove: ["b"] })
  })

  // V-388 (1): an export past the server's part size comes in parts, and a part must never pass for the whole.
  it("reads an export's part from its answer, and a server before parts as a whole file", () => {
    expect(exportPartOf({ "x-exported-items": "20000", "x-export-part": "1", "x-export-next": "2.YWJj" })).toEqual({ count: 20000, part: 1, next: "2.YWJj" })
    expect(exportPartOf({ "x-exported-items": "1234", "x-export-part": "3" })).toEqual({ count: 1234, part: 3, next: "" })
    expect(exportPartOf({ "x-exported-items": "12" })).toEqual({ count: 12, part: 1, next: "" })
    expect(exportPartOf({})).toEqual({ count: null, part: 1, next: "" })
  })

  it("says what a saved export holds, and when it is one part of several, which and whether more remain", () => {
    expect(exportPartLine({ count: 12, part: 1, next: "" }, "calendar events")).toBe("All 12 calendar events that match are in this file.")
    expect(exportPartLine({ count: 1, part: 1, next: "" }, "calendar events")).toBe("The one match is in this file.")
    expect(exportPartLine({ count: null, part: 1, next: "" }, "calendar events")).toBe("Saved as one file.")
    expect(exportPartLine({ count: 20000, part: 1, next: "2.YWJj" }, "calendar events")).toBe("Part 1: the first 20,000 calendar events that match, not all of them. Export part 2 for the rest.")
    expect(exportPartLine({ count: 20000, part: 2, next: "3.ZGVm" }, "calendar events")).toBe("Part 2: the next 20,000 calendar events that match, not all of them. Export part 3 for the rest.")
    expect(exportPartLine({ count: 1234, part: 3, next: "" }, "calendar events")).toBe("Part 3, the last: 1,234 more calendar events. Parts 1 to 3 hold all that match.")
  })

  // V-431: a legal export never loses a part. Every part made is kept, one of each, and any can be made again from where it starts.
  it("keeps one of each part made, in order, and gives back the one a part made again takes over from", () => {
    const made = (n: number, href: string, from = "") => ({ href, from, part: { count: 1, part: n, next: `${n + 1}.x` } })
    expect(putPart([], made(1, "a"))).toEqual({ parts: [made(1, "a")], replaced: null })
    expect(putPart([made(1, "a")], made(2, "b"))).toEqual({ parts: [made(1, "a"), made(2, "b")], replaced: null })
    expect(putPart([made(1, "a"), made(2, "b"), made(3, "c")], made(2, "d"))).toEqual({ parts: [made(1, "a"), made(2, "d"), made(3, "c")], replaced: made(2, "b") })
    expect(putPart([made(2, "b")], made(1, "a"))).toEqual({ parts: [made(1, "a"), made(2, "b")], replaced: null })
  })

  it("makes a part from where the part before it ends, and part 1 from the start", () => {
    const parts = [
      { part: { count: 20000, part: 1, next: "2.YWJj" } },
      { part: { count: 20000, part: 2, next: "3.ZGVm" } },
      { part: { count: 7, part: 3, next: "" } },
    ]
    expect(partCursor(parts, 1)).toBe("")
    expect(partCursor(parts, 2)).toBe("2.YWJj")
    expect(partCursor(parts, 3)).toBe("3.ZGVm")
    // After the last part, and after a part nobody made, there is nowhere to start from.
    expect(partCursor(parts, 4)).toBeNull()
    expect(partCursor(parts.slice(1), 2)).toBeNull()
  })

  it("finds the first part whose next part no longer starts where it ends, and says what to make again", () => {
    const one = { from: "", part: { count: 20000, part: 1, next: "2.YWJj" } }
    const two = { from: "2.YWJj", part: { count: 20000, part: 2, next: "3.ZGVm" } }
    const three = { from: "3.ZGVm", part: { count: 7, part: 3, next: "" } }
    expect(partGap([one, two, three])).toBeNull()
    expect(partGap([one])).toBeNull()
    // Part 1 made again ends somewhere else (the hold's items changed since): part 2 no longer joins it.
    const oneAgain = { from: "", part: { count: 20000, part: 1, next: "2.T1RI" } }
    expect(partGap([oneAgain, two, three])).toBe(oneAgain)
    expect(partGap([one, { ...two, part: { ...two.part, next: "3.T1RI" } }, three])?.part.part).toBe(2)
    expect(partGapLine(oneAgain.part)).toBe("Part 1 came out different when it was made again, so part 2 no longer starts where it ends. Export part 2 again.")
    expect(partGapLine({ count: 12, part: 2, next: "" })).toBe("Part 2 now holds all the rest that match, so the parts after it repeat some of it.")
  })

  it("names a part of an export for its part", () => {
    expect(holdFileName("Acme v. Rivera", "calendar events", "ics", { count: 20000, part: 1, next: "2.YWJj" })).toBe("Acme v. Rivera - calendar events - part 1.ics")
    expect(holdFileName("Acme v. Rivera", "calendar events", "json", { count: 3, part: 2, next: "" })).toBe("Acme v. Rivera - calendar events - part 2.json")
    expect(holdFileName("Acme v. Rivera", "calendar events", "ics", { count: 3, part: 1, next: "" })).toBe("Acme v. Rivera - calendar events.ics")
  })

  it("names an export after the hold, with nothing a file name can't hold", () => {
    expect(holdFileName("Acme v. Rivera", "calendar events", "ics")).toBe("Acme v. Rivera - calendar events.ics")
    expect(holdFileName('Q3: "board"/audit', "calendar events", "json")).toBe("Q3 board audit - calendar events.json")
    expect(holdFileName("   ", "calendar events", "ics")).toBe("Legal hold - calendar events.ics")
    expect(holdFileName("x".repeat(300), "calendar events", "ics")).toBe(`${"x".repeat(120)}.ics`)
  })
})
