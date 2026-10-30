import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: {} }))

import { EVERY_CHANNEL_PAGE_SIZE, readEveryChannel } from "@/components/admin/useEveryChannel"
import type { ChannelInfoInterface } from "@/types/channel"

const ch = (i: number) => ({ ch_uuid: `c${i}`, ch_name: `ch-${String(i).padStart(4, "0")}` }) as ChannelInfoInterface

// A webhook's channel picker offered the first 20 channels only (FE-11-G-1):
// every page is read now, to the last.
describe("readEveryChannel", () => {
  it("reads every page, each channel once, by name", async () => {
    const all = Array.from({ length: 250 }, (_, i) => ch(249 - i))
    const asked: string[] = []
    const got = await readEveryChannel(async (url) => {
      asked.push(url)
      const page = Number(new URL(url, "http://x").searchParams.get("pageIndex"))
      const list = all.slice(page * EVERY_CHANNEL_PAGE_SIZE, (page + 1) * EVERY_CHANNEL_PAGE_SIZE)
      return { channels_list: [...list, ...(page === 1 ? [all[0]] : [])], msg: "", pageCount: 3 }
    })
    expect(asked).toHaveLength(3)
    expect(got).toHaveLength(250)
    expect(got[0].ch_name).toBe("ch-0000")
    expect(got[249].ch_name).toBe("ch-0249")
  })

  it("stops at a short page, whatever the page count says", async () => {
    const get = vi.fn(async () => ({ channels_list: [ch(1), ch(2)], msg: "" }))
    expect(await readEveryChannel(get)).toHaveLength(2)
    expect(get).toHaveBeenCalledTimes(1)
  })
})
