import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/axiosInstance", () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

// A stand-in for the app's SWR cache and its mutate: records what
// markChannelSeen writes back, so the test asserts the cache correction rather
// than the network call. An entry is SWR's state: the data, and whether a
// request for it is on its way.
type Entry = { data?: unknown; isValidating?: boolean }
const cache = new Map<string, Entry>()
const mutate = vi.fn(async (key: string, updater: (data: unknown) => unknown) => {
  const entry = cache.get(key)
  if (entry) cache.set(key, { ...entry, data: updater(entry.data) })
})

import axiosInstance from "@/lib/axiosInstance"
import { bindAppMutate } from "@/lib/swrMutate"
import { markChannelSeen } from "@/services/channelService"
import { clearActivityUnread, clearChatUnread } from "@/services/unreadCache"
import { GetEndpointUrl } from "@/services/endPoints"

const post = axiosInstance.post as unknown as ReturnType<typeof vi.fn>

const READ = "read-channel"
const OTHER = "other-channel"

const DM = "dm-grouping-1"
const OTHER_DM = "dm-grouping-2"

const sidenav = () => ({
  data: {
    user_channels: [
      { ch_uuid: READ, unread_post_count: 3 },
      { ch_uuid: OTHER, unread_post_count: 5 },
    ],
    user_fav_channels: [{ ch_uuid: READ, unread_post_count: 3 }],
    user_dms: [
      { dm_grouping_id: DM, dm_unread: 4 },
      { dm_grouping_id: OTHER_DM, dm_unread: 7 },
    ],
    user_total_unread_activity_count: 9,
  },
})

const channelPage = () => ({
  msg: "ok",
  channels_list: [
    { ch_uuid: READ, unread_post_count: 3 },
    { ch_uuid: OTHER, unread_post_count: 5 },
  ],
})

const PAGE = `${GetEndpointUrl.GetUserActiveChannelList}?pageIndex=0&pageSize=20`

beforeEach(() => {
  post.mockReset()
  post.mockResolvedValue({ data: {} })
  mutate.mockClear()
  cache.clear()
  cache.set(GetEndpointUrl.SelfProfileSideNav, { data: sidenav() })
  cache.set(PAGE, { data: channelPage() })
  cache.set(GetEndpointUrl.GetUserLatestChatList, { data: sidenav() })
  bindAppMutate(mutate as never, cache as never)
})

afterEach(() => bindAppMutate(null))

const sidenavCache = () => cache.get(GetEndpointUrl.SelfProfileSideNav)?.data as ReturnType<typeof sidenav>
const listCache = () => cache.get(PAGE)?.data as ReturnType<typeof channelPage>
const chatListCache = () => cache.get(GetEndpointUrl.GetUserLatestChatList)?.data as ReturnType<typeof sidenav>

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

  // A DM and a group chat use the same grouping id and the same two caches. The
  // server advances the marker on the chat fetch itself, so only the caches in
  // front of it can be wrong, and both of them were.
  it("clears a chat's badge in the sidenav and the chat list", () => {
    clearChatUnread(DM)

    expect(sidenavCache().data.user_dms.find((d) => d.dm_grouping_id === DM)?.dm_unread).toBe(0)
    expect(chatListCache().data.user_dms.find((d) => d.dm_grouping_id === DM)?.dm_unread).toBe(0)
  })

  // THE DM LIST BUG. On a link straight into a chat, the chat list's first
  // request was still on its way when the chat cleared its badge. SWR drops a
  // response whose entry changed under it, so the list never arrived: it
  // showed only the open conversation until the next refresh, minutes later.
  it("leaves a chat list that hasn't arrived yet to arrive", () => {
    cache.set(GetEndpointUrl.GetUserLatestChatList, { isValidating: true })

    clearChatUnread(DM)

    expect(mutate).not.toHaveBeenCalledWith(GetEndpointUrl.GetUserLatestChatList, expect.anything(), expect.anything())
    expect(sidenavCache().data.user_dms.find((d) => d.dm_grouping_id === DM)?.dm_unread).toBe(0)
  })

  // Reloading into a chat: the lists are shown from the last visit while they
  // are fetched again. Correcting them dropped the fresh answer, so the last
  // visit's lists stood for minutes; now the fresh answer is asked for again.
  it("fetches a list again when its fresh answer was on its way", () => {
    cache.set(GetEndpointUrl.GetUserLatestChatList, { data: sidenav(), isValidating: true })

    clearChatUnread(DM)

    expect(chatListCache().data.user_dms.find((d) => d.dm_grouping_id === DM)?.dm_unread).toBe(0)
    expect(mutate).toHaveBeenCalledWith(GetEndpointUrl.GetUserLatestChatList, expect.any(Function), { revalidate: true })
    expect(mutate).toHaveBeenCalledWith(GetEndpointUrl.SelfProfileSideNav, expect.any(Function), { revalidate: false })
  })

  it("leaves other chats alone", () => {
    clearChatUnread(DM)

    expect(sidenavCache().data.user_dms.find((d) => d.dm_grouping_id === OTHER_DM)?.dm_unread).toBe(7)
  })

  // The activity count is a single number on the same cached payload, so opening
  // the feed and navigating away brought the old count straight back.
  it("clears the activity count", () => {
    clearActivityUnread()

    expect(sidenavCache().data.user_total_unread_activity_count).toBe(0)
  })
})
