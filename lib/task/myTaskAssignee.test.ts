import { describe, expect, it } from "vitest"
import { myTaskAssignee } from "./myTaskAssignee"

const launch = { project_members: [{ user_uuid: "u-sam" }, { user_uuid: "u-maya" }] }

describe("myTaskAssignee", () => {
  it("is the person making it, from My Tasks, in a project they belong to", () => {
    expect(myTaskAssignee({ assignToMe: true, selfUUID: "u-sam", assignee: "", project: launch })).toBe("u-sam")
  })
  it("keeps whoever the task already has", () => {
    expect(myTaskAssignee({ assignToMe: true, selfUUID: "u-sam", assignee: "u-maya", project: launch })).toBe("u-maya")
  })
  it("is nobody in a project they don't belong to, or before anyone is known", () => {
    expect(myTaskAssignee({ assignToMe: true, selfUUID: "u-lee", assignee: "", project: launch })).toBe("")
    expect(myTaskAssignee({ assignToMe: true, selfUUID: undefined, assignee: "", project: launch })).toBe("")
    expect(myTaskAssignee({ assignToMe: true, selfUUID: "u-sam", assignee: "", project: null })).toBe("")
  })
  it("leaves the task as it is away from My Tasks", () => {
    expect(myTaskAssignee({ assignToMe: false, selfUUID: "u-sam", assignee: "", project: launch })).toBe("")
  })
})
