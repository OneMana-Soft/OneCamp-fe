import { act, cleanup, render } from "@testing-library/react"
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios"
import { SWRConfig } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// A doc's suggestions are read as it opens, for the chip by its title and the
// marks in its text. When that read fails, the doc still opened: the chip draws
// nothing and nothing toasts. The list beside the doc says it in place, with
// Try again (SuggestionsList). It toasted on every doc open whose read failed,
// over a doc that loaded.

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
const { default: SuggestionsChip } = await import("./SuggestionsChip")

/** The server, failing every read. */
const failing: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
  const response = { status: 503, statusText: "", data: { msg: "suggestions are being moved" }, headers: {}, config }
  throw new AxiosError("Request failed with status code 503", "ERR_BAD_RESPONSE", config, null, response)
}

// A failed read's toast waits a beat (lib/http/loadFailure): wait past it.
const beat = () => act(() => new Promise((r) => setTimeout(r, READ_FAILURE_BEAT_MS + 150)))

beforeEach(() => {
  axiosInstance.defaults.adapter = failing
  toasts.length = 0
})
afterEach(cleanup)

describe("a doc's suggestions that fail to load", () => {
  it("toast nothing as the doc opens, and the chip draws nothing", async () => {
    const view = render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false, revalidateOnFocus: false }}>
        <SuggestionsChip docId="d1" />
      </SWRConfig>,
    )
    await beat()
    expect(toasts).toEqual([])
    expect(view.container.querySelector("[data-suggestions-chip]")).toBeNull()
  })
})
