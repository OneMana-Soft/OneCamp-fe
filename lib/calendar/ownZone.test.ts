import { afterEach, describe, expect, it, vi } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { readZoneNamesAsGiven } from "@/lib/testing/zoneNamesAsGiven"
import { ownZoneLine } from "./ownZone"

pinTestClock()

// The card says an event's own time where it keeps a zone the reader isn't
// in: 14:30 UTC on 16 Oct is 23:30 in Tokyo, 15:30 in London and in Dublin.
const start = new Date(Date.UTC(2026, 9, 16, 14, 30))
const end = new Date(Date.UTC(2026, 9, 16, 15, 30))

// V-135: London and Dublin are two places, though their clocks have agreed
// since 1970: an event kept in Dublin says so to a reader in London, and a
// trip from London to Dublin says both. Every browser says it, as the server
// reads it.
function saysDublinToLondon(line: typeof ownZoneLine): void {
  expect(line({ event_zone: "Europe/Dublin" }, start, end, "Europe/London")).toMatch(/^3:30 – 4:30\sPM in Dublin$/)
  expect(line({ event_zone: "Europe/London", event_end_zone: "Europe/Dublin" }, start, end, "America/New_York")).toMatch(/^3:30\sPM in London – 4:30\sPM in Dublin$/)
}

describe("an event's own time", () => {
  it("says the event's time in its own zone, under the reader's", () => {
    expect(ownZoneLine({ event_zone: "Asia/Tokyo" }, start, end, "Europe/London")).toMatch(/^11:30\sPM – 12:30\sAM in Tokyo$/)
  })

  it("says each end in its own zone when it ends in another", () => {
    expect(ownZoneLine({ event_zone: "Asia/Tokyo", event_end_zone: "Europe/London" }, start, end, "America/New_York")).toMatch(/^11:30\sPM in Tokyo – 4:30\sPM in London$/)
  })

  it("says nothing where the event keeps the reader's zone, keeps none, or keeps one the browser can't read", () => {
    expect(ownZoneLine({ event_zone: "Europe/London" }, start, end, "Europe/London")).toBe("")
    expect(ownZoneLine({ event_zone: "Asia/Kolkata" }, start, end, "Asia/Calcutta")).toBe("")
    expect(ownZoneLine({}, start, end, "Europe/London")).toBe("")
    expect(ownZoneLine({ event_zone: "Mars/Olympus_Mons" }, start, end, "Europe/London")).toBe("")
  })

  it("says an event's time in Dublin to a reader in London, though their clocks agree", () => {
    saysDublinToLondon(ownZoneLine)
  })
})

// V-135 on WebKit (Safari, and every browser on iOS), which reads each zone
// name as given: the card says what it says in Chromium.
describe("an event's own time where the runtime reads each zone name as given (WebKit)", () => {
  let undo = () => {}
  afterEach(() => undo())
  const load = async () => {
    vi.resetModules()
    undo = readZoneNamesAsGiven()
    return import("./ownZone")
  }

  it("says an event's time in Dublin to a reader in London, though their clocks agree", async () => {
    saysDublinToLondon((await load()).ownZoneLine)
  })

  it("says nothing where the event keeps the reader's zone under its other name", async () => {
    expect((await load()).ownZoneLine({ event_zone: "Asia/Kolkata" }, start, end, "Asia/Calcutta")).toBe("")
  })
})
