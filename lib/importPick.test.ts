import { describe, expect, it } from "vitest"
import { ALL_OF_THEM, allOfThemLabel, optionsForPick } from "./importPick"
import type { DiscoverItem } from "@/services/importService"

const item = (id: string): DiscoverItem => ({ id, name: id, kind: "project" })

describe("the import card's pick, as the job's options", () => {
  // Each provider reads its own key. The pick used to go as discover_id,
  // which none of these read, so the whole account came across.
  it("limits Jira and Todoist to the picked project, or takes all of them when asked", () => {
    expect(optionsForPick("jira", "ENG", [item("ENG"), item("OPS")])).toEqual({ options: { project_key: "ENG" } })
    expect(optionsForPick("todoist", "launch", [item("launch")])).toEqual({ options: { project_id: "launch" } })
    expect(optionsForPick("jira", ALL_OF_THEM, [item("ENG"), item("OPS")])).toEqual({ options: {} })
    expect(optionsForPick("jira", "", [item("ENG")])).toEqual({ error: "Pick a Jira project, or all of them." })
    expect(optionsForPick("todoist", "", [])).toEqual({ options: {} })
    expect(allOfThemLabel("jira", 12)).toBe("All 12 projects")
    expect(allOfThemLabel("todoist", 1)).toBe("The 1 project")
    expect(allOfThemLabel("asana", 3)).toBeNull()
  })

  it("names the Asana workspace, taking the only one there is and asking when there are several", () => {
    expect(optionsForPick("asana", "123", [item("123"), item("456")])).toEqual({ options: { workspace_gid: "123" } })
    expect(optionsForPick("asana", "", [item("123")])).toEqual({ options: { workspace_gid: "123" } })
    expect(optionsForPick("asana", "", [item("123"), item("456")])).toEqual({ error: "Pick the Asana workspace to import." })
  })

  it("keeps the other providers' picks as they were", () => {
    expect(optionsForPick("trello", "", [], " 5f2c ")).toEqual({ options: { board_id: "5f2c" } })
    expect(optionsForPick("trello", "", [])).toEqual({ error: "Pick a Trello board." })
    expect(optionsForPick("notion", "db1", [])).toEqual({ options: { databases: ["db1"] } })
    expect(optionsForPick("linear", "", [])).toEqual({ options: {} })
    expect(optionsForPick("clickup", "w1", [])).toEqual({ options: { workspace_id: "w1" } })
    expect(optionsForPick("monday", "main", [])).toEqual({ options: { workspace_id: "main" } })
  })
})
