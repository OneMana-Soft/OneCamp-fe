import { afterEach, describe, expect, it, vi } from "vitest"
import axios, { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios"

const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ toast }))

import { interceptRequests, keepsOffline, offlineWrite, OFFLINE_WRITES } from "@/lib/offline/http"
import { TASK_WRITES } from "@/lib/offline/tasks"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"

// The app's client with an adapter the test answers: no answer at all
// (the network), a refusal, or an answer.
type Answer = "network" | number | { data: unknown }
function client(answer: (config: InternalAxiosRequestConfig) => Answer) {
  const adapter: AxiosAdapter = async (config) => {
    const a = answer(config)
    if (a === "network") throw new AxiosError("Network Error", "ERR_NETWORK", config)
    if (typeof a === "number") {
      throw new AxiosError("refused", String(a), config, undefined, { status: a, data: { msg: "Not allowed" }, statusText: "", headers: {}, config })
    }
    return { data: a.data, status: 200, statusText: "OK", headers: {}, config }
  }
  return axios.create({ adapter })
}

const hooks = () => ({
  save: vi.fn(),
  answer: vi.fn(async (): Promise<unknown> => undefined),
  queue: vi.fn(async (): Promise<"kept" | "full" | "no"> => "kept"),
  queueBehind: vi.fn<(endpoint: string, url: string, method: string, payload: unknown) => Promise<"kept" | "full" | "no">>(async () => "no"),
  queueCreate: vi.fn<(endpoint: string, url: string, method: string, payload: unknown) => Promise<{ result: "kept" | "full" | "no"; data?: Record<string, unknown> }>>(
    async () => ({ result: "no" }),
  ),
  made: vi.fn<(ids: string[]) => Promise<Record<string, string>>>(async () => ({})),
})

// Ids the device gives (engine.newKey): "offline-" and a UUID.
const MADE_HERE = "offline-0d1f2e3c-4b5a-4f6e-8d7c-6b5a4f3e2d1c"
const COMMENT_HERE = "offline-1e2f3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b"

const LIST = "/project/taskList/p1?pageSize=50&pageIndex=0"
const STATUS = PostEndpointUrl.UpdateTaskStatus
const body = { task_uuid: "t1", task_status: "done", task_project_uuid: "p1" }

let off: (() => void) | undefined
afterEach(() => {
  off?.()
  off = undefined
  toast.mockReset()
})

