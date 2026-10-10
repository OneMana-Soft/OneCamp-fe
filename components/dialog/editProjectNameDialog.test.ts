import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// Renaming a project said "Edit Project", labelled its field "Channel Name"
// (the wrong noun, in title case) and offered "Update Project name".
describe("renaming a project", () => {
  const src = readFileSync("components/dialog/editProjectNameDialog.tsx", "utf8")
  it("names the project's field as the project's name, in sentence case", () => {
    expect(src).toContain('<Label htmlFor="projectName">Project name</Label>')
    expect(src).not.toMatch(/Channel Name|channel name|Edit Project|Update Project/)
  })
})
