import { describe, expect, it } from "vitest"

import {
  connectedKey,
  countLabel,
  graphKindOfSearch,
  groupsIn,
  hrefOf,
  kindHue,
  kindLabel,
  labelOf,
  meetingDay,
  nextIndex,
  nodeKindOf,
  pathKey,
  reasonOf,
  sentenceOf,
  titleOf,
  verbOf,
  whyOf,
  type Connected,
  type GraphItem,
} from "./workGraph"
import { areaHue } from "@/lib/areas"
import { pinTestClock } from "@/lib/testing/testClock"

// A meeting's day is read against today: every test here on the one test day.
pinTestClock()

const task = { rel: "linked_from", kind: "task" as const, id: "t1", title: "Record the film" }
const proj = { rel: "in_project", kind: "project" as const, id: "p1", title: "Launch" }

describe("the work graph's words", () => {
  it("asks the server by kind, uuid and depth, and asks nothing without an id", () => {
    expect(connectedKey("doc", "d1", 2)).toBe("/graph/connected?kind=doc&uuid=d1&depth=2")
    expect(connectedKey("doc", "", 1)).toBe("")
    expect(pathKey({ kind: "doc", id: "d1" }, { kind: "project", id: "p1" })).toBe("/graph/path?from_kind=doc&from=d1&to_kind=project&to=p1")
    expect(pathKey({ kind: "doc", id: "d1" }, null)).toBe("")
  })

  it("says why a thing is here, through the thing in between two hops out", () => {
    const one: GraphItem = { ...task, depth: 1, path: [task] }
    const two: GraphItem = { ...proj, depth: 2, path: [task, proj] }
    expect(whyOf(one)).toBe("Links here")
    expect(whyOf(two)).toBe("Its project · via Record the film")
    const msg: GraphItem = { rel: "shared_in", kind: "message", id: "m1", title: "", data: { by_name: "Sam", channel_name: "launch" }, depth: 1, path: [] }
    msg.path = [msg]
    expect(whyOf(msg)).toBe("Shared in a message · Sam")
    expect(titleOf(msg)).toBe("A message in #launch")
  })

  it("has words for every relationship the server's allow-list names", () => {
    // domain/WorkGraph Edges' Rel values: a new one without words reads "Connected".
    const rels = ["linked_from", "links_to", "mentioned_by", "parent", "subpage", "in_folder", "contains", "holds", "shared_in", "created_by", "owned_by", "comment", "links_board", "in_project", "assigned_to", "blocked_by", "blocks", "subtask_of", "subtask", "task", "in_team", "memory", "shares", "posted_by", "in_channel", "message", "created", "owns", "assigned", "posted", "project", "on", "about", "organised_by", "with", "on_calendar_of", "meeting", "organised", "invited_to"]
    for (const r of rels) {
      expect(reasonOf(r), r).not.toBe("Connected")
      expect(verbOf(r), r).not.toBe("connects to")
    }
  })

  it("names a folder, a file and a link by what they are, and the doc tree's edge by what it joins (docs F1)", () => {
    const folder = { rel: "in_folder", kind: "doc" as const, id: "f1", title: "Finance", data: { node_kind: "folder", color: "moss" } }
    const file = { rel: "contains", kind: "doc" as const, id: "q3", title: "Q3 budget.xlsx", data: { node_kind: "file" } }
    const link = { rel: "holds", kind: "doc" as const, id: "l1", title: "", data: { node_kind: "link" } }
    const page = { rel: "parent", kind: "doc" as const, id: "n1", title: "Budget notes" }
    expect([folder, file, link, page].map(nodeKindOf)).toEqual(["folder", "file", "link", null])
    expect([folder, file, link, page].map(labelOf)).toEqual(["Folder", "File", "Link", "Doc"])
    // Only a doc is a folder, a file or a link; a page has no kind at all.
    expect(nodeKindOf({ kind: "task", data: { node_kind: "folder" } })).toBeNull()
    expect(nodeKindOf({ kind: "doc", data: { node_kind: "page" } })).toBeNull()
    expect(labelOf({ kind: "task" })).toBe("Task")
    expect(titleOf(link)).toBe("Untitled link")
    expect(whyOf({ ...folder, depth: 1, path: [folder] })).toBe("Its folder")
    expect(whyOf({ ...file, depth: 1, path: [file] })).toBe("In this folder")
    expect(whyOf({ ...link, depth: 2, path: [page, link] })).toBe("In this page · via Budget notes")
    // Pages under pages read as before.
    expect(reasonOf("parent")).toBe("Parent page")
    expect(reasonOf("subpage")).toBe("Subpage")
    const notes = { rel: "contains", kind: "doc" as const, id: "n1", title: "Budget notes" }
    expect(sentenceOf({ rel: "", kind: "doc", id: "q3", title: "Q3 budget.xlsx", data: { node_kind: "file" } }, [folder, notes])).toBe(
      "Q3 budget.xlsx is in the folder Finance contains Budget notes",
    )
  })

  it("two steps away, what the root's own folder holds is in the same folder; what a folder in it holds isn't (docs F1)", () => {
    const finance = { rel: "in_folder", kind: "doc" as const, id: "f1", title: "Finance", data: { node_kind: "folder" } }
    const sheet = { rel: "contains", kind: "doc" as const, id: "q3", title: "Q3 budget.xlsx", data: { node_kind: "file" } }
    expect(whyOf({ ...sheet, depth: 2, path: [finance, sheet] })).toBe("In the same folder · via Finance")
    const receipts = { rel: "contains", kind: "doc" as const, id: "r1", title: "Receipts", data: { node_kind: "folder" } }
    expect(whyOf({ ...sheet, depth: 2, path: [receipts, sheet] })).toBe("In this folder · via Receipts")
  })

  it("reads a path as one sentence", () => {
    expect(sentenceOf({ rel: "", kind: "doc", id: "d1", title: "Plan" }, [task, proj])).toBe("Plan is linked from Record the film is in Launch")
  })

  it("opens each kind where it lives, a message in its channel, a comment on what it's on", () => {
    expect(hrefOf({ kind: "doc", id: "d1" })).toBe("/app/doc/d1")
    expect(hrefOf({ kind: "message", id: "m1", data: { channel_id: "c1" } })).toBe("/app/channel/c1/m1")
    expect(hrefOf({ kind: "message", id: "m1" })).toBe("")
    expect(hrefOf({ kind: "comment", id: "x", data: { on_kind: "task", on_id: "t1" } })).toBe("/app/task/t1")
    expect(hrefOf({ kind: "memory", id: "n1" })).toBe("")
  })

  it("opens a direct message, and a reply in one, where the server says it opens for the reader (DG6)", () => {
    expect(hrefOf({ kind: "chat", id: "c1", data: { path: "/app/chat/u2/c1" } })).toBe("/app/chat/u2/c1")
    expect(hrefOf({ kind: "chat", id: "c1" })).toBe("")
    expect(hrefOf({ kind: "chat", id: "c1", data: { path: "https://elsewhere.example/" } })).toBe("")
    expect(hrefOf({ kind: "comment", id: "k1", data: { on_kind: "chat", on_id: "c1", on_path: "/app/chat/group/g1/c1" } })).toBe("/app/chat/group/g1/c1")
    const dm = { rel: "linked_from", kind: "chat" as const, id: "c1", title: "", data: { by_name: "Sam" } }
    expect(titleOf(dm)).toBe("A direct message from Sam")
    expect(whyOf({ ...dm, depth: 1, path: [dm] })).toBe("Links here")
    const group = { ...dm, data: { by_name: "Sam", path: "/app/chat/group/g1/c1" } }
    expect(titleOf(group)).toBe("A group message from Sam")
    expect(kindLabel("chat", 2)).toBe("Direct messages")
    expect(kindHue("chat")).toBe(areaHue("chat"))
  })

  it("colours a kind by its area (lib/areas), and people in neutral ink", () => {
    expect(kindHue("doc")).toBe(areaHue("docs"))
    expect([kindHue("task"), kindHue("project"), kindHue("board")]).toEqual([areaHue("projects"), areaHue("projects"), areaHue("projects")])
    expect([kindHue("channel"), kindHue("message")]).toEqual([areaHue("chat"), areaHue("chat")])
    expect([kindHue("person"), kindHue("team")]).toEqual(["ink", "ink"])
    expect(kindHue("memory")).toBe("agent")
    // Calls' berry and Tables' lake name nothing here.
    for (const k of ["doc", "task", "project", "person", "board", "channel", "message", "chat", "team", "comment", "memory"] as const) expect(["berry", "lake"]).not.toContain(kindHue(k))
  })

  it("counts only what came back, and says more only when the server did", () => {
    const c: Connected = {
      root: { rel: "", kind: "doc", id: "d", title: "Plan" },
      depth: 1,
      groups: [
        { kind: "task", items: [{ ...task, depth: 1, path: [task] }], more: false },
        { kind: "doc", items: [], more: true },
      ],
    }
    expect(countLabel(c)).toBe("1+ connected")
    expect(countLabel(undefined)).toBe("Nothing connected yet")
    expect(groupsIn(c, "all").map((g) => g.kind)).toEqual(["doc", "task"])
    expect(groupsIn(c, "task").map((g) => g.kind)).toEqual(["task"])
  })

  it("moves through rows with the arrows, Home and End, wrapping", () => {
    expect(nextIndex("ArrowDown", 2, 3)).toBe(0)
    expect(nextIndex("ArrowUp", 0, 3)).toBe(2)
    expect(nextIndex("End", 0, 3)).toBe(2)
    expect(nextIndex("x", 1, 3)).toBe(1)
    expect(nextIndex("ArrowDown", 0, 0)).toBe(-1)
  })

  it("enters a list from outside it at its first row going down and its last going up", () => {
    expect(nextIndex("ArrowDown", -1, 3)).toBe(0)
    expect(nextIndex("ArrowUp", -1, 3)).toBe(2)
  })

  it("takes search hits the graph holds and no others", () => {
    expect(graphKindOfSearch("docs")).toBe("doc")
    expect(graphKindOfSearch("users")).toBe("person")
    expect(graphKindOfSearch("events")).toBeNull()
  })
})

