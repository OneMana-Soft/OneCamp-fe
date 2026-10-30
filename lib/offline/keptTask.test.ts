import "fake-indexeddb/auto"
import { afterEach, describe, expect, it } from "vitest"
import { OfflineStore, registerKind } from "@/lib/offline/store"
import { taskKind } from "@/lib/offline/tasks"
import { wipeOfflineStore } from "@/lib/offline/wipe"
import { keptTaskOf } from "@/lib/offline/keptTask"

registerKind(taskKind)

let store: OfflineStore | undefined
afterEach(async () => {
  store?.close()
  store = undefined
  await wipeOfflineStore()
})

// A project's list as the device kept it: tasks by id, each with its key (projects A8K).
const LIST = "/project/taskList/p1?pageSize=50&pageIndex=0"
const answer = {
  data: {
    project_tasks: [
      { task_uuid: "t1", task_key: "Q4-12", task_name: "Write brief", sub_tasks: [{ task_uuid: "t1a", task_key: "Q4-13", task_name: "Outline" }] },
      { task_uuid: "t2", task_name: "Review" },
    ],
  },
}

describe("keptTaskOf: the task the device keeps under a key (asana-12 (a))", () => {
  it("finds a task, and a sub-task, by its key among the tasks the device keeps", async () => {
    store = await OfflineStore.open("sam")
    await store.saveRead(LIST, answer)
    expect(await keptTaskOf("Q4-12")).toBe("t1")
    expect(await keptTaskOf("Q4-13")).toBe("t1a")
  })

  it("finds nothing for a key no kept task has, or where the device keeps nothing", async () => {
    expect(await keptTaskOf("Q4-12")).toBeUndefined()
    store = await OfflineStore.open("sam")
    await store.saveRead(LIST, answer)
    expect(await keptTaskOf("Q4-99")).toBeUndefined()
  })

  it("leaves the store's database closed after it looks, so signing out still wipes it", async () => {
    store = await OfflineStore.open("sam")
    await store.saveRead(LIST, answer)
    await keptTaskOf("Q4-12")
    store.close()
    store = undefined
    // A connection left open would hold the wipe (its delete is blocked) until the test times out.
    await wipeOfflineStore()
    expect(await keptTaskOf("Q4-12")).toBeUndefined()
  })
})
