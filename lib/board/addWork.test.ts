import { describe, expect, it } from "vitest"
import { workOfResult, workOfTask } from "./addWork"
import type { SearchResult } from "@/services/searchService"

// What the board's "Add from OneCamp" panel offers (miro-13 2): the things a
// card can draw, from the workspace search or a project's list, each with the
// link its card keeps.

const APP = "https://app.example.com"

describe("workOfResult: a search hit the panel offers", () => {
  it("a task, a doc and a project are offered with their card's link", () => {
    const task = { type: "task", task: { task_id: "t1", task_name: "Book the venue", task_status: "inProgress", task_project_name: "Launch", task_assignee_user_full_name: "Riya Shah" } } as SearchResult
    expect(workOfResult(task, APP)).toEqual({ kind: "task", id: "t1", title: "Book the venue", meta: "Launch · Riya Shah", status: "inProgress", link: `${APP}/app/task/t1` })
    const doc = { type: "doc", doc: { doc_uuid: "d1", doc_title: "" } } as SearchResult
    expect(workOfResult(doc, APP)).toEqual({ kind: "doc", id: "d1", title: "Untitled doc", meta: "Doc", link: `${APP}/app/doc/d1` })
    const project = { type: "project", project: { project_id: "p1", project_name: "Launch", project_team_name: "Events" } } as SearchResult
    expect(workOfResult(project, APP)).toEqual({ kind: "project", id: "p1", title: "Launch", meta: "Project · Events", link: `${APP}/app/project/p1` })
  })

  it("what has no card (a channel, a board, a message, a person) or names nothing isn't offered", () => {
    expect(workOfResult({ type: "channel", channel: { ch_id: "c1" } } as SearchResult, APP)).toBeNull()
    expect(workOfResult({ type: "board", board: { board_uuid: "b1" } } as SearchResult, APP)).toBeNull()
    expect(workOfResult({ type: "post", post: { post_id: "m1", post_ch_id: "c1" } } as SearchResult, APP)).toBeNull()
    expect(workOfResult({ type: "user", user: { user_uuid: "u1" } } as SearchResult, APP)).toBeNull()
    expect(workOfResult({ type: "task", task: {} } as SearchResult, APP)).toBeNull()
  })
})

describe("workOfTask: a project's task the panel offers", () => {
  it("carries its key and who has it, and its status for the glyph", () => {
    const t = { task_uuid: "t2", task_name: "Print badges", task_status: "todo", task_key: "EV-14", task_assignee: { user_name: "Sam Lee" } }
    expect(workOfTask(t as never, APP)).toEqual({ kind: "task", id: "t2", title: "Print badges", meta: "EV-14 · Sam Lee", status: "todo", link: `${APP}/app/task/t2` })
    expect(workOfTask({ task_uuid: "t3", task_name: "", task_status: "backlog" } as never, APP)).toEqual({ kind: "task", id: "t3", title: "Untitled task", meta: "", status: "backlog", link: `${APP}/app/task/t3` })
    expect(workOfTask({ task_uuid: "", task_name: "x", task_status: "todo" } as never, APP)).toBeNull()
  })
})
