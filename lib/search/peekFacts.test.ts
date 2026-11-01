import { describe, expect, it } from "vitest"
import { dueWords } from "@/components/task/DueLabel"
import { pinTestClock, TEST_TODAY } from "@/lib/testing/testClock"
import type { SearchResult } from "@/services/searchService"
import type { TaskInfoInterface } from "@/types/task"
import { firstLine, hitPeek, taskFacts, taskFieldsOfHit, taskFieldsOfRead } from "./peekFacts"

// V-db63-1 S2: ⌘K's Space preview shows what its row can't.
// The facts take today as an argument, and the clock is pinned to that same day, so a date read anywhere in the code
// under test meets the today these dates are written against, on any day the suite runs (app/testClock.test.ts).
pinTestClock()
const NOW = TEST_TODAY
const at = (days: number, hour = 17) => new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + days, hour, 0).toISOString()

describe("taskFacts", () => {
  it("reads status, priority, assignee, due date and label, in Linear's order", () => {
    const facts = taskFacts({ id: "t", status: "inProgress", priority: "urgent", assignee: "Maya Chen", due: at(1), label: "Launch" }, NOW)
    expect(facts).toEqual([
      { kind: "status", text: "In progress", glyph: "progress" },
      { kind: "priority", text: "Urgent", level: 4 },
      { kind: "assignee", text: "Maya Chen" },
      { kind: "due", text: "Tomorrow", state: "upcoming" },
      { kind: "label", text: "Launch" },
    ])
  })

  it("gives each of a task's labels a fact of its own, as its card draws them (lib/tags)", () => {
    const labels = taskFacts({ id: "t", label: "Launch, ops ,, Launch" }, NOW).filter((f) => f.kind === "label")
    expect(labels).toEqual([
      { kind: "label", text: "Launch" },
      { kind: "label", text: "ops" },
      { kind: "label", text: "Launch" },
    ])
  })

  it("names a project's own status, drawn as the category it counts as", () => {
    expect(taskFacts({ id: "t", status: "inReview", statusName: "QA" }, NOW)).toEqual([{ kind: "status", text: "QA", glyph: "review" }])
  })

  it("leaves out what the task hasn't: no priority, nobody on it, no due date", () => {
    expect(taskFacts({ id: "t", status: "todo", priority: "" }, NOW)).toEqual([{ kind: "status", text: "To do", glyph: "todo" }])
    expect(taskFacts({ id: "t" }, NOW)).toEqual([])
  })

  // CODE-REVIEWER-143's MUST 1: the peek says a due date by the task UI's one rule (components/task/DueLabel), so it never
  // calls late what the task's row and panel call today. A due date is a day, set at local midnight (taskCreateForm).
  describe("says a due date as the task's row and panel do", () => {
    const due = (when: string, status = "inProgress") => taskFacts({ id: "t", status, due: when }, NOW).find((f) => f.kind === "due")
    const startOfToday = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate())

    it("due today, at local midnight or at any earlier time today, is today, never late", () => {
      expect(due(at(0, 0))).toEqual({ kind: "due", text: "Today", state: "today" })
      expect(due(new Date((startOfToday.getTime() + NOW.getTime()) / 2).toISOString())).toEqual({ kind: "due", text: "Today", state: "today" })
      expect(due(at(0, 23))).toEqual({ kind: "due", text: "Today", state: "today" })
    })

    it("due yesterday or before is overdue, in the row's words", () => {
      expect(due(at(-1, 0))).toEqual({ kind: "due", text: "Yesterday", state: "overdue" })
      expect(due(at(-2))).toEqual({ kind: "due", text: dueWords(new Date(at(-2)), NOW), state: "overdue" })
    })

    it("a finished task's due date is never late, however long ago", () => {
      expect(due(at(-2), "done")).toMatchObject({ state: "done" })
      expect(due(at(-2), "canceled")).toMatchObject({ state: "done" })
      expect(due(at(0, 0), "done")).toMatchObject({ text: "Today", state: "done" })
    })

    it("a later day is upcoming: tomorrow by name, then the date", () => {
      expect(due(at(1, 0))).toEqual({ kind: "due", text: "Tomorrow", state: "upcoming" })
      expect(due(at(9))).toEqual({ kind: "due", text: dueWords(new Date(at(9)), NOW), state: "upcoming" })
    })
  })

  it("says no due date for Go's zero time or a date it can't read", () => {
    expect(taskFacts({ id: "t", due: "0001-01-01T00:00:00Z" }, NOW)).toEqual([])
    expect(taskFacts({ id: "t", due: "soon" }, NOW)).toEqual([])
  })
})

