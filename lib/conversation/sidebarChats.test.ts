import { describe, expect, it } from "vitest"
import { hideSidebarChat, nameSidebarChat } from "@/lib/conversation/sidebarChats"

const dispatched: { type: string; payload: { chatUsersDm: unknown[] } }[] = []
const dispatch = ((a: (typeof dispatched)[number]) => { dispatched.push(a); return a }) as never

const dm = { dm_grouping_id: "dm1" }
const group = { dm_grouping_id: "grp1", dm_name: "Launch crew" }
const chats = [dm, group] as never

function written() {
  const out = dispatched.map((a) => [a.type, a.payload.chatUsersDm])
  dispatched.length = 0
  return out
}

describe("the sidebar's DMs and groups", () => {
  it("names a group and leaves the others as they were", () => {
    nameSidebarChat(dispatch, chats, "grp1", "Crew")
    const out = written()
    expect(out).toEqual([["users/createUserChatList", [dm, { dm_grouping_id: "grp1", dm_name: "Crew" }]]])
    expect(out[0][1][0]).toBe(dm)
  })

  it("takes a group's name away", () => {
    nameSidebarChat(dispatch, chats, "grp1", "")
    expect(written()).toEqual([["users/createUserChatList", [dm, { dm_grouping_id: "grp1", dm_name: undefined }]]])
  })

  it("writes nothing for a group that isn't listed or already says so", () => {
    nameSidebarChat(dispatch, chats, "grp9", "Crew")
    nameSidebarChat(dispatch, chats, "grp1", "Launch crew")
    nameSidebarChat(dispatch, chats, "dm1", "")
    nameSidebarChat(dispatch, undefined, "grp1", "Crew")
    expect(written()).toEqual([])
  })

  it("hides a DM or group", () => {
    hideSidebarChat(dispatch, chats, "dm1")
    expect(written()).toEqual([["users/createUserChatList", [group]]])
    hideSidebarChat(dispatch, undefined, "dm1")
    expect(written()).toEqual([["users/createUserChatList", []]])
  })
})
