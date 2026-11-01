import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { SWRConfig } from "swr"
import axiosInstance from "@/lib/axiosInstance"
import { noteNetworkFailure, noteNetworkOk } from "@/lib/connectivity"
import { READ_FAILURE_BEAT_MS } from "@/lib/http/loadFailure"
import { useFetch } from "./useFetch"

const toasts: unknown[] = []
vi.mock("@/hooks/use-toast", () => ({
  toast: (t: unknown) => {
    toasts.push(t)
    return { id: String(toasts.length), dismiss: () => {}, update: () => {} }
  },
}))

// As axios rejects: no network at all (no response), no answer in time, or an answer with a failing status.
const unplugged = () => Object.assign(new Error("Network Error"), { isAxiosError: true, code: "ERR_NETWORK" })
const timedOut = () => Object.assign(new Error("timeout of 30000ms exceeded"), { isAxiosError: true, code: "ECONNABORTED" })
// Two misses in a row: the app says it's offline (lib/connectivity). The spied get skips the interceptors that note them.
const offline = () => {
  noteNetworkFailure()
  noteNetworkFailure()
}
const answeredWith = (status: number) =>
  Object.assign(new Error(`Request failed with status code ${status}`), { isAxiosError: true, response: { status, data: { msg: "Something went wrong" } } })

const fresh = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false, revalidateOnFocus: false }}>{children}</SWRConfig>
)
const read = () => renderHook(() => useFetch<{ msg: string }>("/project/p1/forecast"), { wrapper: fresh })
const aBeat = () => new Promise((resolve) => setTimeout(resolve, READ_FAILURE_BEAT_MS + 100))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  toasts.length = 0
  noteNetworkOk()
})

// asana-12: offline, a cold start drew "Couldn't load the forecast" and the doc tree's "Couldn't load these" for reads
// nobody kept. ONE rule, in the read every part goes through: while the app says it's offline (lib/connectivity, the
// state OfflineNotice says), the network's silence is the notice's to say. On a reachable server it's a failure.
describe("a read the network leaves unanswered while the app is offline", () => {
  it("is still on its way, not a failure, and raises no toast", async () => {
    offline()
    const get = vi.spyOn(axiosInstance, "get").mockRejectedValue(unplugged())
    const { result } = read()
    await waitFor(() => expect(get).toHaveBeenCalled())
    await aBeat()
    expect(result.current.isError).toBeUndefined()
    expect(result.current.isLoading).toBe(true)
    expect(toasts).toHaveLength(0)
  })

  it("asks again the moment the app is back, with no failure said in between", async () => {
    offline()
    let answer: (value: unknown) => void = () => {}
    const get = vi
      .spyOn(axiosInstance, "get")
      .mockRejectedValueOnce(unplugged())
      .mockImplementationOnce(() => new Promise((resolve) => { answer = resolve }))
    const { result } = read()
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1))
    await aBeat()
    act(() => noteNetworkOk())
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    expect(result.current.isError).toBeUndefined()
    expect(result.current.isLoading).toBe(true)
    act(() => answer({ data: { msg: "back" } }))
    await waitFor(() => expect(result.current.data).toEqual({ msg: "back" }))
    expect(result.current.isError).toBeUndefined()
  })
})

// A miss or a timeout on a server the app still reaches is no offline stretch: nothing would ask again, so the part
// says it failed, with its Try again, as before (CR-115 row 2053, MUST 2).
describe("a read the network leaves unanswered while the app is online", () => {
  for (const [what, error] of [["a miss", unplugged], ["a timeout", timedOut]] as const) {
    it(`fails as ever (${what})`, async () => {
      vi.spyOn(axiosInstance, "get").mockRejectedValue(error())
      const { result } = read()
      await waitFor(() => expect(result.current.isError).toBeTruthy())
      expect(result.current.isLoading).toBe(false)
    })
  }
})

describe("a read the server answers with a failure", () => {
  for (const status of [403, 404, 500]) {
    it(`fails as ever (${status})`, async () => {
      vi.spyOn(axiosInstance, "get").mockRejectedValue(answeredWith(status))
      const { result } = read()
      await waitFor(() => expect(result.current.isError).toBeTruthy())
      expect(result.current.isLoading).toBe(false)
    })
  }
})