describe("taskFieldsOfHit and taskFieldsOfRead", () => {
  it("take the index's fields from a hit, and nothing without its id", () => {
    expect(taskFieldsOfHit({ task_id: "t1", task_status: "done", task_priority: "low", task_assignee_user_full_name: " Ana ", task_label: "" })).toEqual({
      id: "t1", status: "done", priority: "low", assignee: "Ana", label: undefined,
    })
    expect(taskFieldsOfHit({ task_name: "No id" })).toBeUndefined()
    expect(taskFieldsOfHit(undefined)).toBeUndefined()
  })

  it("take the due date, a project's own status and the assignee's name from the task's read", () => {
    const read = { task_status: "inProgress", task_custom_status_name: "Booking", task_priority: "high", task_assignee: { user_name: "Maya Chen" }, task_due_date: at(1), task_label: "Ops" }
    expect(taskFieldsOfRead("t1", read as unknown as TaskInfoInterface)).toEqual({
      id: "t1", status: "inProgress", statusName: "Booking", priority: "high", assignee: "Maya Chen", due: at(1), label: "Ops",
    })
  })
})

describe("firstLine", () => {
  it("ends a line where a stored block ends, and decodes what the editor escaped", () => {
    expect(firstLine("<p>Ask facilities for the big room.</p><p>Then book the screens.</p>")).toBe("Ask facilities for the big room.")
    expect(firstLine("<p></p><p>  Here&#39;s   the&nbsp;plan </p>")).toBe("Here's the plan")
    expect(firstLine("<ul><li>First item</li><li>Second</li></ul>")).toBe("First item")
    expect(firstLine("One<br>Two")).toBe("One")
  })

  it("drops a line's leading Markdown marks, from GitHub or an import", () => {
    expect(firstLine("## The plan\nMore")).toBe("The plan")
    expect(firstLine("- [ ] Book the room")).toBe("Book the room")
    expect(firstLine("> Quoted words")).toBe("Quoted words")
    expect(firstLine("\n\n1. Step one")).toBe("Step one")
  })

  it("cuts a long line at a word near the limit, with an ellipsis", () => {
    const line = firstLine("alpha beta gamma delta epsilon zeta eta theta", 20)
    expect(line).toBe("alpha beta gamma…")
    expect(firstLine("a".repeat(30), 20)).toBe(`${"a".repeat(20)}…`)
  })

  it("says nothing for an empty body", () => {
    expect(firstLine(undefined)).toBe("")
    expect(firstLine("<p> </p>")).toBe("")
  })
})

describe("hitPeek", () => {
  it("gives a task hit its properties, its description's first line, and its project alone as where it's from", () => {
    const hit = { type: "task", task: { task_id: "t1", task_name: "Book the room", task_project_name: "Q4 launch", task_status: "todo", task_desc: "<p>Big room.</p>" } } as SearchResult
    expect(hitPeek(hit)).toEqual({ task: { id: "t1", status: "todo", priority: undefined, assignee: undefined, label: undefined }, meta: "Q4 launch", line: "Big room." })
  })

  it("leaves the row's own words where a task has no project", () => {
    expect(hitPeek({ type: "task", task: { task_id: "t2", task_name: "Loose" } } as SearchResult)).not.toHaveProperty("meta")
  })

  it("gives a doc or a board the first line it says, and other hits nothing", () => {
    expect(hitPeek({ type: "doc", doc: { doc_title: "Plan", doc_snippet: "Goals\nOwners" } } as SearchResult)).toEqual({ line: "Goals" })
    expect(hitPeek({ type: "doc", doc: { doc_title: "Plan", doc_body: "<p>From the body</p>" } } as SearchResult)).toEqual({ line: "From the body" })
    expect(hitPeek({ type: "board", board: { board_title: "Map", board_snippet: "Sticky one" } } as SearchResult)).toEqual({ line: "Sticky one" })
    expect(hitPeek({ type: "post", post: { post_body: "<p>Hi</p>" } } as SearchResult)).toEqual({})
  })
})
