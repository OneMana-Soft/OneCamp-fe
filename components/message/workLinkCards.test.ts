import { describe, expect, it } from "vitest"
import { workLinksIn } from "@/components/message/WorkLinkCards"

const T = "3f2a1c9e-1111-4222-8333-944455556666"
const D = "7b6c5d4e-aaaa-4bbb-8ccc-ddddeeeeffff"
const P = "0a1b2c3d-1234-4567-89ab-cdef01234567"

describe("which links in a message become cards", () => {
  it("finds tasks, docs and projects, linked or pasted as text", () => {
    const html = `<p>See <a href="https://work.example.com/app/task/${T}">this</a> and /app/doc/${D}, also https://work.example.com/app/project/${P}</p>`
    expect(workLinksIn(html, "work.example.com")).toEqual([
      { kind: "task", id: T },
      { kind: "doc", id: D },
      { kind: "project", id: P },
    ])
  })

  it("leaves another workspace's links alone", () => {
    expect(workLinksIn(`https://other.example.com/app/task/${T}`, "work.example.com")).toEqual([])
  })

  it("makes one card per item, and at most three", () => {
    const ids = Array.from({ length: 5 }, (_, i) => `${i}${T.slice(1)}`)
    const text = [T, T, ...ids].map((id) => `/app/task/${id}`).join(" ")
    const got = workLinksIn(text, "x")
    expect(got).toHaveLength(3)
    expect(got[0].id).toBe(T)
    expect(new Set(got.map((l) => l.id)).size).toBe(3)
  })

  it("ignores links that are not to an item", () => {
    expect(workLinksIn("/app/task/not-an-id /app/channel/" + T + " /app/home", "x")).toEqual([])
  })
})

describe("what a work card shows", async () => {
  const { statusKindOf, checklistOf } = await import("@/components/message/WorkLinkCards")
  it("draws a task's built-in status as its glyph, a custom one as to do", () => {
    expect(["backlog", "todo", "inProgress", "inReview", "done", "canceled", "Waiting on legal"].map(statusKindOf)).toEqual([
      "backlog", "todo", "progress", "review", "done", "cancelled", "todo",
    ])
  })
  it("counts a doc's checklist from its stored body", () => {
    const li = (checked: boolean) => `<li data-type="taskItem" data-checked="${checked}"><p>x</p></li>`
    expect(checklistOf(`<ul data-type="taskList">${li(true)}${li(true)}${li(false)}</ul>`)).toEqual({ done: 2, total: 3 })
    expect(checklistOf("<p>No list</p>")).toEqual({ done: 0, total: 0 })
    expect(checklistOf(undefined)).toEqual({ done: 0, total: 0 })
  })
})