describe("the store's interceptors", () => {
  it("keep a task answer read, and nothing else", async () => {
    const h = hooks()
    const c = client(() => ({ data: { ok: 1 } }))
    off = interceptRequests(c, h)
    await c.get(LIST)
    await c.get(GetEndpointUrl.SelfProfile)
    expect(h.save.mock.calls).toEqual([[LIST, { ok: 1 }]])
  })

  it("answer a task read the network didn't from the device", async () => {
    const h = hooks()
    h.answer.mockResolvedValue({ kept: true })
    const c = client(() => "network")
    off = interceptRequests(c, h)
    await expect(c.get(LIST)).resolves.toMatchObject({ data: { kept: true }, status: 200 })
  })

  it("never answer a refusal from the device", async () => {
    const h = hooks()
    h.answer.mockResolvedValue({ kept: true })
    const c = client(() => 403)
    off = interceptRequests(c, h)
    await expect(c.get(LIST)).rejects.toBeInstanceOf(AxiosError)
    expect(h.answer).not.toHaveBeenCalled()
  })

  it("keep a task field change the network didn't take, and answer it as accepted", async () => {
    const h = hooks()
    const c = client(() => "network")
    off = interceptRequests(c, h)
    await expect(c.post(STATUS, body)).resolves.toMatchObject({ data: { queued: true }, status: 202 })
    expect(h.queue).toHaveBeenCalledWith(STATUS, STATUS, "POST", body)
    expect(toast).not.toHaveBeenCalled()
  })

  it("quiet the network's own toast for such a change, and only for it", async () => {
    const seen: (boolean | undefined)[] = []
    const c = client((config) => {
      seen.push(config.suppressErrorToast)
      return { data: {} }
    })
    off = interceptRequests(c, hooks())
    await c.post(STATUS, body)
    // A create is kept too (P7-1c); a write the store doesn't keep isn't quieted.
    await c.post(PostEndpointUrl.CreateTask, { task_name: "x" })
    await c.post(PostEndpointUrl.CreateProject, { project_name: "x" })
    expect(seen).toEqual([true, true, undefined])
  })

  it("say so when the outbox is full: never a silent drop", async () => {
    const h = hooks()
    h.queue.mockResolvedValue("full")
    const c = client(() => "network")
    off = interceptRequests(c, h)
    await expect(c.post(STATUS, body)).rejects.toBeInstanceOf(AxiosError)
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", description: expect.stringContaining("Too many changes are waiting") }))
  })

  it("still say a refusal of such a change, as the client would", async () => {
    const h = hooks()
    const c = client(() => 403)
    off = interceptRequests(c, h)
    await expect(c.post(STATUS, body)).rejects.toBeInstanceOf(AxiosError)
    expect(h.queue).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }))
  })

  it("never keep a change it doesn't know (creating a task offline is P7-1c)", async () => {
    const h = hooks()
    const c = client(() => "network")
    off = interceptRequests(c, h)
    await expect(c.post(PostEndpointUrl.CreateTask, { task_name: "x" })).rejects.toBeInstanceOf(AxiosError)
    expect(h.queue).not.toHaveBeenCalled()
  })

  it("leave the store's own requests alone", async () => {
    const h = hooks()
    h.answer.mockResolvedValue({ kept: true })
    const c = client(() => "network")
    off = interceptRequests(c, h)
    await expect(c.get(`${GetEndpointUrl.GetTaskInfo}/t1`, { offlineReplay: true })).rejects.toBeInstanceOf(AxiosError)
    await expect(c.post(STATUS, body, { offlineReplay: true })).rejects.toBeInstanceOf(AxiosError)
    expect(h.answer).not.toHaveBeenCalled()
    expect(h.queue).not.toHaveBeenCalled()
    expect(h.queueBehind).not.toHaveBeenCalled()
  })

  it("keep a change made online behind the task's kept ones, never sending it ahead of them", async () => {
    const h = hooks()
    h.queueBehind.mockImplementation(async (_e: string, _u: string, _m: string, payload: unknown) => ((payload as { task_uuid: string }).task_uuid === "t1" ? "kept" : "no"))
    const sent: string[] = []
    const c = client((config) => {
      sent.push(JSON.parse(String(config.data)).task_uuid)
      return { data: {} }
    })
    off = interceptRequests(c, h)
    await expect(c.post(STATUS, body)).resolves.toMatchObject({ status: 202, data: { queued: true } })
    await expect(c.post(STATUS, { ...body, task_uuid: "t2" })).resolves.toMatchObject({ status: 200 })
    expect(sent).toEqual(["t2"])
    expect(h.queueBehind).toHaveBeenCalledWith(STATUS, STATUS, "POST", body)
  })

  it("come off when the store closes", async () => {
    const h = hooks()
    const c = client(() => ({ data: {} }))
    interceptRequests(c, h)()
    await c.get(LIST)
    expect(h.save).not.toHaveBeenCalled()
  })

  it("keep task reads only: never the profile, a token or a session", () => {
    expect(keepsOffline(LIST)).toBe(true)
    expect(keepsOffline(`${GetEndpointUrl.GetTaskInfo}/t1`)).toBe(true)
    for (const url of [GetEndpointUrl.SelfProfile, GetEndpointUrl.SelfProfileSideNav, "/auth/refresh", "/mqtt/token", "/project/taskListX", "/tasks/info/1"]) {
      expect(keepsOffline(url)).toBe(false)
    }
  })

  it("know the same changes the task kind knows how to check", () => {
    expect([...OFFLINE_WRITES].sort()).toEqual(Object.keys(TASK_WRITES).sort())
    expect(offlineWrite(`${STATUS}?x=1`)).toBe(STATUS)
    expect(offlineWrite(PostEndpointUrl.CreateTask)).toBeUndefined()
  })
})

