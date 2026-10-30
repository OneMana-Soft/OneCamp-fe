"use client"

/**
 * The Offline Store at work (projects P7-1): opened for the signed-in member,
 * fed every task answer read, asked for one when the network is gone, and
 * sending the waiting changes when it comes back. Loaded in a chunk of its own
 * after the page (lib/offline/hooks and components/offline/OfflineLoader), so
 * no route's first load carries it.
 */

import axios from "axios"
import axiosInstance from "@/lib/axiosInstance"
import { OfflineStore, registerKind } from "@/lib/offline/store"
import { Outbox, type Op, type Outcome } from "@/lib/offline/outbox"
import { newOfflineId, offlineIdsIn, randomKey } from "@/lib/offline/offlineId"
import {
  COMMENT,
  PROJECT,
  TASK,
  TASK_CREATES,
  TASK_WRITES,
  madeHere,
  madeOffline,
  overlay,
  projectKind,
  projectOfPage,
  sameValue,
  taskInfoUrl,
  taskKind,
  withCreates,
  withKeptProject,
  type WaitingCreate,
} from "@/lib/offline/tasks"
import { onOfflineWipe, wipeOfflineStore } from "@/lib/offline/wipe"
import { resetOfflineStatus, setOfflineStatus, setSendNow } from "@/lib/offline/status"
import { interceptRequests, keepsOffline } from "@/lib/offline/http"
import { answeredAt, onAnswered } from "@/lib/http/answered"
import { acrossTabs } from "@/lib/acrossTabs"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import type { UserProfileDataInterface } from "@/types/user"

/** What the store needs of SWR's cache: is something on screen for a key, and what was read before it opened. */
export interface ScreenCache {
  keys(): IterableIterator<string>
  get(key: string): { data?: unknown } | undefined
}

registerKind(taskKind)
registerKind(projectKind)
// The session ended (lib/offline/wipe): the interceptors come off and the store closes with it.
onOfflineWipe(() => stop())

/** Fired with the tasks whose screens should be read again (the loader revalidates their keys). */
export const OFFLINE_REFRESH = "onecamp:offline-refresh"

/** Fired with a task made with no network (P7-1c): the loader puts it on the lists on screen. */
export const OFFLINE_MADE = "onecamp:offline-made"

/**
 * One pass at a time in the whole browser: every tab sees "online" and holds
 * the same outbox, and a change sent twice is made twice (the update routes
 * set a field per call: a GitHub sync, an assignee's email). A tab that waited
 * reads the outbox again, and finds what the first one sent gone.
 */
const REPLAY_LOCK = "onecamp:offline-replay"

const onlineNow = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false)

const setStatus = setOfflineStatus

let store: OfflineStore | null = null
let outbox: Outbox | null = null
let opening: Promise<void> | null = null
let openFor: string | null = null
const early: [string, unknown][] = []

/** made: the creates the server made under ids of its own, which the screens take up. */
function refresh(ids: string[], made: { kind: string; from: string; to: string }[] = []) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(OFFLINE_REFRESH, { detail: { ids, made } }))
}

async function recount(): Promise<void> {
  if (!outbox) return
  const ops = await outbox.all()
  setStatus({
    waiting: ops.length,
    conflicts: ops.filter((o) => o.state === "conflict"),
    held: ops.filter((o) => o.state === "held"),
    failed: ops.filter((o) => o.state === "failed"),
    full: false,
  })
}

let screen: ScreenCache | null = null
let unhook: (() => void) | null = null
let unheard: (() => void) | null = null
// The answers already kept, so one the screen notes after the interceptor kept it isn't kept twice.
const keptAnswers = new WeakSet<object>()
// Every answer the device gave (answerFor): what was kept, with what waits laid over it. The screen notes it like any
// other, but it is never a read the server answered: kept as one, a create the server later refused would stay as
// made, and a made task's page would never take its project's access kept after it.
const fromDevice = new WeakSet<object>()
const isIn = (set: WeakSet<object>, data: unknown) => typeof data === "object" && data !== null && set.has(data)

