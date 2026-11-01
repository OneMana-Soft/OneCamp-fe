import { afterEach, describe, expect, it, vi } from "vitest"
import { readZoneNamesAsGiven } from "@/lib/testing/zoneNamesAsGiven"
import { sameName, sameZone } from "./sameZone"
import { zoneHere } from "./zoneHere"

// V-135: two names for one zone are one zone. The account may keep IANA's name ("Asia/Kolkata") while Chromium reads
// the browser's as ICU's ("Asia/Calcutta"); matched by name, the week stopped drawing your working hours.
describe("sameZone", () => {
  it.each([
    ["Asia/Kolkata", "Asia/Calcutta"],
    ["Europe/Kyiv", "Europe/Kiev"],
    ["America/Indiana/Indianapolis", "America/Indianapolis"],
    ["Etc/UTC", "UTC"],
    ["Asia/Tokyo", "Asia/Tokyo"],
  ])("reads %s and %s as one zone, either way round", (a, b) => {
    expect(sameZone(a, b)).toBe(true)
    expect(sameZone(b, a)).toBe(true)
  })

  it.each([
    ["Asia/Kolkata", "Asia/Colombo"],
    ["Europe/London", "Europe/Dublin"],
    ["America/New_York", "America/Toronto"],
    ["Africa/Abidjan", "UTC"],
  ])("keeps %s and %s apart, though their clocks agree today", (a, b) => {
    expect(sameZone(a, b)).toBe(false)
  })

  it("is no zone for a blank or unreadable name, not even the same one", () => {
    for (const [a, b] of [["", ""], [undefined, "UTC"], [null, null], ["Mars/Base", "Mars/Base"], ["Mars/Base", "UTC"]] as const) {
      expect(sameZone(a, b)).toBe(false)
      expect(sameName(a, b)).toBe(false)
    }
  })

  it("names a zone the way this runtime does", () => {
    expect(zoneHere("Asia/Kolkata")).toBe(zoneHere("Asia/Calcutta"))
    expect(zoneHere("Mars/Base")).toBe("")
    expect(sameName("Asia/Kolkata", "Asia/Calcutta")).toBe(true)
  })
})

// V-135 on WebKit (Safari, and every browser on iOS): it reads each zone name as given, so Intl can't say that
// "Asia/Calcutta" is "Asia/Kolkata". An account kept under one name never matched a browser that reports the other.
describe("sameZone where the runtime reads each name as given (WebKit)", () => {
  let undo = () => {}
  afterEach(() => undo())
  const load = async () => {
    vi.resetModules()
    undo = readZoneNamesAsGiven()
    return import("@/lib/utils/sameZone")
  }

  it.each([
    ["Asia/Kolkata", "Asia/Calcutta"],
    ["Europe/Kyiv", "Europe/Kiev"],
    ["America/Indiana/Indianapolis", "America/Indianapolis"],
    ["Etc/UTC", "UTC"],
  ])("reads %s and %s as one zone: their clocks have agreed since 1970", async (a, b) => {
    const { sameZone } = await load()
    expect(sameZone(a, b)).toBe(true)
    expect(sameZone(b, a)).toBe(true)
  })

  it.each([
    ["Asia/Kolkata", "Asia/Colombo", "in 1996"],
    ["America/New_York", "America/Toronto", "in 1974"],
    ["Europe/Berlin", "Europe/Paris", "in 1976"],
    ["Europe/Kyiv", "Europe/Helsinki", "until 1990"],
  ])("keeps %s and %s apart: their clocks differed %s", async (a, b) => {
    const { sameZone } = await load()
    expect(sameZone(a, b)).toBe(false)
  })

  // Two places whose clocks have agreed since 1970 are still two zones, as in Chromium and on the server: what their
  // time is called tells them apart.
  it.each([
    ["Europe/London", "Europe/Dublin", "British Summer Time", "Irish Standard Time"],
    ["Africa/Abidjan", "UTC", "Greenwich Mean Time", "Coordinated Universal Time"],
  ])("keeps %s and %s apart: their clocks have agreed since 1970, but %s is not %s", async (a, b) => {
    const { sameZone } = await load()
    expect(sameZone(a, b)).toBe(false)
    expect(sameZone(b, a)).toBe(false)
  })

  it("reads a pair's clocks once, either way round, and keeps names a question of names", async () => {
    const z = await load()
    expect(z.sameName("Asia/Kolkata", "Asia/Calcutta")).toBe(false)
    expect(z.sameZone("Asia/Kolkata", "Asia/Calcutta")).toBe(true)
    const read = vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts")
    try {
      expect(z.sameZone("Asia/Calcutta", "Asia/Kolkata")).toBe(true)
      expect(read).not.toHaveBeenCalled()
    } finally {
      read.mockRestore()
    }
  })

  it("is no zone for a blank or unreadable name there too", async () => {
    const { sameZone } = await load()
    expect(sameZone("", "UTC")).toBe(false)
    expect(sameZone("Mars/Base", "Mars/Base")).toBe(false)
  })
})
