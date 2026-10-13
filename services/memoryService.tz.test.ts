import { afterEach, describe, expect, it, vi } from "vitest"

// CAL-BUG-13: the briefing and "What needs me" read only Google for today's
// calendar. The server reads OneCamp's calendar for the reader's day now, in
// the zone it is told; the answers kept for a moment are kept per zone.

const { get, zone } = vi.hoisted(() => ({ get: vi.fn(), zone: { value: "Asia/Kolkata" } }))
vi.mock("@/lib/axiosInstance", () => ({ default: { get } }))
vi.mock("@/lib/utils/timeZone", () => ({ browserTZ: () => zone.value }))

import { attentionKey, briefingKey, getAttention, getBriefing } from "./memoryService"
import { peekShared } from "@/lib/utils/sharedRequest"

afterEach(() => {
  get.mockReset()
  zone.value = "Asia/Kolkata"
})

describe("today's briefing and queue", () => {
  it("say which zone today is in", async () => {
    get.mockResolvedValue({ data: { data: { enabled: true } } })
    await getBriefing()
    await getAttention()
    expect(get.mock.calls.map(([url]) => url)).toEqual(["/ai/briefing?tz=Asia%2FKolkata", "/ai/attention?tz=Asia%2FKolkata"])
  })

  it("never answer from what was kept for another zone", async () => {
    get.mockResolvedValue({ data: { data: { enabled: true, items: [] } } })
    zone.value = "Europe/London"
    await getAttention()
    expect(peekShared(attentionKey("Europe/London"))).toBeTruthy()
    zone.value = "America/New_York"
    expect(peekShared(attentionKey())).toBeUndefined()
    await getAttention()
    expect(get.mock.calls.at(-1)?.[0]).toBe("/ai/attention?tz=America%2FNew_York")
    expect(briefingKey("UTC")).not.toBe(briefingKey("Asia/Kolkata"))
  })
})
