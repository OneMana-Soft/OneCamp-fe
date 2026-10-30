"use client"

/**
 * Where the app's requests meet the Offline Store (projects P7-1): two
 * interceptors on the app's API client, put on when the store opens for the
 * member and taken off when it closes. Nothing on a route's first load
 * changes: useFetch and usePost stay as they are, lib/axiosInstance only
 * leaves an answer given here (offlineAnswered) out of its network checks,
 * and this comes with the store's own chunk, after the page.
 *
 * - A task answer read is kept on the device.
 * - A task read the network doesn't answer is answered from the device, when
 *   one is kept and nothing is on screen for it yet (over what is on screen,
 *   SWR keeps what it shows: a change made offline among it).
 * - A task field change the network doesn't take is kept and sent later, and
 *   answered as accepted, so the screen keeps it instead of putting it back.
 * - A task field change made online, for a task with changes still kept, is
 *   kept behind them and answered the same way: each task's changes reach
 *   the server in the order they were made.
 *   The network's "your change wasn't saved" stands down for it; when it can't
 *   be kept (the outbox is full), the member is told so instead.
 * - A task, sub-task or comment made with no network (P7-1c) waits under an id
 *   of the device's own, which never reaches the server: once made, a request
 *   naming it goes under the server's id; until then a read of it is answered
 *   from the device, a create or kept change that hangs off it waits behind
 *   it, and anything else is refused here, in words that say why.
 *
 * A refusal (any answer from the server) is never answered from the device.
 */

import axios, { AxiosError, type AxiosInstance, type AxiosResponse, type InternalAxiosRequestConfig } from "axios"
import { offlineIdsIn as idsIn } from "@/lib/offline/offlineId"
import { TASK_CREATES, TASK_WRITES } from "@/lib/offline/tasks"
import { errorToastCopy, shownRecently } from "@/lib/utils/errorToast"
import { toast } from "@/hooks/use-toast"

const READS = /^\/(project\/taskList|project\/taskListForKanban|user\/assignedTaskList|user\/assignedTaskListForKanban|task\/info)(\/|\?|$)/

/** Field changes the store keeps: one list, the store's own (lib/offline/tasks). */
export const OFFLINE_WRITES: readonly string[] = Object.keys(TASK_WRITES)

/** Creates the store keeps (P7-1c): a task, a sub-task, a comment. */
export const OFFLINE_CREATES: readonly string[] = Object.keys(TASK_CREATES)

/** Whether an answer from url is kept: task reads only, never a profile, a token or a session. */
export function keepsOffline(url: string | undefined): boolean {
  return !!url && READS.test(url)
}

/** The task field change a write to url makes, if it is one the store keeps. */
export function offlineWrite(url: string | undefined): string | undefined {
  if (!url) return undefined
  const path = url.split("?")[0]
  return OFFLINE_WRITES.find((w) => path === w)
}

/** The create a write to url makes, if it is one the store keeps. */
export function offlineCreate(url: string | undefined): string | undefined {
  if (!url) return undefined
  const path = url.split("?")[0]
  return OFFLINE_CREATES.find((c) => path === c)
}

/** The request never reached the server, or nothing answered: not a refusal. */
export function isNetworkFailure(e: unknown): boolean {
  if (axios.isCancel(e)) return false
  return axios.isAxiosError(e) ? !e.response : false
}

declare module "axios" {
  interface AxiosRequestConfig {
    /** The store's own request (a waiting change, or the check before it): never kept or answered here. */
    offlineReplay?: boolean
    /** This quieted the client's network toast for the request (a change it may keep). */
    offlineQuiet?: boolean
  }
}

type Quiet = InternalAxiosRequestConfig

const WRITE_METHODS = new Set(["post", "put", "patch"])

