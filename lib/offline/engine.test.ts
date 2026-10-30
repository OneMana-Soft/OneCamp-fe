import "fake-indexeddb/auto"
import { AxiosError, type AxiosResponse } from "axios"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const http = vi.hoisted(() => {
  const chain = () => ({ use: vi.fn(() => 0), eject: vi.fn() })
  return { get: vi.fn(), request: vi.fn(), interceptors: { request: chain(), response: chain() } }
})
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: http }))

import { answerFor, queue, queueBehind, queueCreate, replayNow, saveAnswer, send, start, stop } from "@/lib/offline/engine"
import { OfflineStore } from "@/lib/offline/store"
import { noteAnswered } from "@/lib/http/answered"
import { Outbox, MAX_OPS, type Op } from "@/lib/offline/outbox"
import { getOfflineStatus } from "@/lib/offline/status"
import { wipeOfflineStore } from "@/lib/offline/wipe"
import { PostEndpointUrl } from "@/services/endPoints"
import { canCommentTask, canEditTask } from "@/lib/work/access"
import type { TaskLike } from "@/lib/work/types"

function answered(status: number): AxiosError {
  return new AxiosError("refused", String(status), undefined, undefined, { status, data: {}, statusText: "", headers: {}, config: {} } as AxiosResponse)
}
const noAnswer = () => new AxiosError("Network Error", "ERR_NETWORK")

const LIST = "/project/taskList/p1?pageSize=50&pageIndex=0"
const STATUS = PostEndpointUrl.UpdateTaskStatus

async function waiting(): Promise<{ id: string; field?: string; state: string }[]> {
  const s = await OfflineStore.open("ann")
  try {
    return await new Outbox(s).all()
  } finally {
    s.close()
  }
}

beforeEach(async () => {
  http.get.mockReset()
  http.request.mockReset()
  http.interceptors.response.use.mockClear()
  http.interceptors.response.eject.mockClear()
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false })
  await start("ann")
  await saveAnswer(LIST, { data: { project_tasks: [{ task_uuid: "t1", task_name: "Write brief", task_status: "todo" }, { task_uuid: "t2", task_name: "Review", task_status: "todo" }] } })
})

afterEach(async () => {
  stop()
  await wipeOfflineStore()
})

const goOnline = () => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true })

