import { describe, expect, it } from "vitest"

import { pinTestClock } from "@/lib/testing/testClock"

import { groupByTeam } from "./boardPlaceGroups"

// An archived project carries the day it was archived: the clock it reads is the suite's.
pinTestClock()

describe("the picker's projects under their teams", () => {
  const project = (uuid: string, name: string, team?: [string, string], deleted = "") => ({ project_uuid: uuid, project_name: name, project_deleted_at: deleted, project_team: team ? { team_uuid: team[0], team_name: team[1] } : null })
  it("groups projects under their teams, an archived one too, A to Z, the viewer's teams pickable, teamless projects last", () => {
    const groups = groupByTeam(
      [
        project("p3", "Website relaunch", ["t2", "Marketing"]),
        project("p1", "App", ["t1", "Design"]),
        project("p4", "Old site", ["t2", "Marketing"], "2026-10-01T00:00:00Z"),
        project("p5", "Hiring"),
        project("p2", "Brand", ["t1", "Design"]),
      ],
      [{ team_uuid: "t1", team_name: "Design" }, { team_uuid: "t9", team_name: "Ops" }],
    )
    expect(groups.map((g) => [g.team?.name ?? null, g.team?.pickable ?? null, g.projects.map((p) => p.name)])).toEqual([
      ["Design", true, ["App", "Brand"]],
      ["Marketing", false, ["Old site", "Website relaunch"]],
      ["Ops", true, []],
      [null, null, ["Hiring"]],
    ])
  })
})