export interface OfflineHooks {
  save(url: string, data: unknown): void
  /** The answer kept for url, if nothing is on screen for it (always: even then); undefined otherwise. */
  answer(url: string, always?: boolean): Promise<unknown>
  /** The ids the server made since, for those of ids (the device's) it has made. */
  made(ids: string[]): Promise<Record<string, string>>
  queue(endpoint: string, url: string, method: "POST" | "PUT" | "PATCH", payload: unknown): Promise<"kept" | "full" | "no">
  /** Keep the change behind the task's kept ones, if it has any: "kept"; otherwise it goes as it is. */
  queueBehind(endpoint: string, url: string, method: "POST" | "PUT" | "PATCH", payload: unknown): Promise<"kept" | "full" | "no">
  /** Keep a create, answered with what it makes: "kept" with it; "full" or "no" when it isn't kept. */
  queueCreate(
    endpoint: string,
    url: string,
    method: "POST" | "PUT" | "PATCH",
    payload: unknown,
  ): Promise<{ result: "kept" | "full" | "no"; data?: Record<string, unknown> }>
}

/** Said when the outbox is at its cap. */
const FULL = "Too many changes are waiting to be sent. This one can't be kept on this device until they are."

/** What a kept create is answered with: what it makes, under the device's id. */
const keptCreate = (data: unknown) => ({ msg: "Kept on this device", queued: true, data })

function bodyOf(data: unknown): unknown {
  if (typeof data !== "string") return data
  try {
    return JSON.parse(data)
  } catch {
    return data
  }
}

function answered(config: InternalAxiosRequestConfig, data: unknown, status: number): AxiosResponse {
  return { data, status, statusText: "", headers: {}, config }
}

/** Says a create still waits on this device: what hangs off it can't be done yet. */
export const STILL_WAITING = "What you made offline is still waiting to be sent. Try this again once it's sent."

/** The ids the device gave that a request names, in its address or its body (lib/offline/offlineId finds them). */
function offlineIdsIn(config: Quiet): string[] {
  return idsIn(`${config.url ?? ""} ${JSON.stringify(bodyOf(config.data) ?? null)}`)
}

const plainBody = (data: unknown) =>
  typeof data === "string" || Array.isArray(data) || (data !== null && typeof data === "object" && Object.getPrototypeOf(data) === Object.prototype)

/** The request under the ids the server made since; true when it names none of the device's left. */
async function asMade(config: Quiet, ids: string[], hooks: OfflineHooks): Promise<boolean> {
  const made = await hooks.made(ids)
  const pairs = Object.entries(made)
  if (pairs.length) {
    const swap = (text: string) => pairs.reduce((t, [from, to]) => t.split(from).join(to), text)
    if (config.url) config.url = swap(config.url)
    if (config.data !== undefined && plainBody(config.data)) {
      config.data = typeof config.data === "string" ? swap(config.data) : (JSON.parse(swap(JSON.stringify(config.data))) as unknown)
    }
  }
  return ids.every((id) => made[id])
}

/** Answered on the device and never sent: a 2xx resolves, anything else is refused as the server would refuse it. */
function answerHere(config: Quiet, status: number, data: unknown): Quiet {
  config.offlineAnswered = true
  config.adapter = async () => {
    const res = answered(config, data, status)
    if (status < 400) return res
    throw new AxiosError(String((data as { msg?: unknown } | null)?.msg ?? "Refused"), AxiosError.ERR_BAD_REQUEST, config, undefined, res)
  }
  return config
}

/**
 * A request that names something made on this device whose create still
 * waits: a read of it is answered from the device; a create or a kept change
 * that hangs off it waits behind it; anything else is refused here, and a
 * change the member made is told why. None is sent.
 */
async function waitingHere(config: Quiet, method: string, hooks: OfflineHooks): Promise<Quiet> {
  const quiet = !!config.suppressErrorToast
  if (method === "get" || method === "head") {
    const kept = keepsOffline(config.url) ? await hooks.answer(config.url!, true) : undefined
    if (kept !== undefined) return answerHere(config, 200, kept)
    // A read the device doesn't keep (a panel's part, say): nothing is on the
    // server for it yet, and the screen that asked shows its own state.
    config.suppressErrorToast = true
    return answerHere(config, 404, { msg: STILL_WAITING })
  }
  if (WRITE_METHODS.has(method)) {
    const verb = method.toUpperCase() as "POST" | "PUT" | "PATCH"
    const body = bodyOf(config.data)
    const create = offlineCreate(config.url)
    const endpoint = create ? undefined : offlineWrite(config.url)
    const kept = create
      ? await hooks.queueCreate(create, config.url!, verb, body)
      : { result: endpoint ? await hooks.queueBehind(endpoint, config.url!, verb, body) : ("no" as const) }
    if (kept.result === "kept") return answerHere(config, 202, create ? keptCreate((kept as { data?: unknown }).data) : { queued: true })
    config.suppressErrorToast = true
    if (!quiet) {
      toast({ variant: "destructive", title: "Couldn't save that", description: kept.result === "full" ? FULL : STILL_WAITING })
    }
    return answerHere(config, 409, { msg: kept.result === "full" ? FULL : STILL_WAITING })
  }
  config.suppressErrorToast = true
  if (!quiet) toast({ variant: "destructive", title: "Couldn't do that", description: STILL_WAITING })
  return answerHere(config, 409, { msg: STILL_WAITING })
}