describe("the offline store at work", () => {
  it("keeps a field change made offline, and shows it over the kept list", async () => {
    expect(await queue(STATUS, STATUS, "POST", { task_uuid: "t1", task_status: "done" })).toBe("kept")
    expect(getOfflineStatus().waiting).toBe(1)
    const shown = (await answerFor(LIST)) as { data: { project_tasks: { task_status: string }[] } }
    expect(shown.data.project_tasks[0].task_status).toBe("done")
  })

  it("does not keep what it doesn't know, or with no task", async () => {
    expect(await queue(PostEndpointUrl.CreateTask, PostEndpointUrl.CreateTask, "POST", { task_name: "x" })).toBe("no")
    expect(await queue(STATUS, STATUS, "POST", { task_status: "done" })).toBe("no")
  })

  it("says full past the cap, and the status says so", async () => {
    for (let i = 0; i < MAX_OPS; i++) expect(await queue(PostEndpointUrl.UpdateTaskName, PostEndpointUrl.UpdateTaskName, "POST", { task_uuid: `x${i}`, task_name: "n" })).toBe("kept")
    expect(await queue(STATUS, STATUS, "POST", { task_uuid: "t1", task_status: "done" })).toBe("full")
    expect(getOfflineStatus()).toMatchObject({ full: true, waiting: MAX_OPS })
  })

  it("sends as the member with its Idempotency-Key, once the field is still what it was changed from", async () => {
    await queue(STATUS, STATUS, "POST", { task_uuid: "t1", task_status: "done" })
    goOnline()
    http.get.mockResolvedValue({ data: { data: { task_uuid: "t1", task_status: "todo" } } })
    http.request.mockResolvedValue({ data: {} })
    await replayNow()
    expect(http.request).toHaveBeenCalledTimes(1)
    const sent = http.request.mock.calls[0][0]
    expect(sent).toMatchObject({ method: "POST", url: STATUS, data: { task_uuid: "t1", task_status: "done" } })
    expect(sent.headers["Idempotency-Key"]).toMatch(/.+/)
    expect(await waiting()).toEqual([])
  })

  it("asks the member when a teammate changed the field meanwhile, and sends nothing", async () => {
    await queue(STATUS, STATUS, "POST", { task_uuid: "t1", task_status: "done" })
    goOnline()
    http.get.mockResolvedValue({ data: { data: { task_uuid: "t1", task_status: "in_review" } } })
    await replayNow()
    expect(http.request).not.toHaveBeenCalled()
    expect(getOfflineStatus().conflicts.map((o) => o.theirs)).toEqual(["in_review"])
  })

  it("drops the task and its waiting changes on a 403, and still sends another task's", async () => {
    await queue(STATUS, STATUS, "POST", { task_uuid: "t1", task_status: "done" })
    await queue(STATUS, STATUS, "POST", { task_uuid: "t2", task_status: "done" })
    goOnline()
    http.get.mockImplementation(async (url: string) => {
      if (url.endsWith("/t1")) throw answered(403)
      return { data: { data: { task_uuid: "t2", task_status: "todo" } } }
    })
    http.request.mockResolvedValue({ data: {} })
    await replayNow()
    expect(http.request).toHaveBeenCalledTimes(1)
    expect(http.request.mock.calls[0][0].data).toMatchObject({ task_uuid: "t2" })
    expect(await waiting()).toEqual([])
    expect(getOfflineStatus().notice).toMatchObject({ gone: 1, label: "Write brief" })
    expect(await answerFor(LIST)).toBeUndefined()
  })

  it("drops the task on a 404 the same way", async () => {
    await queue(STATUS, STATUS, "POST", { task_uuid: "t1", task_status: "done" })
    goOnline()
    http.get.mockRejectedValue(answered(404))
    await replayNow()
    expect(http.request).not.toHaveBeenCalled()
    expect(await waiting()).toEqual([])
  })

  it("deletes everything kept on a 401 (the session is over)", async () => {
    await queue(STATUS, STATUS, "POST", { task_uuid: "t1", task_status: "done" })
    goOnline()
    http.get.mockRejectedValue(answered(401))
    await replayNow()
    expect(getOfflineStatus().waiting).toBe(0)
    expect(await waiting()).toEqual([])
    const s = await OfflineStore.open("ann")
    try {
      expect(await s.read(LIST)).toBeUndefined()
    } finally {
      s.close()
    }
  })

  it("keeps everything when nothing answers", async () => {
    await queue(STATUS, STATUS, "POST", { task_uuid: "t1", task_status: "done" })
    goOnline()
    http.get.mockRejectedValue(noAnswer())
    await replayNow()
    expect((await waiting()).map((o) => o.state)).toEqual(["waiting"])
  })

  it("drops a change the server refuses and puts the screen back", async () => {
    await queue(STATUS, STATUS, "POST", { task_uuid: "t1", task_status: "done" })
    goOnline()
    http.get.mockResolvedValue({ data: { data: { task_uuid: "t1", task_status: "todo" } } })
    http.request.mockRejectedValue(answered(400))
    const refreshed = vi.fn()
    window.addEventListener("onecamp:offline-refresh", refreshed)
    await replayNow()
    window.removeEventListener("onecamp:offline-refresh", refreshed)
    expect(await waiting()).toEqual([])
    expect(getOfflineStatus().notice).toMatchObject({ refused: 1 })
    expect(refreshed).toHaveBeenCalled()
  })
})

