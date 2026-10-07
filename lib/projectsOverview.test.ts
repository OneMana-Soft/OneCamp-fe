import { describe, expect, it } from "vitest"
import { filterOverview, glanceOf, needsAttention, overviewSummary, progressOf, sortOverview, type ProjectOverview } from "@/lib/projectsOverview"
import { projectGlanceParts } from "@/lib/utils/projectGlance"

const p = (name: string, o: Partial<ProjectOverview> = {}): ProjectOverview => ({
  project_uuid: name,
  project_name: name,
  is_admin: 0,
  open: 0,
  done: 0,
  overdue: 0,
  due_soon: 0,
  ...o,
})

const launch = p("Launch", { open: 6, done: 2, overdue: 3, health: "at_risk", updated_at: "2026-10-01T10:00:00Z", project_team: { team_uuid: "t", team_name: "Marketing" } })
const audit = p("audit prep", { open: 1, done: 9, health: "on_track", updated_at: "2026-10-06T10:00:00Z" })
const site = p("Website", { open: 4, done: 4, health: "off_track", updated_at: "2026-09-20T10:00:00Z" })
const hire = p("New hire", { open: 5, done: 0, overdue: 1 })
const empty = p("Empty")
const all = [launch, audit, site, hire, empty]
const names = (l: ProjectOverview[]) => l.map((x) => x.project_name)

describe("the projects overview", () => {
  it("measures progress as the share of tasks done, and a project with none at nothing", () => {
    expect(progressOf(audit)).toBeCloseTo(0.9)
    expect(progressOf(empty)).toBe(0)
  })

  it("needs attention when said to be off track or at risk, or with work past its date", () => {
    expect([launch, audit, site, hire, empty].map(needsAttention)).toEqual([true, false, true, true, false])
  })

  it("sorts by name without regard to case", () => {
    expect(names(sortOverview(all, "name"))).toEqual(["audit prep", "Empty", "Launch", "New hire", "Website"])
  })

  it("puts the projects in trouble first: off track, at risk, no word yet, then the most overdue", () => {
    expect(names(sortOverview(all, "attention"))).toEqual(["Website", "Launch", "New hire", "Empty", "audit prep"])
  })

  it("puts an on-track project with overdue work ahead of quiet ones, as the filter counts it", () => {
    const slipping = p("Slipping", { health: "on_track", open: 3, overdue: 2 })
    expect(names(sortOverview([empty, audit, slipping], "attention"))).toEqual(["Slipping", "Empty", "audit prep"])
  })

  it("puts the least done first, and the oldest update (or none) first", () => {
    expect(names(sortOverview(all, "progress"))).toEqual(["New hire", "Empty", "Launch", "Website", "audit prep"])
    expect(names(sortOverview(all, "updated"))).toEqual(["Empty", "New hire", "Website", "Launch", "audit prep"])
  })

  it("finds projects by every word of the search, in their name or team, and narrows to those needing attention", () => {
    expect(names(filterOverview(all, { query: "market  launch", filter: "all" }))).toEqual(["Launch"])
    expect(names(filterOverview(all, { query: "", filter: "attention" }))).toEqual(["Launch", "Website", "New hire"])
    expect(names(filterOverview(all, { query: "web", filter: "attention" }))).toEqual(["Website"])
  })

  it("sums up the workspace in one line", () => {
    expect(overviewSummary(all).map((s) => s.text)).toEqual(["5 projects", "1 off track", "1 at risk", "4 tasks overdue"])
    expect(overviewSummary([audit]).map((s) => s.text)).toEqual(["1 project"])
    expect(overviewSummary([])).toEqual([])
  })

  it("speaks of a project's tasks as the line under its name does", () => {
    expect(projectGlanceParts(glanceOf(launch))?.map((x) => x.text)).toEqual(["6 open", "3 overdue", "2 done"])
    expect(projectGlanceParts(glanceOf(empty))).toBeNull()
  })
})
