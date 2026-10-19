import { afterEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"

// A write nobody waits on (a doc's or a board's view recorded, a board
// comment's mirror, the browser's push token) asks for no error toast:
// showErrorToast: false. That only stood this hook's own toast down, and the
// global one said the failure anyway: every doc opened with the view record
// failing showed "Not found" (17 Oct, the e2e tests' stray toast).

const toasts: { title?: string; description?: string }[] = []
vi.mock("@/hooks/use-toast", () => {
  const toast = (t: { title?: string; description?: string }) => {
    toasts.push(t)
    return { id: String(toasts.length), dismiss: () => {}, update: () => {} }
  }
  return { toast, useToast: () => ({ toast }) }
})

const { default: axiosInstance } = await import("@/lib/axiosInstance")
const { usePost } = await import("@/hooks/usePost")
const { PostEndpointUrl } = await import("@/services/endPoints")

/** The server's answer to every request in a test. */
function serverAnswers(status: number, data: unknown) {
  const previous = axiosInstance.defaults.adapter
  axiosInstance.defaults.adapter = async (config) => {
    const res = { data, status, statusText: String(status), headers: {}, config }
    const { AxiosError } = await import("axios")
    throw new AxiosError("Request failed", String(status), config, undefined, res as never)
  }
  return () => {
    axiosInstance.defaults.adapter = previous
  }
}

let restore: () => void = () => {}
afterEach(() => {
  restore()
  toasts.length = 0
})

async function post(options: { showErrorToast?: boolean; showToast?: boolean }) {
  const { result } = renderHook(() => usePost())
  await act(async () => {
    await result.current.makeRequest({ apiEndpoint: PostEndpointUrl.RecordDocView, payload: { doc_uuid: "d1" }, ...options }).catch(() => undefined)
  })
}

describe("a write that asks for no error toast", () => {
  it("says nothing when it fails", async () => {
    restore = serverAnswers(404, { msg: "Not in this test" })
    await post({ showErrorToast: false })
    expect(toasts).toEqual([])
  })

  it("leaves a write that didn't ask to say its failure", async () => {
    // A failure of its own: the global toast doesn't say the same words twice
    // in a row.
    restore = serverAnswers(500, { msg: "The disk is full" })
    await post({})
    expect(toasts).toHaveLength(1)
  })
})
