import { describe, expect, it, vi } from "vitest"
import { selectionPaletteEntries, taskPaletteEntries, UNASSIGNED, type SelectionForPalette, type TaskForPalette } from "./taskPaletteEntries"
import type { PaletteEntry } from "@/lib/ui/paletteEntries"
import { taskBranchName } from "./taskBranchName"
import { taskPageHref, taskPageUrl } from "./taskLinks"
import { displayNameOf } from "@/lib/personName"
import { pinTestClock } from "@/lib/testing/testClock"

// linear-28: what the open task offers the palette, made from what its panel
// holds; each pick goes to the panel's own handler.

// The selection's quick days are dates, so every test here reads them against
// the one test today (15 Oct 2026), whatever day the suite runs.
pinTestClock()

const ada = { user_uuid: "u-ada", user_name: "ada", user_full_name: "Ada Lovelace" }
const bo = { user_uuid: "u-bo", user_name: "bo" }

function task(over: Partial<TaskForPalette> = {}): TaskForPalette {
  return {
    taskUUID: "0a1b2c3d-4e5f-6789-abcd-ef0123456789",
    taskKey: "ENG-12",
    taskName: "Fix the login page!",
    // What the panel hands in: its page's address and the one name rule.
    link: taskPageUrl("ENG-12", "0a1b2c3d-4e5f-6789-abcd-ef0123456789"),
    canEdit: true,
    status: "in_progress",
    statusOptions: [
      { value: "todo", label: "To do" },
      { value: "in_progress", label: "In progress" },
      { value: "done", label: "Done" },
    ],
    onStatus: vi.fn(),
    priority: "high",
    priorityOptions: [
      { value: "urgent", label: "Urgent" },
      { value: "high", label: "High" },
    ],
    onPriority: vi.fn(),
    assigneeUUID: "u-bo",
    members: [ada, bo],
    aiTeammates: [],
    nameOf: displayNameOf,
    onAssignee: vi.fn(),
    // What the panel hands in for H1b: its rows' reads, made as a page opens, and their own changes.
    tags: vi.fn(async () => [
      { name: "frontend", current: true },
      { name: "needs review", current: false },
    ]),
    onTag: vi.fn(),
    cycles: vi.fn(async () => ({
      options: [
        { value: "c12", label: "Cycle 12 · 3 Nov – 16 Nov · current" },
        { value: "c13", label: "Cycle 13 · 17 Nov – 30 Nov" },
      ],
      current: "c12",
    })),
    onCycle: vi.fn(),
    milestones: vi.fn(async () => ({ options: [{ value: "m-beta", label: "Beta · in 2 weeks" }], current: "" })),
    onMilestone: vi.fn(),
    copy: vi.fn(),
    ...over,
  }
}

const byId = (t: TaskForPalette, id: string) => taskPaletteEntries(t).find((e) => e.id === id)!
/** An entry's choices as the palette takes them: a list, or a read that settles into one (H1b). */
const listed = async (e: PaletteEntry) => await e.choices!()

describe("the open task's palette actions", () => {
  it("offers its changes and its copies to someone who may edit it", () => {
    expect(taskPaletteEntries(task()).map((e) => e.id)).toEqual(["status", "priority", "assignee", "tags", "cycle", "milestone", "copy-key", "copy-link", "copy-branch"])
  })

  it("offers only the copies to someone who may only see it", () => {
    expect(taskPaletteEntries(task({ canEdit: false })).map((e) => e.id)).toEqual(["copy-key", "copy-link", "copy-branch"])
  })

  it("marks what it has now, and hands a pick to the panel's handler", async () => {
    const t = task()
    const status = byId(t, "status")
    expect((await listed(status)).filter((c) => c.current).map((c) => c.value)).toEqual(["in_progress"])
    status.apply!("done")
    expect(t.onStatus).toHaveBeenCalledWith("done")
    const priority = byId(t, "priority")
    expect((await listed(priority)).find((c) => c.current)?.value).toBe("high")
    priority.apply!("urgent")
    expect(t.onPriority).toHaveBeenCalledWith("urgent")
  })

  it("assigns a member by name, or no one", async () => {
    const t = task()
    const assignee = byId(t, "assignee")
    // Each member by the one name rule (lib/personName): the display name first.
    expect((await listed(assignee)).map((c) => [c.label, c.current === true])).toEqual([
      ["No one", false],
      ["ada", false],
      ["bo", true],
    ])
    assignee.apply!("u-ada")
    expect(t.onAssignee).toHaveBeenLastCalledWith(ada)
    assignee.apply!(UNASSIGNED)
    expect(t.onAssignee).toHaveBeenLastCalledWith(undefined)
  })

  it("copies its key, its page and its branch as the panel and the branch dialog write them", () => {
    const t = task()
    byId(t, "copy-key").run!()
    expect(t.copy).toHaveBeenLastCalledWith("ENG-12", "Copied ENG-12")
    byId(t, "copy-link").run!()
    expect(t.copy).toHaveBeenLastCalledWith(`${window.location.protocol}//${window.location.host}/app/task/ENG-12`, "Link copied")
    byId(t, "copy-branch").run!()
    expect(t.copy).toHaveBeenLastCalledWith("feature/0a1b2c3d-fix-the-login-page", "Branch name copied")
  })

  it("has no key to copy when the task has none, and its page goes by its id", () => {
    const t = task({ taskKey: undefined })
    expect(taskPaletteEntries(t).some((e) => e.id === "copy-key")).toBe(false)
    expect(taskPageHref(undefined, t.taskUUID)).toBe(`/app/task/${t.taskUUID}`)
    expect(taskBranchName("abc", "--A  b--")).toBe("feature/abc-a-b")
  })
})