describe("creates (P7-1c)", () => {
  const CREATE = PostEndpointUrl.CreateTask
  const COMMENT = PostEndpointUrl.CreateTaskComment

  it("keep a create the network didn't take, and answer it with what it makes", async () => {
    const h = hooks()
    h.queueCreate.mockResolvedValue({ result: "kept", data: { task_uuid: "offline-1", task_name: "Draft" } })
    const c = client(() => "network")
    off = interceptRequests(c, h)
    const create = { task_name: "Draft", task_project_uuid: "p1" }
    await expect(c.post(CREATE, create)).resolves.toMatchObject({ status: 202, data: { queued: true, data: { task_uuid: "offline-1" } } })
    expect(h.queueCreate).toHaveBeenCalledWith(CREATE, CREATE, "POST", create)
    expect(toast).not.toHaveBeenCalled()
  })

  it("never send a create that hangs off one still on the device: it waits behind it", async () => {
    const h = hooks()
    h.queueCreate.mockResolvedValue({ result: "kept", data: { comment_id: COMMENT_HERE, comment_created_at: new Date().toISOString() } })
    const sent: string[] = []
    const c = client((config) => {
      sent.push(String(config.url))
      return { data: {} }
    })
    off = interceptRequests(c, h)
    const comment = { task_uuid: MADE_HERE, task_comment_body: "hello" }
    await expect(c.post(COMMENT, comment)).resolves.toMatchObject({ status: 202, data: { data: { comment_id: COMMENT_HERE } } })
    expect(sent).toEqual([])
    // One that hangs off a task the server has goes as it is.
    await c.post(COMMENT, { task_uuid: "t1", task_comment_body: "hi" })
    expect(sent).toEqual([COMMENT])
  })

  it("say so when a create can't be kept, as for a change", async () => {
    const h = hooks()
    h.queueCreate.mockResolvedValue({ result: "full" })
    const c = client(() => "network")
    off = interceptRequests(c, h)
    await expect(c.post(CREATE, { task_name: "Draft" })).rejects.toThrow()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't save that" }))
  })
})

describe("an id the device gave never reaches the server (P7-1c)", () => {
  const LABEL = PostEndpointUrl.UpdateTaskLabel
  const sentTo = () => {
    const sent: { url: string; body: unknown }[] = []
    const c = client((config) => {
      sent.push({ url: String(config.url), body: typeof config.data === "string" ? JSON.parse(config.data) : config.data })
      return { data: { ok: 1 } }
    })
    return { c, sent }
  }

  it("goes under the id the server made since, in the address and the body", async () => {
    const h = hooks()
    h.made.mockResolvedValue({ [MADE_HERE]: "t-real" })
    const { c, sent } = sentTo()
    off = interceptRequests(c, h)
    await c.post(LABEL, { task_uuid: MADE_HERE, task_label: "venue" })
    await c.get(`${GetEndpointUrl.GetTaskInfo}/${MADE_HERE}`)
    expect(sent).toEqual([
      { url: LABEL, body: { task_uuid: "t-real", task_label: "venue" } },
      { url: `${GetEndpointUrl.GetTaskInfo}/t-real`, body: undefined },
    ])
  })

  it("is read from the device while its create waits, even with something on screen and the network up", async () => {
    const h = hooks()
    h.answer.mockResolvedValue({ msg: "Kept on this device", data: { task_uuid: MADE_HERE } })
    const { c, sent } = sentTo()
    off = interceptRequests(c, h)
    const url = `${GetEndpointUrl.GetTaskInfo}/${MADE_HERE}`
    await expect(c.get(url)).resolves.toMatchObject({ status: 200, data: { data: { task_uuid: MADE_HERE } } })
    expect(h.answer).toHaveBeenCalledWith(url, true)
    expect(sent).toEqual([])
    // An answer the device gave is never kept as a read.
    expect(h.save).not.toHaveBeenCalled()
  })

  it("refuses here, unsent and saying why, a change the store can't keep to something still waiting", async () => {
    const h = hooks()
    const { c, sent } = sentTo()
    off = interceptRequests(c, h)
    await expect(c.post(LABEL, { task_uuid: MADE_HERE, task_label: "venue" })).rejects.toMatchObject({ response: { status: 409 } })
    expect(sent).toEqual([])
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("still waiting to be sent") }))
  })

  it("refuses quietly, unsent, a read about it the device doesn't keep", async () => {
    const h = hooks()
    const { c, sent } = sentTo()
    off = interceptRequests(c, h)
    await expect(c.get(`/task/time/${MADE_HERE}`)).rejects.toMatchObject({ response: { status: 404 } })
    expect(sent).toEqual([])
    expect(toast).not.toHaveBeenCalled()
  })

  it("keeps a change the store keeps behind the create it hangs off", async () => {
    const h = hooks()
    h.queueBehind.mockResolvedValue("kept")
    const { c, sent } = sentTo()
    off = interceptRequests(c, h)
    await expect(c.post(STATUS, { task_uuid: MADE_HERE, task_status: "done" })).resolves.toMatchObject({ status: 202 })
    expect(sent).toEqual([])
  })
})