/**
 * What the screen has for url when it is an answer to keep: one a read of this page got from the server. Never the
 * device's own, and never one the screen brought back from the last visit (lib/swrCache), which no read of this page
 * got (answeredAt) and which may be what the device answered then.
 */
function serverAnswerOnScreen(url: string): unknown {
  const data = keepsOffline(url) && answeredAt(url) !== undefined ? screen?.get(url)?.data : undefined
  return isIn(fromDevice, data) ? undefined : data
}

/**
 * Open the store for member: the one signed in. Anything kept for someone
 * else goes first. cache is SWR's: the task answers this page's reads already
 * got are kept at once, and a read is answered from the device only when
 * nothing is on screen for it.
 */
export async function start(member: string, cache?: ScreenCache): Promise<void> {
  if (!member) return
  if (openFor === member && opening) return opening
  stop()
  openFor = member
  screen = cache ?? null
  // A read sent before the interceptor was on (the engine loads after the page) can answer after the store has kept
  // what was on screen: the screen notes it once SWR has it (lib/http/answered), and it is kept then (p7eflaky1).
  unheard = onAnswered((url) => {
    const data = serverAnswerOnScreen(url)
    if (data !== undefined && !isIn(keptAnswers, data)) void saveAnswer(url, data)
  })
  unhook = interceptRequests(axiosInstance, {
    save: (url, data) => void saveAnswer(url, data),
    answer: (url, always) => (always || screen?.get(url)?.data === undefined ? answerFor(url) : Promise.resolve(undefined)),
    made: async (ids) => {
      if (opening) await opening
      return store ? await store.madeIds(ids).catch(() => ({})) : {}
    },
    queue,
    queueBehind,
    queueCreate,
  })
  opening = (async () => {
    try {
      const opened = await OfflineStore.open(member)
      if (openFor !== member) {
        opened.close()
        return
      }
      store = opened
      outbox = new Outbox(opened)
      const saves = early.splice(0)
      for (const key of screen ? [...screen.keys()] : []) {
        const data = serverAnswerOnScreen(key)
        if (data !== undefined) saves.push([key, data])
      }
      // Best effort: these answers are already on screen, so a save that fails
      // (a full quota, a database the browser closed, an answer that won't
      // clone) only means that answer isn't kept offline, and the rest go on.
      for (const [url, data] of saves) await opened.saveRead(url, data).catch(() => {})
      await recount()
      setSendNow(() => void replayNow())
      void replayNow()
    } catch {
      // No IndexedDB (a private window, blocked storage): the app works as it
      // did before, online only.
      store = null
      outbox = null
    }
  })()
  if (typeof window !== "undefined") {
    window.addEventListener("online", onOnline)
  }
  return opening
}

export function stop(): void {
  setSendNow(null)
  if (typeof window !== "undefined") {
    window.removeEventListener("online", onOnline)
  }
  unhook?.()
  unhook = null
  unheard?.()
  unheard = null
  screen = null
  if (timer) clearTimeout(timer)
  timer = null
  store?.close()
  store = null
  outbox = null
  opening = null
  openFor = null
  resetOfflineStatus()
}

function onOnline() {
  void replayNow()
}

/** Keep an answer as read. Before the member is known, the last few wait. */
export async function saveAnswer(url: string, data: unknown): Promise<void> {
  if (typeof data === "object" && data !== null) keptAnswers.add(data)
  if (!store) {
    early.push([url, data])
    if (early.length > 20) early.shift()
    return
  }
  // Best effort, as above: the answer is already shown, and a failed save only
  // means it won't be there offline. It must not reach the read that asked.
  await store.saveRead(url, data).catch(() => {})
}

/**
 * The answer kept for url (or, for the page of a task made here, one built
 * from its create), with what the member made and changed since that still
 * waits laid over it; undefined when there is none.
 */