// DB-57 and CR-127 on H1 (31 Oct): each action wears its own mark and each choice the app's mark for it, as the
// panel's own menus draw them; Assign to lists whom the panel's picker lists, its AI teammates too.
describe("the task's marks and its people", () => {
  const scout = { user_uuid: "u-scout", user_name: "scout", user_full_name: "Scout" }
  const choicesOf = (t: TaskForPalette, id: string) => listed(taskPaletteEntries(t).find((e) => e.id === id)!)

  it("gives each action its own mark, never the palette's page icon", () => {
    expect(Object.fromEntries(taskPaletteEntries(task()).map((e) => [e.id, e.mark]))).toEqual({
      status: { glyph: "status" },
      priority: { glyph: "priority" },
      assignee: { glyph: "people" },
      tags: { glyph: "tag" },
      cycle: { glyph: "cycle" },
      milestone: { glyph: "milestone" },
      "copy-key": { glyph: "key" },
      "copy-link": { glyph: "link" },
      "copy-branch": { glyph: "branch" },
    })
  })

  it("marks each choice as the panel's menus do: a status by its glyph, a priority by its level, a person by their avatar", async () => {
    const t = task()
    expect((await choicesOf(t, "status"))[1].mark).toEqual({ status: { value: "in_progress", label: "In progress" } })
    expect((await choicesOf(t, "priority")).map((c) => c.mark)).toEqual([{ priority: "urgent" }, { priority: "high" }])
    expect((await choicesOf(t, "assignee")).map((c) => c.mark)).toEqual([{ person: null }, { person: ada }, { person: bo }])
  })

  it("lists the workspace's AI teammates after the project's people, as the panel's picker does, and assigns one", async () => {
    const t = task({ aiTeammates: [scout], assigneeUUID: "u-scout" })
    const assign = taskPaletteEntries(t).find((e) => e.id === "assignee")!
    expect((await listed(assign)).map((c) => [c.label, !!c.current])).toEqual([
      ["No one", false],
      ["ada", false],
      ["bo", false],
      ["scout", true],
    ])
    assign.apply!("u-scout")
    expect(t.onAssignee).toHaveBeenCalledWith(scout)
  })

  it("leaves the task as it is when the person picked is no longer listed, rather than unassigning it", () => {
    const t = task()
    taskPaletteEntries(t).find((e) => e.id === "assignee")!.apply!("u-gone")
    expect(t.onAssignee).not.toHaveBeenCalled()
  })
})

