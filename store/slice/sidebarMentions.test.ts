import { describe, expect, it } from "vitest"
import { configureStore } from "@reduxjs/toolkit"
import userSlice, { addUserChannelList, incrementUserChannelUnread, resetUserChannelUnread } from "@/store/slice/userSlice"
import type { ChannelInfoInterface } from "@/types/channel"

// SN-8: the sidebar's "@2" follows live posts and goes when you read the channel.
describe("a channel's mentions of you in the sidebar", () => {
  const ch = (id: string, extra: Partial<ChannelInfoInterface> = {}) => ({ ch_uuid: id, ch_name: id, ...extra }) as ChannelInfoInterface

  it("rise with a live post that mentions you, and clear when you read the channel", () => {
    const store = configureStore({ reducer: { users: userSlice.reducer } })
    const launch = () => store.getState().users.userSidebar.userChannels.find((c) => c.ch_uuid === "launch")!
    store.dispatch({ type: "users/createUserChannelList", payload: { channelsUser: [ch("launch", { unread_post_count: 3, unread_mention_count: 1 })] } })

    store.dispatch(incrementUserChannelUnread({ ch_uuid: "launch", mentionsMe: true }))
    store.dispatch(incrementUserChannelUnread({ ch_uuid: "launch" }))
    expect([launch().unread_post_count, launch().unread_mention_count]).toEqual([5, 2])

    store.dispatch(resetUserChannelUnread({ ch_uuid: "launch" }))
    expect([launch().unread_post_count, launch().unread_mention_count]).toEqual([0, 0])

    store.dispatch(incrementUserChannelUnread({ ch_uuid: "launch", mentionsMe: true }))
    store.dispatch(addUserChannelList({ channelUser: ch("launch", { ch_is_member: true }) }))
    expect([launch().unread_post_count, launch().unread_mention_count]).toEqual([0, 0])
  })
})