export async function answerFor(url: string): Promise<unknown> {
  if (opening) await opening
  if (!store || !outbox) return undefined
  // A change held behind a create that wasn't made shows nowhere.
  const ops = (await outbox.all()).filter((o) => o.state !== "held")
  const creates: WaitingCreate[] = ops
    .filter((o) => o.action === "create")
    .map((o) => ({ endpoint: o.url.split("?")[0], id: o.id, payload: o.payload, at: o.queuedAt }))
  const kept = await store.read(url).catch(() => undefined)
  let answer = kept ? kept.answer : madeHere(url, creates)
  if (answer === undefined) return undefined
  // A task made here offers what the member may do in its project, as its
  // board or list was read (asana-12); nothing when that project wasn't read.
  if (!kept) answer = withKeptProject(answer, await keptProject(projectOfPage(answer)))
  const given = overlay(
    withCreates(url, answer, creates, { member: openFor ?? undefined, author: author() }),
    ops.filter((o) => o.kind === TASK && o.field).map((o) => ({ id: o.id, field: o.field!, value: o.value })),
  )
  if (typeof given === "object" && given !== null) fromDevice.add(given)
  return given
}

/** A project as kept from its board or list (lib/offline/tasks projectsIn). */
async function keptProject(id: string | undefined): Promise<Record<string, unknown> | undefined> {
  if (!id || !store) return undefined
  return (await store.get(PROJECT, id).catch(() => undefined))?.value
}

/** The member as the screens have them, to name the writer of a comment made here. */
function author(): UserProfileDataInterface | undefined {
  const profile = (screen?.get(GetEndpointUrl.SelfProfile)?.data as { data?: UserProfileDataInterface } | undefined)?.data
  return profile && profile.user_uuid === openFor ? profile : undefined
}

/**
 * Keep a change the network didn't take: "kept" when it will be sent; "full"
 * when the outbox is at its cap; "no" when it isn't a change this store keeps
 * (or there is no store). Unless kept, the caller fails as it did before.
 */
export type QueueResult = "kept" | "full" | "no"

export async function queue(endpoint: string, url: string, method: Op["method"], payload: unknown): Promise<QueueResult> {
  if (opening) await opening
  const write = TASK_WRITES[endpoint]
  const body = (payload ?? {}) as Record<string, unknown>
  const id = typeof body.task_uuid === "string" ? body.task_uuid : ""
  if (!store || !outbox || !write || !id) return "no"
  const kept = await store.get(TASK, id).catch(() => undefined)
  // A change to a task made offline waits on its create.
  const after = madeOffline(id) ? await createOf(id) : undefined
  const result = await outbox.enqueue({
    opKey: randomKey(),
    kind: TASK,
    id,
    action: "update",
    dependsOn: after,
    method,
    url,
    payload,
    field: write.field,
    base: kept ? write.read(kept.value) : undefined,
    hasBase: !!kept,
    value: body[write.payloadKey],
    label: typeof kept?.value.task_name === "string" ? kept.value.task_name : undefined,
    parent: projectOf(body, kept?.value),
  })
  await recount()
  if (!result.ok) {
    setStatus({ full: true })
    return "full"
  }
  if (replaying) void replayNow()
  else scheduleRetry()
  return "kept"
}

/**
 * A change made online to a task with changes still on the device goes behind
 * them, in the order made: sent ahead, it would be undone by the older ones.
 * "no" when nothing waits for the task (it goes as it is).
 */
export async function queueBehind(endpoint: string, url: string, method: Op["method"], payload: unknown): Promise<QueueResult> {
  if (opening) await opening
  const id = typeof (payload as { task_uuid?: unknown } | null)?.task_uuid === "string" ? (payload as { task_uuid: string }).task_uuid : ""
  if (!outbox || !id || !TASK_WRITES[endpoint]) return "no"
  if (!(await outbox.all()).some((o) => o.kind === TASK && o.id === id)) return "no"
  const result = await queue(endpoint, url, method, payload)
  if (result === "kept") void replayNow()
  return result
}

/**
 * A create the network didn't take, or one that hangs off a create still on
 * the device (P7-1c): kept under an id of the device's own and answered with
 * what it makes, so the screen shows it. It is sent once the network is back,
 * after the create it hangs off, under the id the server made that one with.
 */