/** Put the interceptors on client; returns how to take them off. */
export function interceptRequests(client: AxiosInstance, hooks: OfflineHooks): () => void {
  const request = client.interceptors.request.use(async (config: Quiet) => {
    if (config.offlineReplay) return config
    const method = String(config.method ?? "get").toLowerCase()
    // An id this device gave never reaches the server: one made since goes
    // under the server's id, and one whose create still waits is answered here.
    const ids = offlineIdsIn(config)
    if (ids.length && !(await asMade(config, ids, hooks))) return waitingHere(config, method, hooks)
    const create = WRITE_METHODS.has(method) ? offlineCreate(config.url) : undefined
    const endpoint = WRITE_METHODS.has(method) && !create ? offlineWrite(config.url) : undefined
    if (!endpoint && !create) return config
    if (endpoint) {
      const verb = method.toUpperCase() as "POST" | "PUT" | "PATCH"
      const behind = await hooks.queueBehind(endpoint, config.url!, verb, bodyOf(config.data))
      // Never sent from here: the outbox sends it after the task's older changes.
      if (behind === "kept") return answerHere(config, 202, { queued: true })
    }
    if (!config.suppressErrorToast) {
      // The network's "wasn't saved" would be wrong for a change kept here;
      // every other failure is still said, below, as the client says it.
      config.suppressErrorToast = true
      config.offlineQuiet = true
    }
    return config
  })
  const response = client.interceptors.response.use(
    (res) => {
      const own = res.config as Quiet | undefined
      // The store's own requests, and answers it gave itself, are never kept as reads.
      if (own?.offlineReplay || own?.offlineAnswered) return res
      const method = String(res.config?.method ?? "get").toLowerCase()
      if (method === "get" && keepsOffline(res.config?.url)) hooks.save(res.config.url!, res.data)
      return res
    },
    async (error: AxiosError) => {
      const config = error.config as Quiet | undefined
      if (!config || config.offlineReplay || config.offlineAnswered) throw error
      const method = String(config.method ?? "get").toLowerCase()
      if (isNetworkFailure(error)) {
        if (method === "get" && keepsOffline(config.url)) {
          const kept = await hooks.answer(config.url!)
          if (kept !== undefined) return answered(config, kept, 200)
          throw error
        }
        const endpoint = offlineWrite(config.url)
        const create = offlineCreate(config.url)
        if ((endpoint || create) && WRITE_METHODS.has(method)) {
          const verb = method.toUpperCase() as "POST" | "PUT" | "PATCH"
          const kept = create ? await hooks.queueCreate(create, config.url!, verb, bodyOf(config.data)) : { result: await hooks.queue(endpoint!, config.url!, verb, bodyOf(config.data)) }
          const result = kept.result
          if (result === "kept") return answered(config, create ? keptCreate((kept as { data?: unknown }).data) : { queued: true }, 202)
          if (config.offlineQuiet) {
            toast({
              variant: "destructive",
              title: "Couldn't save that",
              description:
                result === "full" ? FULL : "Your change wasn't saved. Check your connection and try again.",
            })
          }
        }
        throw error
      }
      // A refusal of a change this quieted: said as the client says it.
      if (config.offlineQuiet && error.response && error.response.status !== 401) {
        const data = error.response.data as { msg?: unknown; code?: unknown } | undefined
        const copy = errorToastCopy(error.response.status, data?.msg, data?.code)
        if (!shownRecently(copy)) toast({ variant: "destructive", ...copy })
      }
      throw error
    },
  )
  return () => {
    client.interceptors.request.eject(request)
    client.interceptors.response.eject(response)
  }
}
