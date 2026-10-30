import { act, cleanup, render, screen } from "@testing-library/react"
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios"
import { SWRConfig, useSWRConfig } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { pinTestClock } from "@/lib/testing/testClock"

// The bar above a DM reads the other person's status as the DM opens and every
// minute after, behind whatever the reader is doing. When its check fails the
// route answers 503 "Couldn't check. Try again.", and the read toasted that
// over the conversation (CR-56, 26 Oct). A failed read is the bar's to say,
// quietly: it keeps what it last knew, and says the status is unknown only
// when it never knew it.

const toasts: unknown[] = []
vi.mock("@/hooks/use-toast", () => ({
  toast: (t: unknown) => {
    toasts.push(t)
    return { id: String(toasts.length), dismiss: () => undefined, update: () => undefined }
  },
  useToast: () => ({ toast: () => undefined, dismiss: () => undefined, toasts: [] }),
}))

const { default: axiosInstance } = await import("@/lib/axiosInstance")
const { READ_FAILURE_BEAT_MS } = await import("@/lib/http/loadFailure")
const { HeldNotificationsBar } = await import("./heldNotificationsBar")

const answering =
  (data: unknown): AxiosAdapter =>
  async (config: InternalAxiosRequestConfig) => ({ status: 200, statusText: "", data, headers: {}, config })
/** The route when its check fails. */
const unavailable: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
  const response = { status: 503, statusText: "", data: { msg: "Couldn't check. Try again." }, headers: {}, config }
  throw new AxiosError("Request failed with status code 503", "ERR_BAD_RESPONSE", config, null, response)
}

// A failed read's toast waits a beat (lib/http/loadFailure): wait past it.
const beat = () => act(() => new Promise((r) => setTimeout(r, READ_FAILURE_BEAT_MS + 150)))

/** The bar's next read, as its minute comes round. */
let readAgain: (key: string) => Promise<unknown> = async () => undefined
function Reads() {
  readAgain = useSWRConfig().mutate
  return null
}

const bar = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false, revalidateOnFocus: false }}>
      <Reads />
      <HeldNotificationsBar userUUID="maya" name="Maya Chen" />
    </SWRConfig>,
  )

pinTestClock()
beforeEach(() => {
  toasts.length = 0
})
afterEach(cleanup)

describe("the held bar's read, when the check fails", () => {
  it("toasts nothing, and the bar says quietly that it couldn't check", async () => {
    axiosInstance.defaults.adapter = unavailable
    bar()
    await beat()
    expect(toasts).toEqual([])
    expect(screen.getByRole("status").textContent).toBe("Couldn't check whether Maya will be notified now.")
  })

  it("keeps what it last knew through a failed read", async () => {
    axiosInstance.defaults.adapter = answering({ data: { reason: "paused", until: "2026-10-15T16:00:00Z" } })
    bar()
    expect((await screen.findByRole("status")).textContent).toMatch(/^Maya paused notifications until /)
    axiosInstance.defaults.adapter = unavailable
    await act(() => readAgain("/user/notificationStatus/maya"))
    await beat()
    expect(toasts).toEqual([])
    expect(screen.getByRole("status").textContent).toMatch(/^Maya paused notifications until /)
  })
})