describe("the server failing, refusing or asking to wait", () => {
  it("holds a task the server fails (5xx) for this pass, and still sends another task's", async () => {
    await queue(STATUS, STATUS, "POST", { task_uuid: "t1", task_status: "done" })
    await queue(STATUS, STATUS, "POST", { task_uuid: "t2", task_status: "done" })
    goOnline()
    http.get.mockImplementation(async (url: string) => ({ data: { data: { task_uuid: url.slice(-2), task_status: "todo" } } }))
    http.request.mockImplementation(async (config: { data: { task_uuid: string } }) => {
      if (config.data.task_uuid === "t1") throw answered(503)
      return { data: {} }
    })
    await replayNow()
    expect(http.request.mock.calls.map((c) => c[0].data.task_uuid)).toEqual(["t1", "t2"])
    expect((await waiting()).map((o) => o.id)).toEqual(["t1"])
  })

  it("stops the pass when the server asks to slow down (429), and keeps everything", async () => {
    await queue(STATUS, STATUS, "POST", { task_uuid: "t1", task_status: "done" })
    await queue(STATUS, STATUS, "POST", { task_uuid: "t2", task_status: "done" })
    goOnline()
    http.get.mockResolvedValue({ data: { data: { task_status: "todo" } } })
    http.request.mockRejectedValue(answered(429))
    await replayNow()
    expect(http.request).toHaveBeenCalledTimes(1)
    expect(await waiting()).toHaveLength(2)
  })

  it("a 403 on the change itself drops only the change: the member still sees the task", async () => {
    await queue(STATUS, STATUS, "POST", { task_uuid: "t1", task_status: "done" })
    goOnline()
    http.get.mockResolvedValue({ data: { data: { task_uuid: "t1", task_status: "todo" } } })
    http.request.mockRejectedValue(answered(403))
    await replayNow()
    expect(await waiting()).toEqual([])
    expect(getOfflineStatus().notice).toMatchObject({ refused: 1, gone: 0 })
    expect(await answerFor(LIST)).toBeDefined()
  })

  it("keeps a change made online behind the task's kept ones, and sends them in order", async () => {
    await queue(PostEndpointUrl.UpdateTaskName, PostEndpointUrl.UpdateTaskName, "POST", { task_uuid: "t1", task_name: "Offline name" })
    goOnline()
    http.get.mockResolvedValue({ data: { data: { task_uuid: "t1", task_name: "Write brief", task_status: "todo" } } })
    http.request.mockResolvedValue({ data: {} })
    expect(await queueBehind(STATUS, STATUS, "POST", { task_uuid: "t2", task_status: "done" })).toBe("no")
    expect(await queueBehind(STATUS, STATUS, "POST", { task_uuid: "t1", task_status: "done" })).toBe("kept")
    await replayNow()
    expect(http.request.mock.calls.map((c) => c[0].url)).toEqual([PostEndpointUrl.UpdateTaskName, STATUS])
    expect(await waiting()).toEqual([])
  })
})

describe("a change made while a pass runs", () => {
  it("is sent after the change on its way, with nothing else asking", async () => {
    await queue(PostEndpointUrl.UpdateTaskName, PostEndpointUrl.UpdateTaskName, "POST", { task_uuid: "t1", task_name: "Offline name" })
    goOnline()
    http.get.mockResolvedValue({ data: { data: { task_uuid: "t1", task_name: "Write brief", task_status: "todo" } } })
    let made = false
    http.request.mockImplementation(async () => {
      // The member changes the same task's status while the name is on its way.
      if (!made) {
        made = true
        expect(await queueBehind(STATUS, STATUS, "POST", { task_uuid: "t1", task_status: "done" })).toBe("kept")
      }
      return { data: {} }
    })
    await replayNow()
    expect(http.request.mock.calls.map((c) => c[0].url)).toEqual([PostEndpointUrl.UpdateTaskName, STATUS])
    expect(await waiting()).toEqual([])
  })
})

