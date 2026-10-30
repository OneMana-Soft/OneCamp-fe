import { describe, expect, it } from "vitest"
import { ALL_OF_THEM, allOfThemLabel, optionsForPick, pickLabel } from "./importPick"
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

  // basecamp-46: a Basecamp sign-in can see several accounts; one is no
  // choice, several need one.
  it("names the Basecamp account, taking the only one there is and asking when there are several", () => {
    expect(pickLabel("basecamp")).toBe("Pick a Basecamp account")
    expect(optionsForPick("basecamp", "999", [item("999"), item("5")])).toEqual({ options: { account_id: "999" } })
    expect(optionsForPick("basecamp", "", [item("999")])).toEqual({ options: { account_id: "999" } })
    expect(optionsForPick("basecamp", "", [item("999"), item("5")])).toEqual({ error: "Pick the Basecamp account to import." })
  })

  it("keeps the other providers' picks as they were", () => {
    expect(optionsForPick("trello", "", [], " 5f2c ")).toEqual({ options: { board_id: "5f2c" } })
    expect(optionsForPick("trello", "", [])).toEqual({ error: "Pick a Trello board." })
    expect(optionsForPick("notion", "db1", [])).toEqual({ options: { databases: ["db1"] } })
    expect(optionsForPick("linear", "", [])).toEqual({ options: {} })
    expect(optionsForPick("clickup", "w1", [])).toEqual({ options: { workspace_id: "w1" } })
    expect(optionsForPick("monday", "main", [])).toEqual({ options: { workspace_id: "main" } })
    expect(optionsForPick("airtable", "appB", [])).toEqual({ options: { bases: ["appB"] } })
    expect(optionsForPick("airtable", "", [])).toEqual({ options: {} })
    expect(pickLabel("airtable")).toBe("Pick an Airtable base (optional)")
  })

  // Docs programme C4: Notion's pages come across as docs, its databases as
  // tables, and a picked database as a project too.
  it("brings Notion's pages when asked, with or without a database as a project", () => {
    expect(optionsForPick("notion", "", [], "", true)).toEqual({ options: { pages: true } })
    expect(optionsForPick("notion", "db1", [], "", true)).toEqual({ options: { databases: ["db1"], pages: true } })
    expect(optionsForPick("notion", "", [])).toEqual({ options: {} })
    expect(optionsForPick("trello", "", [], "", true)).toEqual({ error: "Pick a Trello board." })
    expect(pickLabel("notion")).toBe("Pick a Notion database")
    expect(pickLabel("notion", true)).toBe("Database to bring as a project (optional)")
  })

  it("brings one Miro board, or all of them, and asks when there are several and none is picked", () => {
    const boards = [
      { id: "b1", name: "Launch retro", kind: "board" },
      { id: "b2", name: "Roadmap", kind: "board" },
    ]
    expect(pickLabel("miro")).toBe("Pick a Miro board")
    expect(optionsForPick("miro", "b2", boards)).toEqual({ options: { board_id: "b2" } })
    expect(optionsForPick("miro", ALL_OF_THEM, boards)).toEqual({ options: {} })
    expect(optionsForPick("miro", "", boards)).toEqual({ error: "Pick a Miro board, or all of them." })
    expect(optionsForPick("miro", "", [boards[0]])).toEqual({ options: { board_id: "b1" } })
    expect(allOfThemLabel("miro", 2)).toBe("All 2 boards")
    expect(allOfThemLabel("miro", 1)).toBe("The 1 board")
  })

  // Google Sheets has no list to pick from: the admin pastes each spreadsheet's
  // address, or its id, and the server reads either (gsheets provider chosen).
  it("brings the Google Sheets spreadsheets pasted, a line or a space apart, and asks when none is", () => {
    const budget = "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0"
    const vendors = "1qpyC0XzvTcKT6EISywvqESX3A0MwQoFDE8p-Bll4hps"
    expect(pickLabel("gsheets")).toBe("Spreadsheets to bring")
    expect(optionsForPick("gsheets", "", [], ` ${budget}\n\n${vendors}  \n`)).toEqual({ options: { spreadsheets: [budget, vendors] } })
    expect(optionsForPick("gsheets", "", [], `${budget} ${vendors}`)).toEqual({ options: { spreadsheets: [budget, vendors] } })
    expect(optionsForPick("gsheets", "", [], " \n ")).toEqual({ error: "Paste the address of each spreadsheet to bring, one a line." })
  })
})
