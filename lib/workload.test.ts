import { describe, expect, it } from "vitest"
import {
  UNASSIGNED,
  cellLabel,
  isWorkloadKey,
  loadOf,
  weekLabel,
  workloadKey,
  workloadRows,
  workloadWeeks,
  weeksLater,
  weeksToNextWeek,
  type WorkloadData,
  type WorkloadPerson,
  type WorkloadTask,
} from "@/lib/workload"

const local = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h)
const iso = (y: number, m: number, d: number, h: number) => local(y, m, d, h).toISOString()
// Wednesday 7 Oct 2026: this week starts on Monday the 5th.
const today = local(2026, 10, 7)
const weeks = workloadWeeks(today, 4)

const person = (id: string, more: Partial<WorkloadPerson> = {}): WorkloadPerson => ({
  user_uuid: id,
  user_name: id,
  capacity: 5,
  capacity_set: false,
  can_edit_capacity: false,
  project_uuids: ["p1"],
  ...more,
})
const task = (id: string, more: Partial<WorkloadTask> = {}): WorkloadTask => ({
  task_uuid: id,
  task_name: id,
  task_status: "todo",
  project_uuid: "p1",
  project_name: "Launch",
  can_edit: true,
  ...more,
})
const data = (people: WorkloadPerson[], tasks: WorkloadTask[], undated: WorkloadData["undated"] = []): WorkloadData => ({
  people,
  tasks,
  undated,
  default_capacity: 5,
  truncated: false,
})

describe("the workload's weeks", () => {
  it("start on this week's Monday", () => {
    expect(weeks.map((w) => w.getDate())).toEqual([5, 12, 19, 26])
    expect(weekLabel(weeks[0], 0, today)).toBe("This week")
    expect(weekLabel(weeks[1], 1, today)).toBe("Next week")
    expect(weekLabel(weeks[2], 2, today)).toBe("19 Oct")
    expect(weekLabel(local(2027, 1, 4), 5, today)).toBe("4 Jan 2027")
  })

  it("has its own address, recognised whatever the zone", () => {
    expect(workloadKey("Asia/Kolkata")).toBe("/project/workload?tz=Asia%2FKolkata&weeks=12")
    expect(isWorkloadKey(workloadKey("UTC", 4))).toBe(true)
    expect(isWorkloadKey("/project/overview?tz=UTC")).toBe(false)
  })
})