describe("the store's life with the session", () => {
  it("puts its interceptors on when it opens and takes them off when it closes", async () => {
    // beforeEach opened it.
    expect(http.interceptors.response.use).toHaveBeenCalledTimes(1)
    stop()
    expect(http.interceptors.response.eject).toHaveBeenCalledTimes(1)
    await start("ann")
    expect(http.interceptors.response.use).toHaveBeenCalledTimes(2)
  })

  it("closes, and takes its interceptors off, when the session ends", async () => {
    const { endSession } = await import("@/lib/sessionEnd")
    await endSession()
    expect(http.interceptors.response.eject).toHaveBeenCalled()
    expect(await queue(STATUS, STATUS, "POST", { task_uuid: "t1", task_status: "done" })).toBe("no")
  })

  it("keeps the task answers already on screen when it opens", async () => {
    stop()
    const screen = new Map<string, { data?: unknown }>([
      ["/task/info/t9", { data: { data: { task_uuid: "t9", task_name: "On screen" } } }],
      ["/self_profile", { data: { data: { user_uuid: "ann" } } }],
    ])
    // As this page's reads got them: each notes its url once SWR has its answer (hooks/useFetch).
    for (const url of screen.keys()) noteAnswered(url)
    await start("ann", screen as never)
    const s = await OfflineStore.open("ann")
    try {
      expect(await s.read("/task/info/t9")).toBeDefined()
      expect(await s.read("/self_profile")).toBeUndefined()
    } finally {
      s.close()
    }
  })

  // p7eflaky1 (1 run in 4 on a phone): the board's read went out before the engine's interceptor was on, and its
  // answer reached the screen after the store had opened and kept what was on screen then. Nothing kept it, so the
  // device held no access for the project. An answer the screen notes (lib/http/answered) once it has it is kept too.
  it("keeps an answer that reaches the screen after it opened, from a read sent before it started", async () => {
    stop()
    const screen = new Map<string, { data?: unknown }>()
    await start("ann", screen as never)
    const BOARD = "/project/taskListForKanban/p7?pageSize=50"
    screen.set(BOARD, { data: { data: { project_uuid: "p7", project_access: { role: "member", view: true, comment: true } } } })
    noteAnswered(BOARD)
    await vi.waitFor(async () => {
      const s = await OfflineStore.open("ann")
      try {
        expect(await s.read(BOARD)).toBeDefined()
        expect((await s.get("project", "p7"))?.value.project_access).toBeTruthy()
      } finally {
        s.close()
      }
    })
  })

  // CR-82's MF1 on 7646ab072: the screen notes the device's own answers too (a read the network didn't answer, given
  // from what was kept with what waits laid over it). Kept as the server's read, a create the server later refuses
  // stays in the list as made, and a made task's page, once kept, never takes the project's access kept after it.
  it("never keeps an answer the device gave as a read the server answered, when the screen notes it", async () => {
    stop()
    const screen = new Map<string, { data?: unknown }>()
    await start("ann", screen as never)
    const made = await queueCreate(PostEndpointUrl.CreateTask, PostEndpointUrl.CreateTask, "POST", { task_name: "Book the venue", task_project_uuid: "p1", task_status: "todo" })
    // The list's read finds no network, so the engine's interceptor answers it from the device.
    const failed = (http.interceptors.response.use.mock.calls.at(-1) as unknown[] | undefined)?.[1] as (e: AxiosError) => Promise<AxiosResponse>
    const lost = noAnswer()
    lost.config = { url: LIST, method: "get", headers: {} } as never
    const names = (answer: unknown) => (answer as { data: { project_tasks: { task_name: string }[] } }).data.project_tasks.map((t) => t.task_name)
    const res = await failed(lost)
    expect(names(res.data)).toEqual(["Book the venue", "Write brief", "Review"])
    screen.set(LIST, { data: res.data })
    noteAnswered(LIST)
    // A server's answer noted after it is kept: once it is, whatever the device's answer led to has been done.
    const BOARD = "/project/taskListForKanban/p1?pageSize=50&pageIndex=3"
    screen.set(BOARD, { data: { data: { project_tasks_todo: [], project_tasks_done: [] } } })
    noteAnswered(BOARD)
    const s = await OfflineStore.open("ann")
    try {
      await vi.waitFor(async () => expect(await s.read(BOARD)).toBeDefined())
      expect(names((await s.read(LIST))?.answer)).toEqual(["Write brief", "Review"])
      expect(await s.get("task", String(made.data?.task_uuid))).toBeUndefined()
    } finally {
      s.close()
    }
  })

  // Nor, when it opens, what the screen brought back from the last visit (lib/swrCache): no read of this page got it,
  // and it may be what the device answered then, with what waited laid over it.
  it("keeps, when it opens, only answers this page's reads got, never what the screen brought back from the last visit", async () => {
    stop()
    const BACK = "/user/assignedTaskList?pageSize=50&pageIndex=9"
    const GOT = "/task/info/t-got-here"
    const screen = new Map<string, { data?: unknown }>([
      [BACK, { data: { data: { user_tasks: [{ task_uuid: "offline-9f1e2d3c-4b5a-4c6d-8e7f-0a1b2c3d4e5f", task_name: "Made offline" }] } } }],
      [GOT, { data: { data: { task_uuid: "t-got-here", task_name: "Read on this page" } } }],
    ])
    noteAnswered(GOT)
    await start("ann", screen as never)
    const s = await OfflineStore.open("ann")
    try {
      expect(await s.read(GOT)).toBeDefined()
      expect(await s.read(BACK)).toBeUndefined()
    } finally {
      s.close()
    }
  })
})

