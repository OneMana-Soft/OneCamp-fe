import { describe, expect, it } from "vitest"
import { zoneCity, zoneLabel, zoneLabels, zoneRows } from "./zones"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

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
