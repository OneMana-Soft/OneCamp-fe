import { describe, expect, it } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { placeAddress } from "./newTaskAddress"

pinTestClock()

const values = (query: string) => {
  const { name, description, due, priority, tags, estimate, toMe, project } = placeAddress(query)
  return { name, description, due, priority, tags, estimate, toMe, project }
}

describe("a new task's address", () => {
  it("names its fields under Linear's names or ours", () => {
    expect(values("title=Write+the+launch+post&description=Two+lines&project=q4&status=In+review&priority=High&assignee=me&labels=launch,+web,,&due=2026-11-02&estimate=2h")).toEqual({
      name: "Write the launch post",
      description: "<p>Two lines</p>",
      due: new Date(2026, 10, 2),
      priority: "high",
      tags: "launch, web",
      estimate: "2h",
      toMe: true,
      project: "q4",
    })
    expect(values("name=Ship&tags=a&dueDate=2026-02-01")).toMatchObject({ name: "Ship", tags: "a", due: new Date(2026, 1, 1) })
  })

  it("names nothing it can't use", () => {
    expect(values("title=++&priority=critical&due=2026-02-30")).toMatchObject({ name: "", priority: "", tags: "", due: undefined })
    expect(values("due=tomorrow").due).toBeUndefined()
    expect(values("due=2026-1-5").due).toBeUndefined()
    expect(values("")).toEqual({ name: "", description: "", due: undefined, priority: "", tags: "", estimate: "", toMe: false, project: "" })
  })

  it("puts its description in the editor as text, a paragraph a line", () => {
    const description = new URLSearchParams({ description: '<img src=x onerror="alert(1)">\nSecond & last' }).toString()
    expect(placeAddress(description).description).toBe("<p>&lt;img src=x onerror=\"alert(1)\"&gt;</p><p>Second &amp; last</p>")
  })
})

describe("what an address names, found among the reader's", () => {
  const projects = [
    { project_uuid: "p1", project_name: "Launch", project_key: "Q4" },
    { project_uuid: "p2", project_name: "Roadmap" },
  ]
  it("finds a project by key in any case, or by id", () => {
    expect(placeAddress("project=q4").projectAmong(projects)?.project_uuid).toBe("p1")
    expect(placeAddress("project=p2").projectAmong(projects)?.project_uuid).toBe("p2")
    expect(placeAddress("project=RM").projectAmong(projects)).toBeUndefined()
    expect(placeAddress("").projectAmong(projects)).toBeUndefined()
    expect(placeAddress("project=q4").projectAmong(undefined)).toBeUndefined()
  })

  it("finds a status by key or name, any case", () => {
    const options = [
      { value: "todo", label: "To do" },
      { value: "inReview", label: "In review" },
      { value: "c1", label: "QA" },
    ]
    const status = (named: string) => placeAddress(new URLSearchParams({ status: named }).toString()).statusAmong(options)
    expect(status("inreview")).toBe("inReview")
    expect(status("In Review")).toBe("inReview")
    expect(status("qa")).toBe("c1")
    expect(status("Shipped")).toBe("")
    expect(status("")).toBe("")
  })

  it("finds a member by id, or by a name only one of them has, and leaves me to the form's own rule", () => {
    const members = [
      { user_uuid: "u1", user_name: "Maya Rivera" },
      { user_uuid: "u2", user_name: "Sam" },
      { user_uuid: "u3", user_name: "sam" },
      { user_uuid: "u4" },
    ]
    const member = (named: string) => placeAddress(new URLSearchParams({ assignee: named }).toString()).memberAmong(members)
    expect(member("maya rivera")).toBe("u1")
    expect(member("u4")).toBe("u4")
    expect(member("Sam")).toBe("")
    expect(member("Me")).toBe("")
    expect(member("Noor")).toBe("")
    expect(placeAddress("assignee=u1").memberAmong(undefined)).toBe("")
    expect([placeAddress("assignee=Me").toMe, placeAddress("assignee=Maya+Rivera").toMe, placeAddress("").toMe]).toEqual([true, false, false])
  })
})