export async function queueCreate(
  endpoint: string,
  url: string,
  method: Op["method"],
  payload: unknown,
): Promise<{ result: QueueResult; data?: Record<string, unknown> }> {
  if (opening) await opening
  const spec = TASK_CREATES[endpoint]
  const body = (payload ?? {}) as Record<string, unknown>
  if (!store || !outbox || !spec) return { result: "no" }
  const id = newOfflineId()
  const parent = spec.parentOf(body)
  const at = Date.now()
  const result = await outbox.enqueue({
    queuedAt: at,
    opKey: randomKey(),
    kind: spec.kind,
    id,
    action: "create",
    method,
    url,
    payload,
    hasBase: false,
    label: typeof body.task_name === "string" ? body.task_name : undefined,
    parent: projectOf(body, undefined),
    dependsOn: madeOffline(parent) ? await createOf(parent) : undefined,
  })
  await recount()
  if (!result.ok) {
    setStatus({ full: true })
    return { result: "full" }
  }
  if (replaying) void replayNow()
  else scheduleRetry()
  const data = spec.entity(id, body, at)
  // A task (not a sub-task: that shows under its parent) joins the lists on screen.
  if (endpoint === PostEndpointUrl.CreateTask && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OFFLINE_MADE, { detail: { task: data } }))
  }
  return { result: "kept", data }
}

/** The opKey of the create still waiting that made id on this device. */
async function createOf(id: string): Promise<string | undefined> {
  return (await outbox?.all())?.find((o) => o.action === "create" && o.id === id)?.opKey
}

/** The task's project: the change names it, or the task as last read does (a board move names none). */
function projectOf(body: Record<string, unknown>, task: Record<string, unknown> | undefined): string | undefined {
  if (typeof body.task_project_uuid === "string" && body.task_project_uuid) return body.task_project_uuid
  const project = (task?.task_project as { project_uuid?: unknown } | undefined)?.project_uuid
  return typeof project === "string" && project ? project : undefined
}

function statusOf(e: unknown): number | undefined {
  return axios.isAxiosError(e) ? e.response?.status : undefined
}

/**
 * How a request that failed should be taken. A 403 on the change itself is a
 * refusal (the member still sees the task, and may not make this change); on
 * the read before it, the task is gone for them.
 */
export function outcomeOf(e: unknown, write = false): Outcome {
  const code = statusOf(e)
  if (code === undefined || code === 429) return { kind: "retry" }
  if (code === 401) return { kind: "signedOut" }
  if (code === 404 || (code === 403 && !write)) return { kind: "gone" }
  if (code === 408 || code >= 500) return { kind: "failed" }
  const data = axios.isAxiosError(e) ? (e.response?.data as { msg?: string; message?: string } | undefined) : undefined
  return { kind: "refused", message: data?.msg || data?.message }
}

/**
 * The change as it goes on the wire: every id the device gave that it names
 * (its own id, unless it is the create the device keys by it, its address,
 * what it sends) as the server made it, from the notes the outbox keeps.
 * undefined while one isn't made yet: an id the device gave never reaches the
 * server (CODE-REVIEWER-79 MF1), however the change came to name it.
 */
async function onTheWire(op: Op): Promise<Op | undefined> {
  const named = `${op.action === "create" ? "" : op.id} ${op.url} ${JSON.stringify(op.payload ?? null)}`
  const ids = offlineIdsIn(named)
  if (!ids.length) return op
  const made: Record<string, string> = store ? await store.madeIds(ids).catch(() => ({})) : {}
  if (ids.some((id) => !made[id])) return undefined
  const swap = (text: string) => ids.reduce((t, id) => t.split(id).join(made[id]), text)
  return { ...op, id: swap(op.id), url: swap(op.url), payload: op.payload === undefined ? undefined : (JSON.parse(swap(JSON.stringify(op.payload))) as unknown) }
}