// H1b (linear-28): Linear's ⌘K labels and moves the issue you are on. The task's tags, cycle and milestone are read
// when their page opens, through the panel's rows' own reads, and a pick goes to the row's own change. There is no
// move to another project in the app: a cycle and a milestone are its moves.
describe("the task's tags, cycle and milestone, read as their page opens", () => {
  it("reads nothing until a page opens", () => {
    const t = task()
    taskPaletteEntries(t)
    expect([t.tags, t.cycles, t.milestones].map((read) => (read as ReturnType<typeof vi.fn>).mock.calls.length)).toEqual([0, 0, 0])
  })

  it("moves it to one of the cycles its Cycle row offers, or out of its cycle, the one it is in marked", async () => {
    const t = task()
    const cycle = byId(t, "cycle")
    expect(cycle.label).toBe("Move to cycle…")
    expect((await listed(cycle)).map((c) => [c.value, c.label, !!c.current])).toEqual([
      ["", "No cycle", false],
      ["c12", "Cycle 12 · 3 Nov – 16 Nov · current", true],
      ["c13", "Cycle 13 · 17 Nov – 30 Nov", false],
    ])
    cycle.apply!("c13")
    expect(t.onCycle).toHaveBeenLastCalledWith("c13")
    cycle.apply!("")
    expect(t.onCycle).toHaveBeenLastCalledWith("")
  })

  it("moves it to a milestone its Milestone row offers, No milestone marked while it has none", async () => {
    const t = task()
    const milestone = byId(t, "milestone")
    expect(milestone.label).toBe("Move to milestone…")
    expect((await listed(milestone)).map((c) => [c.value, c.label, !!c.current])).toEqual([
      ["", "No milestone", true],
      ["m-beta", "Beta · in 2 weeks", false],
    ])
    milestone.apply!("m-beta")
    expect(t.onMilestone).toHaveBeenCalledWith("m-beta")
  })

  it("puts a tag on or takes it off, each tag wearing its own hue as the tag picker draws it", async () => {
    const t = task()
    const tags = byId(t, "tags")
    expect(tags.label).toBe("Add or remove tag…")
    expect((await listed(tags)).map((c) => [c.label, !!c.current, c.mark])).toEqual([
      ["frontend", true, { tag: "frontend" }],
      ["needs review", false, { tag: "needs review" }],
    ])
    tags.apply!("needs review")
    expect(t.onTag).toHaveBeenCalledWith("needs review")
  })

  it("says the read failed when a row's read fails, rather than offering nothing", async () => {
    const t = task({ cycles: vi.fn(async () => Promise.reject(new Error("offline"))) })
    await expect(listed(byId(t, "cycle"))).rejects.toThrow("offline")
  })
})

