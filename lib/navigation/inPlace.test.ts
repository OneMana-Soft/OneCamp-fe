import { describe, expect, it } from "vitest"
import { taskInPlace } from "./inPlace"

const HERE = "https://app.example.com/app/project/p1?tab=list"

// asana-12 (a): the one rule for a task opened with no network.
describe("taskInPlace", () => {
  it("opens a task in place only while the browser is offline", () => {
    expect(taskInPlace("/app/task/t1", false, HERE)).toBe("t1")
    expect(taskInPlace("/app/task/t1", true, HERE)).toBeNull()
  })

  it("takes a task's page however it's written: whole, with a trailing slash, a query, a hash or an escape", () => {
    expect(taskInPlace("https://app.example.com/app/task/t1", false, HERE)).toBe("t1")
    expect(taskInPlace("/app/task/t1/", false, HERE)).toBe("t1")
    expect(taskInPlace("/app/task/offline-7a5c?tab=comments#c1", false, HERE)).toBe("offline-7a5c")
    expect(taskInPlace("/app/task/a%20b", false, HERE)).toBe("a b")
  })

  it("leaves every other page, another site's and what isn't an address to the browser", () => {
    expect(taskInPlace("/app/task", false, HERE)).toBeNull()
    expect(taskInPlace("/app/task/t1/edit", false, HERE)).toBeNull()
    expect(taskInPlace("/app/project/p1", false, HERE)).toBeNull()
    expect(taskInPlace("https://elsewhere.example.com/app/task/t1", false, HERE)).toBeNull()
    expect(taskInPlace("http://[bad", false, HERE)).toBeNull()
    expect(taskInPlace("/app/task/%E0%A4%A", false, HERE)).toBeNull()
  })
})
