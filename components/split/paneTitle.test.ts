import { describe, expect, it, vi } from "vitest"

// SplitPane draws views lazily; its title is pure, tested without them.
vi.mock("next/dynamic", () => ({ default: () => () => null }))

import { paneTitle } from "./SplitPane"

const store = {
  users: {
    userSidebar: {
      userChannels: [{ ch_uuid: "ch1", ch_name: "design" }],
      userFavChannels: [{ ch_uuid: "ch2", ch_name: "engineering" }],
      userProjects: [{ project_uuid: "p1", project_name: "Q4 launch" }],
      userChats: [
        { dm_grouping_id: "g1", dm_participants: [{ user_uuid: "u1", user_name: "Maya Chen", user_full_name: "Maya Chen" }] },
        {
          dm_grouping_id: "g2",
          dm_participants: [
            { user_uuid: "u1", user_name: "Maya Chen", user_full_name: "Maya Chen" },
            { user_uuid: "u2", user_name: "Jonas Weber", user_full_name: "Jonas Weber" },
          ],
        },
      ],
    },
  },
  recentItems: { items: [{ id: "d1", title: "Q4 launch plan" }] },
} as unknown as Parameters<typeof paneTitle>[0]

// Design v3, shell V2: the bar over a pane said "Channel" over a channel
// whose own name was the next thing down.
describe("a split pane's name", () => {
  it("is the place's own name where the sidebar knows it", () => {
    expect(paneTitle(store, { kind: "channel", id: "ch1" })).toBe("design")
    expect(paneTitle(store, { kind: "channel", id: "ch2" })).toBe("engineering")
    expect(paneTitle(store, { kind: "project", id: "p1" })).toBe("Q4 launch")
    expect(paneTitle(store, { kind: "chat", id: "u1" })).toBe("Maya Chen")
    expect(paneTitle(store, { kind: "group", id: "g2" })).toBe("Maya Chen, Jonas Weber")
  })

  it("is a recent visit's title for a doc or task, and nothing (so the kind) when unknown", () => {
    expect(paneTitle(store, { kind: "doc", id: "d1" })).toBe("Q4 launch plan")
    expect(paneTitle(store, { kind: "task", id: "nope" })).toBeNull()
  })
})
