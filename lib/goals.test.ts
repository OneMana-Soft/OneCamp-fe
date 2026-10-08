import { describe, expect, it } from "vitest"
import {
  amount,
  checkInDue,
  dueLabel,
  filterGoals,
  goalTree,
  measureLine,
  paceGap,
  paceLine,
  parentChoices,
  percent,
  quarterEnd,
  type GoalSummary,
} from "@/lib/goals"

const goal = (id: string, over: Partial<GoalSummary> = {}): GoalSummary => ({
  id,
  title: id,
  owner: { user_uuid: "me", user_full_name: "Maya Chen" },
  due_date: "2026-12-31",
  measure: "projects",
  progress: 0.5,
  status: "open",
  projects: 1,
  subgoals: 0,
  can_edit: true,
  created_at: "2026-10-01T00:00:00Z",
  ...over,
})

describe("goals", () => {
  it("writes progress and amounts as the server does", () => {
    expect(percent(0.554)).toBe("55%")
    expect(percent(1.2)).toBe("100%")
    expect(percent(null)).toBe("—")
    expect(amount(410, "teams")).toBe("410 teams")
    expect(amount(250000, "$")).toBe("$250,000")
    expect(amount(1500000, "₹")).toBe("₹1,500,000")
    expect(amount(12.5, "%")).toBe("12.5%")
    expect(amount(3.456, "hours")).toBe("3.46 hours")
    expect(amount(-1200, "$")).toBe("-$1,200")
  })

  it("says what progress is made of", () => {
    expect(measureLine(goal("n", { measure: "number", current_value: 410, target_value: 500, unit: "teams" }))).toBe("410 of 500 teams")
    expect(measureLine(goal("m", { measure: "number", current_value: 2000, target_value: 5000, unit: "$" }))).toBe("$2,000 of $5,000")
    expect(measureLine(goal("p", { projects: 0 }))).toBe("No projects yet")
    expect(measureLine(goal("s", { measure: "subgoals", subgoals: 3 }))).toBe("3 sub-goals")
  })

  it("compares progress with the goal's time", () => {
    expect(paceGap(goal("a", { progress: 0.4, expected: 0.6 }))).toBe(-20)
    expect(paceLine(-20)).toBe("20 points behind its time")
    expect(paceLine(12)).toBe("12 points ahead of its time")
    expect(paceLine(3)).toBe("On pace")
    expect(paceGap(goal("b", { progress: null, expected: 0.6 }))).toBeUndefined()
    expect(paceGap(goal("c", { status: "achieved", expected: 0.6 }))).toBeUndefined()
  })

  it("asks for a check-in only of those who can, on open goals, after two weeks", () => {
    const now = Date.parse("2026-11-20T12:00:00Z")
    expect(checkInDue(goal("a"), now)).toBe(true)
    expect(checkInDue(goal("a", { checked_in_at: "2026-11-10T12:00:00Z" }), now)).toBe(false)
    expect(checkInDue(goal("a", { checked_in_at: "2026-11-01T12:00:00Z" }), now)).toBe(true)
    expect(checkInDue(goal("a", { can_edit: false }), now)).toBe(false)
    expect(checkInDue(goal("a", { status: "missed" }), now)).toBe(false)
  })

  it("reads goal dates as days", () => {
    expect(dueLabel("2026-12-31", new Date(2026, 9, 8))).toBe("31 Dec")
    expect(dueLabel("2027-03-31", new Date(2026, 9, 8))).toBe("31 Mar 2027")
    expect(quarterEnd(new Date(2026, 9, 8))).toBe("2026-12-31")
    expect(quarterEnd(new Date(2027, 1, 3))).toBe("2027-03-31")
  })

  it("lists goals under their parents, and orphans on their own", () => {
    const list = [goal("top"), goal("a", { parent_id: "top" }), goal("orphan", { parent_id: "gone" }), goal("b", { parent_id: "a" })]
    expect(goalTree(list).map((n) => `${n.goal.id}:${n.depth}`)).toEqual(["top:0", "a:1", "b:2", "orphan:0"])
    // A loop left in old data still shows every goal once.
    const loop = [goal("x", { parent_id: "y" }), goal("y", { parent_id: "x" })]
    expect(
      goalTree(loop)
        .map((n) => n.goal.id)
        .sort(),
    ).toEqual(["x", "y"])
  })

  it("never offers a goal's own sub-goals as its parent", () => {
    const list = [goal("top"), goal("a", { parent_id: "top" }), goal("b", { parent_id: "a" }), goal("done", { status: "achieved" })]
    expect(parentChoices(list, "a").map((g) => g.id)).toEqual(["top"])
    expect(parentChoices(list).map((g) => g.id)).toEqual(["top", "a", "b"])
  })

  it("filters by status, owner and words", () => {
    const list = [goal("Reach 500 teams"), goal("Theirs", { owner: { user_uuid: "jonas", user_full_name: "Jonas Weber" } }), goal("Old", { status: "dropped" })]
    expect(filterGoals(list, { status: "open", mine: false, query: "" }).map((g) => g.id)).toEqual(["Reach 500 teams", "Theirs"])
    expect(filterGoals(list, { status: "open", mine: true, query: "" }, "me").map((g) => g.id)).toEqual(["Reach 500 teams"])
    expect(filterGoals(list, { status: "open", mine: false, query: "jonas" }).map((g) => g.id)).toEqual(["Theirs"])
    expect(filterGoals(list, { status: "closed", mine: false, query: "" }).map((g) => g.id)).toEqual(["Old"])
  })
})
