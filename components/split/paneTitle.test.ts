import { describe, expect, it, vi } from "vitest"

// A pane's title is pure (paneLook), tested without the views.
vi.mock("next/dynamic", () => ({ default: () => () => null }))

import { paneTitle } from "./paneLook"

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

  // 21 Oct: a doc or task beside the page that wasn't a recent visit was "Doc"
  // or "Task" (components/split/viewName.test.tsx renders it).
  it("is what a doc's or task's own view loaded, over a recent visit's older title", () => {
    expect(paneTitle(store, { kind: "doc", id: "d1" }, { data: { doc_title: "Q4 launch plan, final" } })).toBe("Q4 launch plan, final")
    expect(paneTitle(store, { kind: "doc", id: "d1" }, { data: { doc_title: " " } })).toBe("Untitled")
    expect(paneTitle(store, { kind: "task", id: "t1" }, { data: { task_name: "Book the launch retro" } })).toBe("Book the launch retro")
  })

  it("is the sidebar's for a doc it lists or has starred, until the doc's view has loaded", () => {
    const sb = { ...store.users.userSidebar, userDocs: [{ doc_uuid: "d2", doc_title: "Pricing" }], userStarred: [{ resource_uuid: "d3", title: "Roadmap" }] }
    const withDocs = { ...store, users: { userSidebar: sb } } as unknown as typeof store
    expect(paneTitle(withDocs, { kind: "doc", id: "d2" })).toBe("Pricing")
    expect(paneTitle(withDocs, { kind: "doc", id: "d3" })).toBe("Roadmap")
  })
})