describe("a meeting in the work graph (DG13)", () => {
  const sync = { rel: "linked_from", kind: "event" as const, id: "e1", title: "Weekly sync", data: { start: { at: "2026-10-26T10:00:00Z", zone: "UTC" } } }
  const now = new Date("2026-10-22T12:00:00Z")

  it("is a meeting, in the calendar's colour, that opens on the calendar", () => {
    expect([kindLabel("event"), kindLabel("event", 2)]).toEqual(["Meeting", "Meetings"])
    expect(kindHue("event")).toBe(areaHue("calendar"))
    expect(hrefOf({ kind: "event", id: "e1" })).toBe("/app/calendar/event/e1")
    expect(groupsIn({ root: sync, depth: 1, groups: [{ kind: "person", items: [], more: false }, { kind: "event", items: [], more: false }, { kind: "doc", items: [], more: false }] }, "all").map((g) => g.kind)).toEqual(["doc", "event", "person"])
  })

  it("discussed a doc its notes link, on the day it meets", () => {
    expect(meetingDay(sync.data, now)).toBe("26 Oct")
    expect(meetingDay({ start: { date: "2027-01-04" } }, now)).toBe("4 Jan 2027")
    expect(meetingDay({}, now)).toBe("")
    expect(whyOf({ ...sync, depth: 1, path: [sync] })).toMatch(/^Discussed this · \d+ \w+/)
    expect(whyOf({ ...sync, data: {}, depth: 1, path: [sync] })).toBe("Discussed this")
    expect(sentenceOf({ rel: "", kind: "doc", id: "d1", title: "Plan" }, [sync])).toBe("Plan was discussed in Weekly sync")
    // A doc that links a doc is still linked from it.
    expect(reasonOf("linked_from", "doc")).toBe("Links here")
  })

  it("names its people and its calendar from either side", () => {
    expect([reasonOf("organised_by"), reasonOf("with"), reasonOf("on_calendar_of")]).toEqual(["Organiser", "Invited", "Its calendar"])
    expect([reasonOf("meeting"), reasonOf("organised"), reasonOf("invited_to")]).toEqual(["On its calendar", "Organised by them", "Invites them"])
    expect(titleOf({ kind: "event", title: " " })).toBe("Untitled meeting")
  })
})

describe("the picker's hits", () => {
  it("takes docs, tasks, projects, people, channels and boards from search, each once, never the thing itself", async () => {
    const { picksOf } = await import("./workGraph")
    const page = [
      { type: "doc", doc: { doc_uuid: "D1", doc_title: "Plan" } },
      { type: "doc", doc: { doc_uuid: "d1", doc_title: "Plan again" } },
      { type: "user", user: { user_uuid: "u1", user_full_name: "Sam Rivera" } },
      { type: "channel", channel: { ch_uuid: "c1", ch_name: "launch" } },
      { type: "post", post: { post_uuid: "p1" } },
      { type: "project", project: { project_id: "pr1", project_name: "Launch" } },
      { type: "task", task: { task_uuid: "self", task_name: "Me" } },
    ]
    expect(picksOf(page, { kind: "task", id: "SELF" })).toEqual([
      { kind: "doc", id: "D1", title: "Plan" },
      { kind: "person", id: "u1", title: "Sam Rivera" },
      { kind: "channel", id: "c1", title: "#launch" },
      { kind: "project", id: "pr1", title: "Launch" },
    ])
  })
})
