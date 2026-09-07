import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/axiosInstance", () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

// A stand-in SWR cache: records what markChannelSeen writes back, so the test
// asserts the cache correction rather than the network call.
const cache = new Map<string, unknown>()
vi.mock("swr", () => ({
  mutate: vi.fn(
    async (
      key: string | ((k: unknown) => boolean),
      updater: (cached: unknown) => unknown,
    ) => {
      for (const [k, v] of cache) {
        const hit = typeof key === "function" ? key(k) : k === key
        if (hit) cache.set(k, updater(v))
      }
    },
  ),
}))

import axiosInstance from "@/lib/axiosInstance"
import { markChannelSeen } from "@/services/channelService"
import { GetEndpointUrl } from "@/services/endPoints"

const post = axiosInstance.post as unknown as ReturnType<typeof vi.fn>

const READ = "read-channel"
const OTHER = "other-channel"

const sidenav = () => ({
  data: {
    user_channels: [
      { ch_uuid: READ, unread_post_count: 3 },
      { ch_uuid: OTHER, unread_post_count: 5 },
    ],
    user_fav_channels: [{ ch_uuid: READ, unread_post_count: 3 }],
  },
})

const channelPage = () => ({
  msg: "ok",
  channels_list: [
    { ch_uuid: READ, unread_post_count: 3 },
    { ch_uuid: OTHER, unread_post_count: 5 },
  ],
})

beforeEach(() => {
  post.mockReset()
  post.mockResolvedValue({ data: {} })
  cache.clear()
  cache.set(GetEndpointUrl.SelfProfileSideNav, sidenav())
  cache.set(`${GetEndpointUrl.GetUserActiveChannelList}?pageIndex=0&pageSize=20`, channelPage())
})

const sidenavCache = () => cache.get(GetEndpointUrl.SelfProfileSideNav) as ReturnType<typeof sidenav>
const listCache = () =>
  cache.get(`${GetEndpointUrl.GetUserActiveChannelList}?pageIndex=0&pageSize=20`) as ReturnType<
    typeof channelPage
  >

const unreadIn = (list: { ch_uuid: string; unread_post_count: number }[], id: string) =>
  list.find((c) => c.ch_uuid === id)?.unread_post_count

describe("reading a channel clears its badge", () => {
  // THE REPORTED BUG. useHydrateUserSidebar re-dispatches createUserChannelList
  // from whatever /user/sidebarNav holds, and on a remount SWR returns the
  // CACHED payload straight away. If that payload still says 3 unread, the
  // Redux reset done on channel open is overwritten and the badge returns.
  it("does not let a cached sidenav payload resurrect the badge", async () => {
    await markChannelSeen(READ)

    expect(unreadIn(sidenavCache().data.user_channels, READ)).toBe(0)
  })

  // A favourite channel is carried in a second list and the nav badge sums over
  // both, so zeroing only one leaves the total non-zero.
  it("clears the favourites copy too", async () => {
    await markChannelSeen(READ)

    expect(unreadIn(sidenavCache().data.user_fav_channels, READ)).toBe(0)
  })

  // The channel list view reads no Redux at all, so the in-app reset never
  // applied to it. Its own cache has to be corrected or it shows the old count
  // until the four-minute refresh.
  it("clears the channel list view's own cache", async () => {
    await markChannelSeen(READ)

    expect(unreadIn(listCache().channels_list, READ)).toBe(0)
  })

  // Only the channel that was read. Zeroing the whole list would silently mark
  // every other channel read, which is worse than the bug.
  it("leaves other channels alone", async () => {
    await markChannelSeen(READ)

    expect(unreadIn(sidenavCache().data.user_channels, OTHER)).toBe(5)
    expect(unreadIn(listCache().channels_list, OTHER)).toBe(5)
  })

  // A failed request must not paint the badge as read: the server marker did
  // not move, so the count is still genuinely unread.
  it("does not clear anything when the request fails", async () => {
    post.mockRejectedValue(new Error("offline"))

    await markChannelSeen(READ)

    expect(unreadIn(sidenavCache().data.user_channels, READ)).toBe(3)
    expect(unreadIn(listCache().channels_list, READ)).toBe(3)
  })

  it("does nothing without a channel id", async () => {
    await markChannelSeen("")

    expect(post).not.toHaveBeenCalled()
  })
})
