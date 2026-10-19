import type { Dispatch } from "@reduxjs/toolkit"
import { createUserChatList } from "@/store/slice/userSlice"
import type { UserDMInterface } from "@/types/user"

// The sidebar's DMs and groups as the conversation service changes them (chat
// A9): a group named or its name taken away, here or live, and a DM or group
// hidden until a newer message brings it back. Each writes the list whole
// (createUserChatList). They live here rather than as reducers in
// store/slice/userSlice, which every route's first load carries; only the
// chat screens and their live handlers reach this file.

/** Names the group id in the sidebar ("" takes its name away). Nothing is
 * written when the group isn't listed or already says so. */
export function nameSidebarChat(dispatch: Dispatch, chats: UserDMInterface[] | undefined, id: string, name: string): void {
  const next = name || undefined
  if (!chats?.some((c) => c.dm_grouping_id == id && c.dm_name !== next)) return
  dispatch(createUserChatList({ chatUsersDm: chats.map((c) => (c.dm_grouping_id == id ? { ...c, dm_name: next } : c)) }))
}

/** Takes the DM or group id out of the sidebar. */
export function hideSidebarChat(dispatch: Dispatch, chats: UserDMInterface[] | undefined, id: string): void {
  dispatch(createUserChatList({ chatUsersDm: (chats || []).filter((c) => c.dm_grouping_id != id) }))
}
