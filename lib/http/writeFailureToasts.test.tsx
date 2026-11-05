import { act, cleanup, render } from "@testing-library/react"
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/*
 * A write's failure is said once (V-397). A row that says it in place ("Not
 * saved. <why>", useSaveStatus) keeps the shared toast quiet; a write that
 * nothing on screen says is still toasted. Said twice, the toast lay over the
 * row's next step at 390 (gcal-new-audit-retention H2's 409, 3 Nov 2026), and
 * 8 cards, the switch rows of 5 more and all 11 AI switches said every failed
 * save both ways. Through the real request interceptor, with the server in
 * memory.
 *
 * lib/http/writeFailure is the arbiter, for writes as lib/http/loadFailure is
 * for reads (the owner's policy of 12 Oct 2026: one report per failure). The
 * interceptor hands it every failed write; its toast waits one task (not a
 * microtask), so the failed request's promise settles and its caller's await
 * and catch run first, and a row that says the failure claims it
 * (saysWriteFailure, in lib/http/writeSaid, so a row's chunk carries no toast)
 * in time. A caller that wraps the error in a new one
 * claims nothing, and the toast stays: a failure is never said less than once.
 * The why lives here, not in the module: every route's first load carries the
 * module's bytes, comments included (scripts/fluidity's source lines).
 */

const toasts: { title?: string; description?: string }[] = []
vi.mock("@/hooks/use-toast", () => ({
  toast: (t: { title?: string; description?: string }) => {
    toasts.push(t)
    return { id: String(toasts.length), dismiss: () => undefined, update: () => undefined }
  },
  useToast: () => ({ toast: () => undefined, dismiss: () => undefined, toasts: [] }),
}))

const { default: axiosInstance } = await import("@/lib/axiosInstance")
const { SavedTick, useSaveStatus } = await import("@/components/ui/saveStatus")

/** The server, in memory: a path answers 200, fails with a status and a message, or never answers (status 0). */
let answers: Record<string, { status: number; data?: unknown }> = {}
const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
  const path = String(config.url).replace(/^https?:\/\/[^/]+\/?/, "/").replace(/^\/?/, "/")
  const a = answers[path] ?? { status: 404, data: { msg: "nothing here" } }
  if (a.status === 0) throw new AxiosError("Network Error", AxiosError.ERR_NETWORK, config, {})
  const response = { status: a.status, statusText: "", data: a.data, headers: {}, config }
  if (a.status < 400) return response
  throw new AxiosError(`Request failed with status code ${a.status}`, "ERR_BAD_RESPONSE", config, null, response)
}

/** One turn of the event loop: every await and catch of the failed write has run. */
const turn = () => act(() => new Promise<void>((r) => setTimeout(r, 0)))

/** A row that saves through useSaveStatus and says how it went, as every settings row does. */
let save: (path: string) => Promise<boolean> = async () => false
function Row() {
  const { status, run } = useSaveStatus()
  save = (path) => run(() => axiosInstance.post(path, {}))
  return <SavedTick status={status} />
}

beforeEach(() => {
  axiosInstance.defaults.adapter = adapter
  toasts.length = 0
  answers = {}
})
afterEach(cleanup)

describe("a failed write is said once", () => {
  it("in place only, when its row says it: Not saved, and no toast over the next row", async () => {
    answers["/rename"] = { status: 409, data: { msg: "Someone renamed this first (a)" } }
    const view = render(<Row />)
    await act(() => save("/rename"))
    await turn()
    expect(view.container.textContent).toBe("Not saved. Someone renamed this first (a)")
    expect(toasts).toEqual([])
  })

  it("in place only for a write that got no answer, too", async () => {
    answers["/away"] = { status: 0 }
    const view = render(<Row />)
    await act(() => save("/away"))
    await turn()
    expect(view.container.textContent).toMatch(/^Not saved\. \S/)
    expect(toasts).toEqual([])
  })

  it("in a toast when its row went away before it failed", async () => {
    answers["/rename"] = { status: 409, data: { msg: "Someone renamed this first (b)" } }
    const view = render(<Row />)
    view.unmount()
    await save("/rename")
    await turn()
    expect(toasts.map((t) => t.description)).toEqual(["Someone renamed this first (b)"])
  })

  it("in a toast, once, when nothing on screen says it", async () => {
    answers["/rename"] = { status: 409, data: { msg: "Someone renamed this first (c)" } }
    await axiosInstance.post("/rename", {}).catch(() => undefined)
    await turn()
    expect(toasts.map((t) => t.description)).toEqual(["Someone renamed this first (c)"])
  })
})
