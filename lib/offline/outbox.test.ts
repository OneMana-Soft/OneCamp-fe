import "fake-indexeddb/auto"
import { afterEach, describe, expect, it } from "vitest"
import { OfflineStore, registerKind } from "@/lib/offline/store"
import { MAX_BYTES, MAX_OPS, MAX_TRIES, Outbox, type NewOp, type Op, type Outcome } from "@/lib/offline/outbox"
import { taskKind } from "@/lib/offline/tasks"
import { wipeOfflineStore } from "@/lib/offline/wipe"

registerKind(taskKind)

let open: OfflineStore[] = []
async function storeFor(member: string) {
  const s = await OfflineStore.open(member)
  open.push(s)
  return s
}

afterEach(async () => {
  open.forEach((s) => s.close())
  open = []
  await wipeOfflineStore()
})

let n = 0
function change(id: string, field: string, value: unknown, extra: Partial<NewOp> = {}): NewOp {
  n++
  return {
    opKey: `k${n}`,
    kind: "task",
    id,
    action: "update",
    method: "POST",
    url: `/task/update/${field}`,
    payload: { task_uuid: id, [field]: value },
    field,
    value,
    hasBase: false,
    ...extra,
  }
}

describe("the outbox", () => {
  it("keeps changes across a reopen (a reload), in the order made", async () => {
    const box = new Outbox(await storeFor("ann"))
    await box.enqueue(change("t1", "task_status", "done"))
    await box.enqueue(change("t2", "task_name", "Ship it"))
    open.forEach((s) => s.close())
    open = []
    const again = new Outbox(await storeFor("ann"))
    expect((await again.all()).map((o) => [o.id, o.value])).toEqual([
      ["t1", "done"],
      ["t2", "Ship it"],
    ])
  })

  it("a second change to a field still waiting replaces the first's value and keeps its base", async () => {
    const box = new Outbox(await storeFor("ann"))
    await box.enqueue(change("t1", "task_status", "in_progress", { base: "todo", hasBase: true }))
    await box.enqueue(change("t1", "task_status", "done", { base: "in_progress", hasBase: true }))
    const ops = await box.all()
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ value: "done", base: "todo" })
  })

  it("refuses a change past the count cap, and never drops one already waiting", async () => {
    const box = new Outbox(await storeFor("ann"))
    for (let i = 0; i < MAX_OPS; i++) {
      const r = await box.enqueue(change(`t${i}`, "task_name", `n${i}`))
      expect(r.ok).toBe(true)
    }
    const over = await box.enqueue(change("tx", "task_name", "one more"))
    expect(over).toEqual({ ok: false, reason: "full", waiting: MAX_OPS })
    expect(await box.all()).toHaveLength(MAX_OPS)
  })

  it("refuses a change past the byte cap", async () => {
    const box = new Outbox(await storeFor("ann"))
    // Each change carries the value twice (its payload and its value): a third of the cap each.
    const big = "x".repeat(MAX_BYTES / 6)
    expect((await box.enqueue(change("t1", "task_name", big))).ok).toBe(true)
    expect((await box.enqueue(change("t2", "task_name", big))).ok).toBe(true)
    const over = await box.enqueue(change("t3", "task_name", big))
    expect(over.ok).toBe(false)
    expect(await box.all()).toHaveLength(2)
  })

  it("sends per entity in order: a conflict holds back that task's later changes, not another task's", async () => {
    const box = new Outbox(await storeFor("ann"))
    await box.enqueue(change("t1", "task_status", "done"))
    await box.enqueue(change("t2", "task_name", "Other"))
    await box.enqueue(change("t1", "task_name", "Later"))
    const sent: string[] = []
    const report = await box.replay(async (op: Op): Promise<Outcome> => {
      if (op.id === "t1" && op.field === "task_status") return { kind: "conflict", theirs: "in_review" }
      sent.push(`${op.id}:${op.field}`)
      return { kind: "sent" }
    })
    expect(sent).toEqual(["t2:task_name"])
    expect(report.conflicts.map((o) => o.theirs)).toEqual(["in_review"])
    const left = await box.all()
    expect(left.map((o) => [o.id, o.field, o.state])).toEqual([
      ["t1", "task_status", "conflict"],
      ["t1", "task_name", "waiting"],
    ])
  })

  it("a create that isn't made holds back what depends on it", async () => {
    const box = new Outbox(await storeFor("ann"))
    await box.enqueue({ ...change("new1", "task_name", "Draft"), opKey: "create-1", action: "create", field: undefined })
    await box.enqueue({ ...change("c1", "comment", "hello"), kind: "comment", dependsOn: "create-1" })
    const sent: string[] = []
    const report = await box.replay(async (op) => {
      if (op.action === "create") return { kind: "refused" }
      sent.push(op.id)
      return { kind: "sent" }
    })
    expect(sent).toEqual([])
    expect(report.refused.map((o) => o.opKey)).toEqual(["create-1"])
    expect(report.held.map((o) => o.id)).toEqual(["c1"])
    // Held across passes: never sent to nowhere.
    const again = await box.replay(async () => ({ kind: "sent" }))
    expect(again.sent).toEqual([])
    expect((await box.all()).map((o) => o.state)).toEqual(["held"])
  })

  it("a create still waiting (the network) keeps its dependents waiting, not held", async () => {
    const box = new Outbox(await storeFor("ann"))
    await box.enqueue({ ...change("new1", "task_name", "Draft"), opKey: "create-2", action: "create", field: undefined })
    await box.enqueue({ ...change("c1", "comment", "hello"), kind: "comment", dependsOn: "create-2" })
    const report = await box.replay(async () => ({ kind: "retry" }))
    expect(report.stopped).toBe(true)
    expect((await box.all()).map((o) => o.state)).toEqual(["waiting", "waiting"])
  })

  it("a create the server made under its own id: what waits on it goes after it, under that id", async () => {
    const box = new Outbox(await storeFor("ann"))
    const temp = "offline-7f3a"
    // A task made offline, a field set on it, a comment on it and a sub-task under it; then the sub-task's own comment.
    await box.enqueue({ ...change(temp, "task_name", "Draft"), opKey: "create-3", action: "create", field: undefined, url: "/task/createTask", payload: { task_name: "Draft", task_project_uuid: "p1" } })
    await box.enqueue({ ...change(temp, "task_priority", "high"), dependsOn: "create-3" })
    await box.enqueue({
      ...change("offline-c1", "comment", "hello"),
      kind: "comment",
      opKey: "create-4",
      action: "create",
      field: undefined,
      url: "/task/createCommentTask",
      payload: { task_uuid: temp, comment_text: "hello" },
      dependsOn: "create-3",
    })
    await box.enqueue({
      ...change("offline-s1", "task_name", "Sub"),
      opKey: "create-5",
      action: "create",
      field: undefined,
      url: `/task/createSubTask/${temp}`,
      payload: { parent_task_uuid: temp, task_name: "Sub" },
      dependsOn: "create-3",
    })
    await box.enqueue({
      ...change("offline-c2", "comment", "on the sub-task"),
      kind: "comment",
      opKey: "create-6",
      action: "create",
      field: undefined,
      url: "/task/createCommentTask",
      payload: { task_uuid: "offline-s1", comment_text: "on the sub-task" },
      dependsOn: "create-5",
    })
    const made: Record<string, string> = { "create-3": "t-real", "create-4": "c-real", "create-5": "s-real", "create-6": "c2-real" }
    const sent: Op[] = []
    const report = await box.replay(async (op) => {
      sent.push(op)
      return { kind: "sent", made: made[op.opKey] }
    })
    expect(sent).toHaveLength(5)
    expect(sent[0]).toMatchObject({ opKey: "create-3", id: temp })
    expect(sent[1]).toMatchObject({ id: "t-real", payload: { task_uuid: "t-real", task_priority: "high" } })
    expect(sent[1].dependsOn).toBeUndefined()
    expect(sent[2]).toMatchObject({ opKey: "create-4", payload: { task_uuid: "t-real", comment_text: "hello" } })
    expect(sent[3]).toMatchObject({ opKey: "create-5", url: "/task/createSubTask/t-real", payload: { parent_task_uuid: "t-real" } })
    // Made in the same pass: the sub-task's comment goes under the sub-task's own id.
    expect(sent[4]).toMatchObject({ opKey: "create-6", payload: { task_uuid: "s-real" } })
    expect(report.made).toEqual([
      { kind: "task", from: temp, to: "t-real" },
      { kind: "comment", from: "offline-c1", to: "c-real" },
      { kind: "task", from: "offline-s1", to: "s-real" },
      { kind: "comment", from: "offline-c2", to: "c2-real" },
    ])
    expect(await box.all()).toEqual([])
  })

  it("a create the server made under its own id leaves nothing kept under the device's", async () => {
    const store = await storeFor("ann")
    await store.saveRead("/task/info/offline-9", { msg: "ok", data: { task_uuid: "offline-9", task_name: "Draft" } })
    const box = new Outbox(store)
    await box.enqueue({ ...change("offline-9", "task_name", "Draft"), opKey: "create-7", action: "create", field: undefined, url: "/task/createTask", payload: { task_name: "Draft" } })
    await box.enqueue({ ...change("t2", "task_status", "done") })
    const report = await box.replay(async (op) => ({ kind: "sent", made: op.opKey === "create-7" ? "t-9" : undefined }))
    expect(report.sent).toHaveLength(2)
    expect(await store.get("task", "offline-9")).toBeUndefined()
    expect(await store.read("/task/info/offline-9")).toBeUndefined()
  })

  it("stops the pass when nothing answers, and keeps everything", async () => {
    const box = new Outbox(await storeFor("ann"))
    await box.enqueue(change("t1", "task_status", "done"))
    await box.enqueue(change("t2", "task_status", "done"))
    let calls = 0
    const report = await box.replay(async () => {
      calls++
      return { kind: "retry" }
    })
    expect(calls).toBe(1)
    expect(report.stopped).toBe(true)
    expect(await box.all()).toHaveLength(2)
  })

  it("Keep mine sends without asking again; Keep theirs drops the change", async () => {
    const box = new Outbox(await storeFor("ann"))
    await box.enqueue(change("t1", "task_status", "done", { base: "todo", hasBase: true }))
    await box.enqueue(change("t2", "task_status", "done", { base: "todo", hasBase: true }))
    await box.replay(async () => ({ kind: "conflict", theirs: "in_review" }))
    const [a, b] = await box.all()
    await box.resolve(a.seq!, "mine")
    await box.resolve(b.seq!, "theirs")
    const left = await box.all()
    expect(left).toHaveLength(1)
    expect(left[0]).toMatchObject({ id: "t1", state: "waiting", hasBase: false })
  })

  it("a change made while an earlier one to that field is on its way is kept, behind it, from its value", async () => {
    const box = new Outbox(await storeFor("ann"))
    await box.enqueue(change("t1", "task_status", "inProgress", { base: "todo", hasBase: true }))
    const sent: unknown[] = []
    await box.replay(async (op) => {
      // The member changes the status again while the first change is sent.
      if (sent.length === 0) await box.enqueue(change("t1", "task_status", "done", { base: "todo", hasBase: true }))
      sent.push(op.value)
      return { kind: "sent" }
    })
    expect(sent).toEqual(["inProgress"])
    const left = await box.all()
    expect(left.map((o) => [o.value, o.base, o.hasBase, o.state])).toEqual([["done", "inProgress", true, "waiting"]])
  })

  it("a change still marked as on its way when a pass begins (its tab closed mid-send) goes again", async () => {
    const box = new Outbox(await storeFor("ann"))
    await box.enqueue(change("t1", "task_status", "done"))
    let reached = () => {}
    const onItsWay = new Promise<void>((r) => (reached = r))
    // The first tab's send never answers: it was closed.
    void box.replay(() => {
      reached()
      return new Promise<Outcome>(() => {})
    })
    await onItsWay
    const next = new Outbox(await storeFor("ann"))
    expect((await next.all()).map((o) => o.state)).toEqual(["sending"])
    const sent: string[] = []
    await next.replay(async (op) => {
      sent.push(op.id)
      return { kind: "sent" }
    })
    expect(sent).toEqual(["t1"])
    expect(await next.all()).toEqual([])
  })

  it("a change later to the same field is checked from the earlier one's value, whatever is between", async () => {
    const box = new Outbox(await storeFor("ann"))
    await box.enqueue(change("t1", "task_status", "inProgress", { base: "todo", hasBase: true }))
    await box.enqueue(change("t1", "task_name", "Renamed"))
    await box.enqueue(change("t1", "task_status", "done", { base: "todo", hasBase: true }))
    expect((await box.all()).map((o) => [o.field, o.base])).toEqual([
      ["task_status", "todo"],
      ["task_name", undefined],
      ["task_status", "inProgress"],
    ])
  })

  it("after a refusal, the next change to that field is checked from what the server still has", async () => {
    const box = new Outbox(await storeFor("ann"))
    await box.enqueue(change("t1", "task_status", "inProgress", { base: "todo", hasBase: true }))
    await box.enqueue(change("t1", "task_name", "Renamed"))
    await box.enqueue(change("t1", "task_status", "done", { base: "todo", hasBase: true }))
    const checked: unknown[] = []
    await box.replay(async (op) => {
      if (op.value === "inProgress") return { kind: "refused" }
      checked.push([op.value, op.base])
      return { kind: "sent" }
    })
    expect(checked).toEqual([
      ["Renamed", undefined],
      ["done", "todo"],
    ])
  })

  it("a server failure holds that task for the pass and counts a try; other tasks still go", async () => {
    const box = new Outbox(await storeFor("ann"))
    await box.enqueue(change("t1", "task_status", "done"))
    await box.enqueue(change("t1", "task_name", "Later"))
    await box.enqueue(change("t2", "task_status", "done"))
    const sent: string[] = []
    const report = await box.replay(async (op) => {
      if (op.id === "t1") return { kind: "failed" }
      sent.push(op.id)
      return { kind: "sent" }
    })
    expect(sent).toEqual(["t2"])
    expect(report.stopped).toBe(false)
    expect(report.failing.map((o) => [o.id, o.tries])).toEqual([["t1", 1]])
    expect((await box.all()).map((o) => [o.id, o.field, o.state])).toEqual([
      ["t1", "task_status", "waiting"],
      ["t1", "task_name", "waiting"],
    ])
  })

  it("a change that keeps failing is set aside for the member: Retry sends it again", async () => {
    const box = new Outbox(await storeFor("ann"))
    await box.enqueue(change("t1", "task_status", "done"))
    let tries = 0
    let report = await box.replay(async () => (tries++, { kind: "failed" }))
    for (let i = 1; i < MAX_TRIES; i++) report = await box.replay(async () => (tries++, { kind: "failed" }))
    expect(tries).toBe(MAX_TRIES)
    expect(report.failed.map((o) => o.state)).toEqual(["failed"])
    // Set aside: not tried again until the member says so.
    await box.replay(async () => (tries++, { kind: "failed" }))
    expect(tries).toBe(MAX_TRIES)
    const [op] = await box.all()
    await box.retry(op.seq!)
    const again = await box.replay(async () => ({ kind: "sent" }))
    expect(again.sent).toHaveLength(1)
    expect(await box.all()).toEqual([])
  })

  it("an answer to a change another tab already let go brings nothing back", async () => {
    const box = new Outbox(await storeFor("ann"))
    await box.enqueue(change("t1", "task_status", "done", { base: "todo", hasBase: true }))
    await box.replay(async () => ({ kind: "conflict", theirs: "inReview" }))
    const [op] = await box.all()
    const other = new Outbox(await storeFor("ann"))
    await other.resolve(op.seq!, "theirs")
    await box.resolve(op.seq!, "mine")
    expect(await box.all()).toEqual([])
  })
})
