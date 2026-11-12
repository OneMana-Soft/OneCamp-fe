import { beforeEach, describe, expect, it, vi } from "vitest"

// The reference pickers' search ("+" links a doc, board, task or project into
// text, "#" a channel): each workspace search hit read as the thing it links,
// by the ids the search index carries (models/openSearch: a task's is task_id,
// a project's project_id), "Untitled ..." for one with no title, and its own
// second line. The four work kinds are read the one way every picker that
// links one reads them (lib/search/hitRef).

const post = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: (...args: unknown[]) => post(...args) } }))

import { searchReferences } from "./referenceMentionList"

const WORK = ["doc", "board", "task", "project"] as const
const found = (...page: object[]) => post.mockResolvedValue({ data: { data: { page } } })

beforeEach(() => post.mockReset())

describe("the reference pickers' search", () => {
  it("reads a doc, a board, a task and a project by their ids, each with its own second line", async () => {
    found(
      { type: "doc", doc: { doc_uuid: "d1", doc_title: "Launch brief", doc_created_by_user_full_name: "Maya Rao" } },
      { type: "board", board: { board_uuid: "b1", board_title: "Launch board", board_created_by_user_full_name: "Sam Lee" } },
      { type: "task", task: { task_id: "t1", task_name: "Launch checklist", task_assignee_user_full_name: "Ana Diaz" } },
      { type: "project", project: { project_id: "p1", project_name: "Launch" } },
    )
    expect(await searchReferences("la", [...WORK])).toEqual([
      { routeId: "d1", label: "Launch brief", refType: "doc", subtitle: "Doc · Maya Rao" },
      { routeId: "b1", label: "Launch board", refType: "board", subtitle: "Board · Sam Lee" },
      { routeId: "t1", label: "Launch checklist", refType: "task", subtitle: "Task · Ana Diaz" },
      { routeId: "p1", label: "Launch", refType: "project", subtitle: "Project" },
    ])
    expect(post).toHaveBeenCalledWith(expect.any(String), { global_search_text: "la" })
  })

  it("names an untitled one as such, and leaves out a hit with no id", async () => {
    found(
      { type: "doc", doc: { doc_uuid: "d2" } },
      { type: "board", board: { board_uuid: "b2" } },
      { type: "task", task: { task_id: "t2" } },
      { type: "project", project: { project_id: "p2" } },
      { type: "task", task: { task_name: "No id" } },
      { type: "project", project: { project_name: "No id" } },
    )
    expect(await searchReferences("la", [...WORK])).toEqual([
      { routeId: "d2", label: "Untitled doc", refType: "doc", subtitle: "Doc" },
      { routeId: "b2", label: "Untitled board", refType: "board", subtitle: "Board" },
      { routeId: "t2", label: "Untitled task", refType: "task", subtitle: "Task" },
      { routeId: "p2", label: "Untitled project", refType: "project", subtitle: "Project" },
    ])
  })

  it("offers only the kinds its trigger links: a channel for #, the work for +", async () => {
    found(
      { type: "channel", channel: { ch_id: "c1", ch_name: "launch" } },
      { type: "doc", doc: { doc_uuid: "d1", doc_title: "Launch brief" } },
      { type: "user", user: { user_uuid: "u1" } },
      { type: "task", task: { task_id: "t1", task_name: "Launch checklist" } },
    )
    expect(await searchReferences("la", ["channel"])).toEqual([{ routeId: "c1", label: "launch", refType: "channel" }])
    expect((await searchReferences("la", [...WORK])).map((i) => `${i.refType} ${i.routeId}`)).toEqual(["doc d1", "task t1"])
  })

  it("searches nothing for no words", async () => {
    expect(await searchReferences("  ", [...WORK])).toEqual([])
    expect(post).not.toHaveBeenCalled()
  })
})
