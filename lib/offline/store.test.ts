import "fake-indexeddb/auto"
import { afterEach, describe, expect, it } from "vitest"
import { OfflineStore, registerKind } from "@/lib/offline/store"
import { Outbox } from "@/lib/offline/outbox"
import { overlay, taskKind, tasksIn } from "@/lib/offline/tasks"
import { wipeOfflineStore } from "@/lib/offline/wipe"
import { endSession } from "@/lib/sessionEnd"

registerKind(taskKind)

let open: OfflineStore[] = []
async function storeFor(member: string) {
  const s = await OfflineStore.open(member)
  open.push(s)
  return s
}
function closeAll() {
  open.forEach((s) => s.close())
  open = []
}

afterEach(async () => {
  closeAll()
  await wipeOfflineStore()
})

const LIST = "/project/taskList/p1?pageSize=50&pageIndex=0"
const answer = {
  data: {
    project_tasks: [
      { task_uuid: "t1", task_name: "Write brief", task_status: "todo", sub_tasks: [{ task_uuid: "t1a", task_name: "Outline" }] },
      { task_uuid: "t2", task_name: "Review", task_status: "done" },
    ],
  },
}

async function keepSome(member: string) {
  const store = await storeFor(member)
  await store.saveRead(LIST, answer)
  await new Outbox(store).enqueue({
    opKey: "k1", kind: "task", id: "t1", action: "update", method: "POST", url: "/task/updateTaskStatus",
    payload: { task_uuid: "t1", task_status: "done" }, field: "task_status", value: "done", hasBase: true, base: "todo",
  })
  return store
}

describe("the offline store", () => {
  it("keeps an answer whole and each task in it, sub-tasks included", async () => {
    const store = await keepSome("ann")
    expect((await store.read(LIST))?.answer).toEqual(answer)
    expect((await store.get("task", "t1"))?.value).toMatchObject({ task_name: "Write brief", task_status: "todo" })
    expect((await store.get("task", "t1a"))?.value).toMatchObject({ task_name: "Outline" })
  })

  it("is emptied when another member opens it (a member switch)", async () => {
    await keepSome("ann")
    closeAll()
    const bob = await storeFor("bob")
    expect(await bob.read(LIST)).toBeUndefined()
    expect(await bob.get("task", "t1")).toBeUndefined()
    expect(await new Outbox(bob).all()).toEqual([])
  })

  it("is deleted when the session ends (sign-out, an expired session's 401, another tab's sign-out)", async () => {
    await keepSome("ann")
    await endSession()
    closeAll()
    const ann = await storeFor("ann")
    expect(await ann.read(LIST)).toBeUndefined()
    expect(await new Outbox(ann).all()).toEqual([])
  })

  it("drops an entity the member lost, with the reads that show it and its waiting changes", async () => {
    const store = await keepSome("ann")
    const other = "/task/info/t2"
    await store.saveRead(other, { data: { task_uuid: "t2", task_name: "Review" } })
    await store.dropEntity("task", "t1")
    expect(await store.get("task", "t1")).toBeUndefined()
    expect(await store.read(LIST)).toBeUndefined()
    expect(await new Outbox(store).all()).toEqual([])
    expect(await store.read(other)).toBeDefined()
    expect(await store.get("task", "t2")).toBeDefined()
  })

  it("lays the member's waiting changes over a kept answer", () => {
    const shown = overlay(answer, [{ id: "t1", field: "task_status", value: "done" }]) as typeof answer
    expect(shown.data.project_tasks[0].task_status).toBe("done")
    expect(shown.data.project_tasks[1].task_status).toBe("done")
    expect(answer.data.project_tasks[0].task_status).toBe("todo")
  })

  it("finds tasks at any depth", () => {
    expect(tasksIn(answer).map((t) => t.id)).toEqual(["t1", "t1a", "t2"])
  })

  it("opens over a database made without its tables (an open that named no version)", async () => {
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.open("onecamp-offline")
      r.onsuccess = () => {
        r.result.close()
        resolve()
      }
      r.onerror = () => reject(r.error)
    })
    const store = await storeFor("ann")
    await store.saveRead(LIST, answer)
    expect((await store.read(LIST))?.answer).toEqual(answer)
  })
})