describe("workloadRows", () => {
  it("counts a task in each week it runs, for whoever has it", () => {
    const { people } = workloadRows(
      data(
        [person("alice")],
        [
          task("spec", {
            assignee_uuid: "alice",
            task_start_date: iso(2026, 10, 6, 9),
            task_due_date: iso(2026, 10, 14, 17),
          }),
          task("review", {
            assignee_uuid: "alice",
            task_due_date: iso(2026, 10, 21, 17),
          }),
          task("kickoff", {
            assignee_uuid: "alice",
            task_start_date: iso(2026, 10, 26, 9),
          }),
        ],
      ),
      weeks,
    )
    expect(people[0].weeks.map((w) => w.map((t) => t.task_uuid))).toEqual([["spec"], ["spec"], ["review"], ["kickoff"]])
  })

  it("puts what was due before this week in overdue, and leaves finished work out", () => {
    const { people } = workloadRows(
      data(
        [person("alice")],
        [
          task("late", {
            assignee_uuid: "alice",
            task_due_date: iso(2026, 10, 2, 17),
          }),
          task("done", {
            assignee_uuid: "alice",
            task_status: "done",
            task_due_date: iso(2026, 10, 6, 17),
          }),
          task("this week, already late", {
            assignee_uuid: "alice",
            task_due_date: iso(2026, 10, 5, 17),
          }),
        ],
      ),
      weeks,
    )
    expect(people[0].overdue.map((t) => t.task_uuid)).toEqual(["late"])
    expect(people[0].weeks[0].map((t) => t.task_uuid)).toEqual(["this week, already late"])
  })

  it("gives the tasks nobody has (or someone not shown has) their own row", () => {
    const { unassigned } = workloadRows(
      data(
        [person("alice")],
        [
          task("open", { task_due_date: iso(2026, 10, 8, 17) }),
          task("left", {
            assignee_uuid: "gone",
            task_due_date: iso(2026, 10, 8, 17),
          }),
        ],
        [{ project_uuid: "p1", count: 2 }],
      ),
      weeks,
    )
    expect(unassigned.key).toBe(UNASSIGNED)
    expect(unassigned.capacity).toBeNull()
    expect(unassigned.weeks[0]).toHaveLength(2)
    expect(unassigned.undated).toBe(2)
  })

  it("keeps to the projects shown: their tasks, their people, their tasks without dates", () => {
    const { people } = workloadRows(
      data(
        [person("alice", { project_uuids: ["p1", "p2"] }), person("bob", { project_uuids: ["p2"] })],
        [
          task("a1", {
            assignee_uuid: "alice",
            task_due_date: iso(2026, 10, 8, 17),
          }),
          task("a2", {
            assignee_uuid: "alice",
            project_uuid: "p2",
            task_due_date: iso(2026, 10, 8, 17),
          }),
        ],
        [
          { project_uuid: "p1", user_uuid: "alice", count: 3 },
          { project_uuid: "p2", user_uuid: "alice", count: 4 },
        ],
      ),
      weeks,
      new Set(["p1"]),
    )
    expect(people.map((r) => r.key)).toEqual(["alice"])
    expect(people[0].weeks[0].map((t) => t.task_uuid)).toEqual(["a1"])
    expect(people[0].undated).toBe(3)
  })

  it("puts the busiest against their capacity first", () => {
    const due = iso(2026, 10, 8, 17)
    const { people } = workloadRows(
      data(
        [person("ann", { capacity: 10 }), person("bea", { capacity: 2 }), person("cy")],
        [
          task("1", { assignee_uuid: "ann", task_due_date: due }),
          task("2", { assignee_uuid: "ann", task_due_date: due }),
          task("3", { assignee_uuid: "ann", task_due_date: due }),
          task("4", { assignee_uuid: "bea", task_due_date: due }),
          task("5", { assignee_uuid: "bea", task_due_date: due }),
        ],
      ),
      weeks,
    )
    // Bea is full (2 of 2); Ann has more tasks but room (3 of 10); Cy has none.
    expect(people.map((r) => r.key)).toEqual(["bea", "ann", "cy"])
    expect(people[0].peak).toBe(1)
  })
})

describe("how full a week is", () => {
  it("against their capacity", () => {
    expect(loadOf(0, 5)).toBe("free")
    expect(loadOf(3, 5)).toBe("room")
    expect(loadOf(5, 5)).toBe("full")
    expect(loadOf(6, 5)).toBe("over")
    expect(loadOf(9, null)).toBe("room")
  })

  it("says so to a screen reader", () => {
    const row = {
      key: "a",
      person: person("Alice", { capacity: 3 }),
      capacity: 3,
      overdue: [],
      weeks: [],
      undated: 0,
      peak: 0,
    }
    expect(cellLabel(row, "this week", 4)).toBe("Alice, this week: 4 tasks, 1 over their 3")
    expect(cellLabel(row, "next week", 3)).toBe("Alice, next week: 3 tasks, full")
    expect(cellLabel(row, "19 Oct", 1)).toBe("Alice, 19 Oct: 1 task, room for 2 more")
    expect(cellLabel({ ...row, person: null, capacity: null }, "this week", 2)).toBe("Nobody, this week: 2 tasks")
  })
})

describe("moving a task by weeks", () => {
  it("moves the dates a task has, keeping the weekday and the time of day", () => {
    const later = weeksLater({ task_start_date: iso(2026, 10, 30, 9), task_due_date: "" }, 1)
    expect(new Date(later.task_start_date).getDate()).toBe(6)
    expect(new Date(later.task_start_date).getHours()).toBe(9)
    expect(later.task_due_date).toBe("")
  })

  it("brings an overdue task to next week", () => {
    // Due Friday 25 Sep; next week starts on Monday 12 Oct: three weeks on, Friday 16 Oct.
    const late = { task_due_date: iso(2026, 9, 25, 17) }
    const n = weeksToNextWeek(late, weeks)
    expect(n).toBe(3)
    expect(new Date(weeksLater(late, n).task_due_date).getDate()).toBe(16)
    // Due last Sunday, the 4th: two weeks on, Sunday 18 Oct, the end of next week.
    expect(weeksToNextWeek({ task_due_date: iso(2026, 10, 4, 17) }, weeks)).toBe(2)
  })
})