/** Send one waiting change, as the member, through its own route. */
export async function send(waiting: Op): Promise<Outcome> {
  const op = await onTheWire(waiting)
  if (!op) return { kind: "held" }
  try {
    if (op.kind === TASK && op.hasBase && op.field) {
      const write = Object.values(TASK_WRITES).find((w) => w.field === op.field)
      const now = await axiosInstance.get(taskInfoUrl(op.id), { suppressErrorToast: true, offlineReplay: true })
      const theirs = write ? write.read((now.data?.data ?? {}) as Record<string, unknown>) : undefined
      if (write && !sameValue(theirs, op.base) && !sameValue(theirs, op.value)) return { kind: "conflict", theirs }
    }
  } catch (e) {
    return outcomeOf(e)
  }
  try {
    const res = await axiosInstance.request({
      method: op.method,
      url: op.url,
      data: op.payload,
      headers: { "Idempotency-Key": op.opKey },
      suppressErrorToast: true,
      offlineReplay: true,
    })
    return { kind: "sent", made: op.action === "create" ? madeId(op.kind, res?.data?.data) : undefined }
  } catch (e) {
    return outcomeOf(e, true)
  }
}

/**
 * The id the server made a create under: a comment's own (the server answers
 * it as comment_id), else a task's (a sub-task is a task).
 */
export function madeId(kind: string, data: unknown): string | undefined {
  const made = (data ?? {}) as { task_uuid?: unknown; comment_id?: unknown }
  const id = kind === COMMENT ? made.comment_id : made.task_uuid
  return typeof id === "string" && id ? id : undefined
}

let replaying: Promise<void> | null = null
let again = false
let timer: ReturnType<typeof setTimeout> | null = null

function scheduleRetry(ms = 30_000) {
  if (timer || typeof window === "undefined") return
  timer = setTimeout(() => {
    timer = null
    void replayNow()
  }, ms)
}

/** Send what can go now. One pass at a time, in this tab and across tabs. */
export function replayNow(): Promise<void> {
  if (replaying) {
    // A pass works from the outbox as it read it when it began: a change kept
    // since then goes in one more pass, right after it.
    again = true
    return replaying
  }
  replaying = (async () => {
    // Let go in the same turn as the last check, so a call after it starts a pass of its own.
    try {
      let stopped = false
      do {
        again = false
        stopped = await pass()
      } while (again && !stopped)
    } finally {
      replaying = null
      again = false
    }
  })()
  return replaying
}

/** One pass, under the browser's lock: true when it stopped (no answer, 429, the session over), so none follows at once. */
function pass(): Promise<boolean> {
  return acrossTabs(REPLAY_LOCK, async () => {
    const box = outbox
    if (!box || !onlineNow()) return true
    if ((await box.all()).every((o) => o.state !== "waiting" && o.state !== "sending")) {
      await recount()
      return false
    }
    setStatus({ sending: true })
    try {
      const report = await box.replay(send)
      if (report.signedOut) {
        // The session is over: nothing kept for the member stays.
        stop()
        await wipeOfflineStore()
        resetOfflineStatus()
        return true
      }
      const lost = [...report.gone, ...report.refused]
      if (lost.length) {
        setStatus({ notice: { gone: report.gone.length, refused: report.refused.length, label: lost[0]?.label, at: Date.now() } })
      }
      // A create made under the server's id: the screens showing it read it again under that id.
      const touched = [...[...report.sent, ...lost].map((o) => o.id), ...report.made.map((m) => m.to)]
      if (touched.length) refresh([...new Set(touched)], report.made)
      await recount()
      if (report.stopped || report.failing.length) scheduleRetry()
      return report.stopped
    } finally {
      setStatus({ sending: false })
    }
  })
}

/** The member's answer to a conflict. */
export async function resolveConflict(seq: number, choice: "mine" | "theirs"): Promise<void> {
  if (!outbox) return
  const op = (await outbox.all()).find((o) => o.seq === seq)
  await outbox.resolve(seq, choice)
  await recount()
  if (choice === "theirs" && op) refresh([op.id])
  else void replayNow()
}

/** Retry on a change set aside after failing on the server: it is sent again now. */
export async function retryChange(seq: number): Promise<void> {
  if (!outbox) return
  await outbox.retry(seq)
  await recount()
  void replayNow()
}

/** Let go of a change that can't be sent (held behind a create that wasn't made, or set aside after failing). */
export async function discard(seq: number): Promise<void> {
  if (!outbox) return
  const op = (await outbox.all()).find((o) => o.seq === seq)
  await outbox.remove(seq)
  await recount()
  if (op) refresh([op.id])
}