// linear-28 H1b: the selection's actions, offered by the list's selection bar
// (components/task/BulkTaskBar) while tasks are selected. The same fields as a
// task's, built by the same code, each with the bar's key, and each pick going
// to the bar's own change (which leaves out the tasks this person can't change).
describe("the selection's palette actions", () => {
  const BAR_FIELDS: SelectionForPalette["fields"] = [
    { field: "status", key: "S" },
    { field: "assignee", key: "A" },
    { field: "tags", key: "T" },
    { field: "priority", key: "P" },
    { field: "due", key: "D" },
    { field: "cycle", key: "⇧C" },
    { field: "milestone", key: "⇧M" },
  ]
  function selection(over: Partial<SelectionForPalette> = {}): SelectionForPalette {
    return {
      fields: BAR_FIELDS,
      statusOptions: task().statusOptions,
      onStatus: vi.fn(),
      priorityOptions: task().priorityOptions,
      onPriority: vi.fn(),
      people: vi.fn(async () => [ada, bo]),
      nameOf: displayNameOf,
      onAssignee: vi.fn(),
      // Across the selection: current is a tag every selected task has.
      tags: vi.fn(async () => [
        { name: "frontend", current: true },
        { name: "needs review", current: false },
      ]),
      onTag: vi.fn(),
      // The date picker's quick days, as the bar hands them in (components/ui/date-field-panels).
      dueDays: [
        { value: "2026-10-14T18:30:00.000Z", label: "Today" },
        { value: "2026-10-15T18:30:00.000Z", label: "Tomorrow" },
        { value: "2026-10-21T18:30:00.000Z", label: "Next week" },
      ],
      onDue: vi.fn(),
      cycles: [{ value: "c12", label: "Cycle 12 · 3 Nov – 16 Nov" }],
      onCycle: vi.fn(),
      milestones: vi.fn(async () => [{ value: "m-beta", label: "Beta · in 2 weeks" }]),
      onMilestone: vi.fn(),
      ...over,
    }
  }
  const entry = (s: SelectionForPalette, id: string) => selectionPaletteEntries(s).find((e) => e.id === id)!
  const rows = async (e: PaletteEntry) => (await listed(e)).map((c) => [c.value, c.label, !!c.current])

  it("offers the bar's fields in its order, each with the bar's key as the palette draws keys", () => {
    const entries = selectionPaletteEntries(selection())
    expect(entries.map((e) => [e.id, e.label, e.keys])).toEqual([
      ["status", "Change status…", "S"],
      ["assignee", "Assign to…", "A"],
      ["tags", "Add or remove tag…", "T"],
      ["priority", "Set priority…", "P"],
      ["due", "Set due date…", "D"],
      ["cycle", "Move to cycle…", "⇧ C"],
      ["milestone", "Move to milestone…", "⇧ M"],
    ])
    expect(entries.find((e) => e.id === "due")!.mark).toEqual({ glyph: "due" })
  })

  it("is the task's own actions where they share a field: the same words, the same marks", () => {
    const one = taskPaletteEntries(task())
    const shared = selectionPaletteEntries(selection()).filter((e) => one.some((o) => o.id === e.id))
    expect(shared.map((e) => e.id)).toEqual(["status", "assignee", "tags", "priority", "cycle", "milestone"])
    for (const e of shared) {
      const same = one.find((o) => o.id === e.id)!
      expect([e.label, e.keywords, e.mark]).toEqual([same.label, same.keywords, same.mark])
    }
  })

  it("offers only the fields the bar hands in, and nothing when it hands in none", () => {
    const fields = BAR_FIELDS.filter((f) => f.field === "status" || f.field === "priority")
    expect(selectionPaletteEntries(selection({ fields })).map((e) => e.id)).toEqual(["status", "priority"])
    expect(selectionPaletteEntries(selection({ fields: [] }))).toEqual([])
  })

  it("marks nothing current, since the tasks may differ, and hands a pick to the bar", async () => {
    const s = selection()
    const status = entry(s, "status")
    expect((await listed(status)).map((c) => [c.value, !!c.current, c.mark])).toEqual([
      ["todo", false, { status: { value: "todo", label: "To do" } }],
      ["in_progress", false, { status: { value: "in_progress", label: "In progress" } }],
      ["done", false, { status: { value: "done", label: "Done" } }],
    ])
    status.apply!("done")
    expect(s.onStatus).toHaveBeenCalledWith("done")
    const priority = entry(s, "priority")
    expect((await listed(priority)).some((c) => c.current)).toBe(false)
    priority.apply!("urgent")
    expect(s.onPriority).toHaveBeenCalledWith("urgent")
  })

  it("assigns them to one of the project's people, read as the page opens, or to no one", async () => {
    const s = selection()
    const assignee = entry(s, "assignee")
    expect(s.people).not.toHaveBeenCalled()
    expect(await rows(assignee)).toEqual([
      [UNASSIGNED, "No one", false],
      ["u-ada", "ada", false],
      ["u-bo", "bo", false],
    ])
    assignee.apply!("u-ada")
    expect(s.onAssignee).toHaveBeenLastCalledWith(ada)
    assignee.apply!(UNASSIGNED)
    expect(s.onAssignee).toHaveBeenLastCalledWith(undefined)
    // Someone no longer listed changes nothing.
    assignee.apply!("u-gone")
    expect(s.onAssignee).toHaveBeenCalledTimes(2)
  })

  it("puts a tag on them all or takes it off, the tags on every one marked, read as the page opens", async () => {
    const s = selection()
    const tags = entry(s, "tags")
    expect(s.tags).not.toHaveBeenCalled()
    expect((await listed(tags)).map((c) => [c.label, !!c.current, c.mark])).toEqual([
      ["frontend", true, { tag: "frontend" }],
      ["needs review", false, { tag: "needs review" }],
    ])
    tags.apply!("frontend")
    expect(s.onTag).toHaveBeenCalledWith("frontend")
  })

  it("sets their due date to one of the date picker's quick days, or takes it off", async () => {
    const s = selection()
    const due = entry(s, "due")
    expect(await rows(due)).toEqual([
      ["2026-10-14T18:30:00.000Z", "Today", false],
      ["2026-10-15T18:30:00.000Z", "Tomorrow", false],
      ["2026-10-21T18:30:00.000Z", "Next week", false],
      ["", "No due date", false],
    ])
    due.apply!("2026-10-15T18:30:00.000Z")
    expect(s.onDue).toHaveBeenLastCalledWith("2026-10-15T18:30:00.000Z")
    due.apply!("")
    expect(s.onDue).toHaveBeenLastCalledWith("")
  })

  it("moves them to one of the backlog's cycles or back to the backlog, and onto a milestone or off one", async () => {
    const s = selection()
    const cycle = entry(s, "cycle")
    expect(await rows(cycle)).toEqual([
      ["", "Backlog", false],
      ["c12", "Cycle 12 · 3 Nov – 16 Nov", false],
    ])
    cycle.apply!("")
    expect(s.onCycle).toHaveBeenLastCalledWith("")
    const milestone = entry(s, "milestone")
    expect(s.milestones).not.toHaveBeenCalled()
    expect(await rows(milestone)).toEqual([
      ["", "No milestone", false],
      ["m-beta", "Beta · in 2 weeks", false],
    ])
    milestone.apply!("m-beta")
    expect(s.onMilestone).toHaveBeenLastCalledWith("m-beta")
  })
})