describe("a create the server makes under its own id", () => {
  const create = (kind: string): Op => ({ opKey: "k-made", kind, id: "offline-1", action: "create", method: "POST", url: "/task/createTask", payload: {}, hasBase: false, queuedAt: 0, bytes: 1, state: "waiting" })

  it("names the id the answer gives: a task's (a sub-task is one), a comment's; a field change names none", async () => {
    http.request.mockResolvedValueOnce({ data: { msg: "Created task!", data: { task_uuid: "t-real" } } })
    expect(await send(create("task"))).toEqual({ kind: "sent", made: "t-real" })
    // As the server answers a comment: its id as comment_id (adapter/Task OutputCreateCommentForTask).
    http.request.mockResolvedValueOnce({ data: { msg: "Created comment!", data: { comment_id: "c-real", comment_created_at: new Date().toISOString() } } })
    expect(await send(create("comment"))).toEqual({ kind: "sent", made: "c-real" })
    http.request.mockResolvedValueOnce({ data: { data: { task_uuid: "t-real" } } })
    expect(await send({ ...create("task"), action: "update" })).toEqual({ kind: "sent" })
    expect(http.request.mock.calls[0][0].headers["Idempotency-Key"]).toBe("k-made")
  })
})

describe("a create made offline", () => {
  const CREATE = PostEndpointUrl.CreateTask
  const COMMENT = PostEndpointUrl.CreateTaskComment

  it("is kept under the device's own id and answered with what it makes", async () => {
    const made = await queueCreate(CREATE, CREATE, "POST", { task_name: "Draft", task_project_uuid: "p1" })
    expect(made.result).toBe("kept")
    // As the lists and its page show a task (lib/tasks/fromCreate), as the form's own row does.
    expect(made.data).toMatchObject({ task_name: "Draft", task_project: { project_uuid: "p1" }, task_status: "todo" })
    expect(String(made.data?.task_uuid)).toMatch(/^offline-/)
    expect(await waiting()).toMatchObject([{ id: made.data?.task_uuid, state: "waiting" }])
  })

  it("keeps a comment on it and a field change to it waiting on it; both go under the id the server made", async () => {
    const made = await queueCreate(CREATE, CREATE, "POST", { task_name: "Draft", task_project_uuid: "p1" })
    const temp = String(made.data?.task_uuid)
    const comment = await queueCreate(COMMENT, COMMENT, "POST", { task_uuid: temp, task_comment_body: "hello" })
    expect(comment.result).toBe("kept")
    // Answered as the server answers a comment, so the composer lists it under that id.
    expect(String(comment.data?.comment_id)).toMatch(/^offline-/)
    expect(Number.isNaN(Date.parse(String(comment.data?.comment_created_at)))).toBe(false)
    expect(await queue(STATUS, STATUS, "POST", { task_uuid: temp, task_status: "done" })).toBe("kept")
    goOnline()
    http.request
      .mockResolvedValueOnce({ data: { data: { task_uuid: "t-real" } } })
      .mockResolvedValueOnce({ data: { data: { comment_id: "c-real", comment_created_at: new Date().toISOString() } } })
      .mockResolvedValueOnce({ data: {} })
    await replayNow()
    expect(http.request).toHaveBeenCalledTimes(3)
    expect(http.request.mock.calls[1][0]).toMatchObject({ url: COMMENT, data: { task_uuid: "t-real", task_comment_body: "hello" } })
    expect(http.request.mock.calls[2][0]).toMatchObject({ url: STATUS, data: { task_uuid: "t-real", task_status: "done" } })
    expect(await waiting()).toEqual([])
  })

  it("holds a comment back when its task's create is refused", async () => {
    const made = await queueCreate(CREATE, CREATE, "POST", { task_name: "Draft", task_project_uuid: "p1" })
    await queueCreate(COMMENT, COMMENT, "POST", { task_uuid: String(made.data?.task_uuid), task_comment_body: "hello" })
    goOnline()
    http.request.mockRejectedValueOnce(answered(400))
    await replayNow()
    expect(http.request).toHaveBeenCalledTimes(1)
    expect((await waiting()).map((o) => o.state)).toEqual(["held"])
  })

  // CODE-REVIEWER-79 MF1: an id the device gave never reaches the server, whatever stops a pass or comes late.
  const wire = () => JSON.stringify([...http.request.mock.calls.map(([c]) => [c.url, c.data]), ...http.get.mock.calls.map(([u]) => u)])

  it("never sends a device id when the tab closes as a made create is handed over, and loses nothing", async () => {
    const made = await queueCreate(CREATE, CREATE, "POST", { task_name: "Draft", task_project_uuid: "p1" })
    await queueCreate(COMMENT, COMMENT, "POST", { task_uuid: String(made.data?.task_uuid), task_comment_body: "hello" })
    goOnline()
    // The tab closes as the server's id is noted: nothing after that write happens.
    const put = IDBObjectStore.prototype.put
    let closing = true
    const spy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore["put"]>) {
      if (closing && this.name === "meta" && args[0] === "t-real") {
        closing = false
        throw new DOMException("The tab closed", "AbortError")
      }
      return put.apply(this, args)
    })
    http.request.mockResolvedValueOnce({ data: { data: { task_uuid: "t-real" } } })
    await replayNow().catch(() => undefined)
    spy.mockRestore()
    // Open again: the create goes again under its own key, then the comment under the server's id.
    http.request.mockResolvedValue({ data: { data: { task_uuid: "t-real", comment_id: "c-real", comment_created_at: new Date().toISOString() } } })
    await replayNow()
    expect(wire()).not.toMatch(/offline-/)
    expect(http.request.mock.calls.at(-1)?.[0]).toMatchObject({ url: COMMENT, data: { task_uuid: "t-real", task_comment_body: "hello" } })
    expect(await waiting()).toEqual([])
  })

  it("holds a comment back, never sending the device's id, when its task's create is answered without the server's id", async () => {
    const made = await queueCreate(CREATE, CREATE, "POST", { task_name: "Draft", task_project_uuid: "p1" })
    await queueCreate(COMMENT, COMMENT, "POST", { task_uuid: String(made.data?.task_uuid), task_comment_body: "hello" })
    goOnline()
    http.request.mockResolvedValue({ data: { msg: "Created task!" } })
    await replayNow()
    expect(wire()).not.toMatch(/offline-/)
    expect(http.request).toHaveBeenCalledTimes(1)
    expect(await waiting()).toMatchObject([{ kind: "comment", state: "held" }])
  })

  it("sends a change kept under the device's id after its task was made under the server's id", async () => {
    const made = await queueCreate(CREATE, CREATE, "POST", { task_name: "Draft", task_project_uuid: "p1" })
    goOnline()
    http.request.mockResolvedValueOnce({ data: { data: { task_uuid: "t-real" } } })
    await replayNow()
    // A page still open on the device's id keeps a change with no network, its create no longer waiting.
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false })
    expect(await queue(STATUS, STATUS, "POST", { task_uuid: String(made.data?.task_uuid), task_status: "done" })).toBe("kept")
    goOnline()
    http.request.mockResolvedValueOnce({ data: {} })
    await replayNow()
    expect(wire()).not.toMatch(/offline-/)
    expect(http.request.mock.calls.at(-1)?.[0]).toMatchObject({ url: STATUS, data: { task_uuid: "t-real", task_status: "done" } })
    expect(await waiting()).toEqual([])
  })

  it("keeps nothing it doesn't make", async () => {
    expect(await queueCreate(STATUS, STATUS, "POST", { task_uuid: "t1" })).toEqual({ result: "no" })
  })
})

