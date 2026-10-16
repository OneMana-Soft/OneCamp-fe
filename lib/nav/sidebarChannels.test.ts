import { describe, expect, it } from "vitest"
import { configureStore } from "@reduxjs/toolkit"
import { isMutedChannel, starredChannelRows } from "./sidebarChannels"
import userSlice, { setUserChannelNotificationType, updateUserChannelName, removeUserChannelName, incrementUserChannelUnread } from "@/store/slice/userSlice"
import type { ChannelInfoInterface } from "@/types/channel"

const ch = (id: string, extra: Partial<ChannelInfoInterface> = {}) => ({ ch_uuid: id, ch_name: id, ...extra }) as ChannelInfoInterface

describe("the sidebar's channel rows", () => {
  // SN-BUG-3: the levels are all, mention and block; "none" is none of them.
  it("shows a channel muted when its level is block, and only then", () => {
    expect(isMutedChannel({ notification_type: "block" })).toBe(true)
    expect(isMutedChannel({ notification_type: "mention" })).toBe(false)
    expect(isMutedChannel({ notification_type: "all" })).toBe(false)
    expect(isMutedChannel({ notification_type: "none" })).toBe(false)
    expect(isMutedChannel(undefined)).toBe(false)
  })

  // SN-BUG-7: starring a channel hid its unreads, kept its old name after a
  // rename, and kept it after archive.
  it("draws a starred channel from its Channels row, in starred order", () => {
    const channels = [ch("a", { unread_post_count: 4, ch_name: "launch-v2" }), ch("b"), ch("c", { ch_private: true })]
    const starred = [ch("c"), ch("a", { ch_name: "launch" }), ch("gone")]
    const rows = starredChannelRows(channels, starred)
    expect(rows.map((r) => r.ch_uuid)).toEqual(["c", "a"])
    expect(rows[1].unread_post_count).toBe(4)
    expect(rows[1].ch_name).toBe("launch-v2")
    expect(rows[0].ch_private).toBe(true)
  })

  it("follows the store: a live unread, a rename, a level change and an archive reach Starred", () => {
    const store = configureStore({ reducer: { users: userSlice.reducer } })
    const state = () => store.getState().users.userSidebar
    store.dispatch({
      type: "users/createUserChannelList",
      payload: { channelsUser: [ch("a"), ch("b")], favChannelsUser: [ch("a")] },
    })
    const starred = () => starredChannelRows(state().userChannels, state().userFavChannels)
    store.dispatch(incrementUserChannelUnread({ ch_uuid: "a" }))
    expect(starred()[0].unread_post_count).toBe(1)
    store.dispatch(updateUserChannelName({ channelUUID: "a", channelName: "renamed", channelPrivate: false }))
    expect(starred()[0].ch_name).toBe("renamed")
    store.dispatch(setUserChannelNotificationType({ channelUUID: "a", notificationType: "block" }))
    expect(isMutedChannel(starred()[0])).toBe(true)
    expect(isMutedChannel(state().userChannels.find((c) => c.ch_uuid === "a"))).toBe(true)
    store.dispatch(removeUserChannelName({ channelUUID: "a" }))
    expect(starred()).toEqual([])
  })
})
