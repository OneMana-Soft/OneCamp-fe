import { afterEach, describe, expect, it, vi } from "vitest"
import { OFFLINE_ID, madeOffline, newOfflineId, offlineIdsIn } from "@/lib/offline/offlineId"

// CODE-REVIEWER-79 MF1 (b): one owner makes the device's ids and finds them, by one pattern.
describe("the ids the device gives", () => {
  afterEach(() => vi.restoreAllMocks())

  const found = (id: string) => {
    expect(madeOffline(id)).toBe(true)
    expect(offlineIdsIn(`/task/info/${id} ${JSON.stringify({ task_uuid: id, again: id })}`)).toEqual([id])
  }

  it("are found by what finds them, made with crypto", () => {
    const id = newOfflineId()
    expect(id.startsWith(OFFLINE_ID)).toBe(true)
    found(id)
  })

  it("are found by what finds them, made with no crypto (a page served without TLS), however short the random run", () => {
    vi.stubGlobal("crypto", {})
    // Math.random's base-36 run can be a single digit: the id still has the runs the pattern asks.
    vi.spyOn(Math, "random").mockReturnValue(0.5)
    found(newOfflineId())
    vi.spyOn(Math, "random").mockReturnValue(0)
    found(newOfflineId())
    vi.unstubAllGlobals()
  })

  it("are never mistaken: not the bare prefix, not a server's id, not what isn't text", () => {
    for (const id of ["offline-", "offline-1", "offline-abc", "t-real", "0d1f2e3c-4b5a-4f6e-8d7c-6b5a4f3e2d1c", undefined, 7]) expect(madeOffline(id)).toBe(false)
    expect(offlineIdsIn("offline-1 offline- t-real")).toEqual([])
  })
})