describe("what was made offline, as the screens read it (P7-1c)", () => {
  const CREATE = PostEndpointUrl.CreateTask
  const SUBTASK = PostEndpointUrl.CreateSubTask
  const COMMENT = PostEndpointUrl.CreateTaskComment
  const BOARD = "/project/taskListForKanban/p1"
  const MINE = "/user/assignedTaskList?pageSize=50&pageIndex=0"
  const names = (list: { task_name?: string }[]) => list.map((t) => t.task_name)

  it("shows a task made offline at the top of its project's list and board, and in My Tasks only when it is the member's", async () => {
    await saveAnswer(BOARD, { data: { project_tasks_todo: [{ task_uuid: "t1", task_name: "Write brief", task_status: "todo" }], project_tasks_done: [] } })
    await saveAnswer(MINE, { data: { user_tasks: [], user_task_count: 0 } })
    const mine = await queueCreate(CREATE, CREATE, "POST", { task_name: "Book the venue", task_project_uuid: "p1", task_status: "todo", task_assignee_uuid: "ann" })
    await queueCreate(CREATE, CREATE, "POST", { task_name: "For Bob", task_project_uuid: "p1", task_status: "todo", task_assignee_uuid: "bob" })
    await queueCreate(CREATE, CREATE, "POST", { task_name: "Elsewhere", task_project_uuid: "p2", task_status: "todo" })
    const list = (await answerFor(LIST)) as { data: { project_tasks: { task_name: string }[] } }
    expect(names(list.data.project_tasks)).toEqual(["For Bob", "Book the venue", "Write brief", "Review"])
    const board = (await answerFor(BOARD)) as { data: { project_tasks_todo: { task_name: string }[]; project_tasks_done: unknown[] } }
    expect(names(board.data.project_tasks_todo)).toEqual(["For Bob", "Book the venue", "Write brief"])
    expect(board.data.project_tasks_done).toEqual([])
    const my = (await answerFor(MINE)) as { data: { user_tasks: { task_uuid: string }[] } }
    expect(my.data.user_tasks.map((t) => t.task_uuid)).toEqual([mine.data?.task_uuid])
  })

  it("shows a comment and a sub-task made offline under their task, with a change to the sub-task over it", async () => {
    await saveAnswer("/task/info/t1", { msg: "ok", data: { task_uuid: "t1", task_name: "Write brief", task_comments: [], task_sub_tasks: [] } })
    await queueCreate(COMMENT, COMMENT, "POST", { task_uuid: "t1", task_comment_body: "<p>hello</p>" })
    const sub = await queueCreate(SUBTASK, SUBTASK, "POST", { task_uuid: "t1", task_project_uuid: "p1", task_name: "Print badges" })
    expect(await queue(STATUS, STATUS, "POST", { task_uuid: String(sub.data?.task_uuid), task_status: "done" })).toBe("kept")
    const page = (await answerFor("/task/info/t1")) as { data: { task_comments: Record<string, unknown>[]; task_sub_tasks: Record<string, unknown>[] } }
    expect(page.data.task_comments).toMatchObject([{ comment_text: "<p>hello</p>", comment_by: { user_uuid: "ann" } }])
    expect(String(page.data.task_comments[0].comment_uuid)).toMatch(/^offline-/)
    expect(page.data.task_sub_tasks).toMatchObject([{ task_uuid: sub.data?.task_uuid, task_name: "Print badges", task_status: "done" }])
  })

  it("answers the page of a task made offline from its create, with what hangs off it", async () => {
    const made = await queueCreate(CREATE, CREATE, "POST", { task_name: "Book the venue", task_project_uuid: "p1", task_status: "todo" })
    const id = String(made.data?.task_uuid)
    await queueCreate(COMMENT, COMMENT, "POST", { task_uuid: id, task_comment_body: "hello" })
    expect(await queue(STATUS, STATUS, "POST", { task_uuid: id, task_status: "inProgress" })).toBe("kept")
    const page = (await answerFor(`/task/info/${id}`)) as { data: Record<string, unknown> & { task_comments: unknown[] } }
    expect(page.data).toMatchObject({ task_uuid: id, task_name: "Book the venue", task_status: "inProgress", task_project: { project_uuid: "p1" } })
    expect(page.data.task_comments).toHaveLength(1)
    // Nothing for a task the device didn't make, or one whose create isn't waiting.
    expect(await answerFor("/task/info/offline-0d1f2e3c-4b5a-4f6e-8d7c-6b5a4f3e2d1c")).toBeUndefined()
  })

  it("gives the page of a task made offline its project's access as the board or list was read, so its comment box shows only where the member may comment (asana-12)", async () => {
    const MEMBER = { role: "member", view: true, comment: true, create_tasks: true, edit_tasks: "all" }
    const VIEWER = { role: "viewer", view: true, comment: false, create_tasks: false, edit_tasks: "none" }
    await saveAnswer(BOARD, { msg: "ok", data: { project_uuid: "p1", project_is_member: 1, project_access: MEMBER, project_tasks_todo: [] } })
    await saveAnswer("/project/taskList/p2?pageSize=50&pageIndex=0", { msg: "ok", data: { project_uuid: "p2", project_access: VIEWER, project_tasks: [] } })
    const pageIn = async (project: string) => {
      const made = await queueCreate(CREATE, CREATE, "POST", { task_name: `Made in ${project}`, task_project_uuid: project, task_status: "todo" })
      return ((await answerFor(`/task/info/${made.data?.task_uuid}`)) as { data: TaskLike }).data
    }
    const mine = await pageIn("p1")
    expect(mine.task_project).toMatchObject({ project_uuid: "p1", project_access: MEMBER })
    expect(canCommentTask(mine)).toBe(true)
    expect(canEditTask(mine, "ann")).toBe(true)
    // A viewer's project: the quiet note, as the server's own answer would give.
    expect(canCommentTask(await pageIn("p2"))).toBe(false)
    // A project with nothing read here: no access is made up.
    const unread = await pageIn("p3")
    expect(unread.task_project).toEqual({ project_uuid: "p3" })
    expect(canCommentTask(unread)).toBe(false)
  })

  it("gives the page of a task made offline its project's estimate scale as a task's page there brought it, and its points wait on its create (asana-12)", async () => {
    const SCALE = { data: { scale: { kind: "fibonacci", sizes: [1, 2, 3, 5, 8], labels: ["1", "2", "3", "5", "8"] }, kinds: [], can_edit: false } }
    await saveAnswer(BOARD, { msg: "ok", data: { project_uuid: "p1", project_is_member: 1, project_access: { role: "member", comment: true, edit_tasks: "all" }, project_tasks_todo: [] } })
    // A task's page in p1, read with its project's parts (?include=…project_meta).
    await saveAnswer("/task/info/t1", { msg: "ok", data: { task_uuid: "t1", task_name: "Write brief", task_project: { project_uuid: "p1" } }, included: { estimates: SCALE } })
    const made = await queueCreate(CREATE, CREATE, "POST", { task_name: "Book the venue", task_project_uuid: "p1", task_status: "todo" })
    const id = String(made.data?.task_uuid)
    const POINTS = "/task/updateTaskPoints"
    expect(await queueBehind(POINTS, POINTS, "POST", { task_uuid: id, task_estimate_points: 3 })).toBe("kept")
    const page = (await answerFor(`/task/info/${id}`)) as { data: Record<string, unknown>; included: Record<string, unknown> }
    expect(page.included.estimates).toEqual(SCALE)
    // The board's access stays with it, and the points show as set.
    expect(page.data).toMatchObject({ task_estimate_points: 3, task_project: { project_uuid: "p1", project_is_member: 1 } })
    // A project where no task's page was read here: no scale is made up.
    const elsewhere = await queueCreate(CREATE, CREATE, "POST", { task_name: "Elsewhere", task_project_uuid: "p2", task_status: "todo" })
    expect(((await answerFor(`/task/info/${elsewhere.data?.task_uuid}`)) as { included: Record<string, unknown> }).included.estimates).toBeUndefined()
  })

  it("puts a task made offline on the lists on screen, and only a task (a sub-task shows under its parent)", async () => {
    const seen: unknown[] = []
    const on = (e: Event) => seen.push((e as CustomEvent<{ task?: unknown }>).detail?.task)
    window.addEventListener("onecamp:offline-made", on)
    try {
      const made = await queueCreate(CREATE, CREATE, "POST", { task_name: "Draft", task_project_uuid: "p1" })
      await queueCreate(SUBTASK, SUBTASK, "POST", { task_uuid: "t1", task_name: "Sub", task_project_uuid: "p1" })
      expect(seen).toMatchObject([{ task_uuid: made.data?.task_uuid, task_name: "Draft", task_project: { project_uuid: "p1" } }])
    } finally {
      window.removeEventListener("onecamp:offline-made", on)
    }
  })

  it("keeps the id the server made, so a screen still on the device's id goes on under it", async () => {
    const made = await queueCreate(CREATE, CREATE, "POST", { task_name: "Draft", task_project_uuid: "p1" })
    const id = String(made.data?.task_uuid)
    goOnline()
    http.request.mockResolvedValueOnce({ data: { data: { task_uuid: "t-real" } } })
    await replayNow()
    const s = await OfflineStore.open("ann")
    try {
      expect(await s.madeIds([id, "offline-0d1f2e3c-4b5a-4f6e-8d7c-6b5a4f3e2d1c"])).toEqual({ [id]: "t-real" })
    } finally {
      s.close()
    }
  })
})
