import { describe, expect, it } from "vitest"
import { projectStatusesKey } from "./projectStatusesKey"
import { PROJECT_STATUSES_MESSAGE, statusesKeyOfMessage } from "./board/statusesMessage"

// A board's columns follow its project's order live: when an admin drags a
// column elsewhere, the server sends MESSAGE_PROJECT_STATUSES (43) on the
// project's topic and every open board reads the statuses again, by this key.
describe("a project-statuses message", () => {
  // The backend's MESSAGE_PROJECT_STATUSES (models/mqtt/struct.go); 41 and 42 are chat's and calls'.
  it("is message 43, as the server numbers it", () => {
    expect(PROJECT_STATUSES_MESSAGE).toBe(43)
  })

  it("names the project whose statuses are read again, by the key its board reads them with", () => {
    expect(statusesKeyOfMessage(JSON.stringify({ type: 43, data: { project_uuid: "p-1" } }))).toBe(projectStatusesKey("p-1"))
    expect(projectStatusesKey("p-1")).toBe("/project/p-1/statuses")
  })

  it("reads nothing again from one it can't read", () => {
    expect(statusesKeyOfMessage("not json")).toBeNull()
    expect(statusesKeyOfMessage(JSON.stringify({ type: 43, data: {} }))).toBeNull()
    expect(statusesKeyOfMessage(JSON.stringify({ type: 43, data: { project_uuid: 7 } }))).toBeNull()
    // Another message on the same topic (a task changed) reads nothing.
    expect(statusesKeyOfMessage(JSON.stringify({ type: 40, data: { project_uuid: "p-1" } }))).toBeNull()
    expect(statusesKeyOfMessage("null")).toBeNull()
  })
})
