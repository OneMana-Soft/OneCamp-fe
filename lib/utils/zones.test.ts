import { describe, expect, it, vi } from "vitest"
import { timeZones, zoneCity, zoneLabel, zoneLabels, zoneName, zoneRows } from "./zones"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// V-642: the Event Form names a time's zone as its clock reads at that time, not today: New York keeps summer time
// in July and standard time in December, whatever day the form is opened on.
describe("a zone's name at a moment", () => {
  it("is the name the zone goes by then, short or long, and nothing for a zone the runtime can't read", () => {
    const july = new Date("2026-07-01T12:00:00Z")
    const december = new Date("2026-12-01T12:00:00Z")
    expect([zoneName("America/New_York", "short", true, july), zoneName("America/New_York", "short", true, december)]).toEqual(["EDT", "EST"])
    expect(zoneName("America/New_York", "long", true, december)).toBe("Eastern Standard Time")
    expect(zoneName("Mars/Olympus_Mons", "short", true, july)).toBe("")
  })
})

// A zone is named one way everywhere, as people know it, with its offset;
// never as the database's "Asia/Calcutta", and a renamed place by its name today.
describe("zone names", () => {
  it("says an old zone name and its new one alike, with the offset", () => {
    expect(zoneLabel("Asia/Calcutta")).toBe("India Standard Time (GMT+5:30)")
    expect(zoneLabel("Asia/Calcutta")).toBe(zoneLabel("Asia/Kolkata"))
    expect(zoneLabels("Asia/Calcutta")).toContain("Kolkata (GMT+5:30)")
    expect(zoneLabels("Asia/Calcutta").join(" ")).not.toMatch(/Calcutta|_|Asia\//)
  })

  it("names a renamed place by its name today, and the rest as they are", () => {
    expect(zoneCity("Asia/Calcutta")).toBe("Kolkata")
    expect(zoneCity("Europe/Kiev")).toBe("Kyiv")
    expect(zoneCity("Asia/Saigon")).toBe("Ho Chi Minh")
    expect(zoneCity("America/New_York")).toBe("New York")
    expect(zoneCity("America/Argentina/Buenos_Aires")).toBe("Buenos Aires")
  })

  it("finds a renamed place in the picker by either name", () => {
    const row = zoneRows().find((r) => r.z === "Asia/Calcutta" || r.z === "Asia/Kolkata")
    expect(row?.label).toMatch(/Kolkata$/)
    expect(row?.hay).toContain("kolkata")
  })
})

// V-135: the list puts the reader's zone first and lists it once, under whichever of its names it was given.
describe("timeZones", () => {
  it("lists the reader's zone once, though Intl lists it under its other name", () => {
    const list = timeZones("Asia/Kolkata")
    expect(list[0]).toBe("Asia/Kolkata")
    expect(list).not.toContain("Asia/Calcutta")
    expect(timeZones("Europe/Kyiv")).not.toContain("Europe/Kiev")
  })

  // The list holds the names this runtime reads zones as, so reading the first zone's name once finds its other name:
  // one formatter, never one for each of some 420 zones (the booking page builds the list as its picker opens).
  it("reads only its first zone's name", async () => {
    vi.resetModules()
    const Real = Intl.DateTimeFormat
    let made = 0
    Intl.DateTimeFormat = new Proxy(Real, {
      construct(target, args) {
        made++
        return Reflect.construct(target, args)
      },
    })
    try {
      const fresh = await import("./zones")
      expect(fresh.timeZones("Asia/Kolkata").length).toBeGreaterThan(400)
    } finally {
      Intl.DateTimeFormat = Real
    }
    expect(made).toBeLessThanOrEqual(1)
  })
})
