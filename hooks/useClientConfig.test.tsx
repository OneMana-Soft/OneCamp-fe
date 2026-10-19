import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"

// 17 Oct (design step 4): a dark channel shot had no Huddle and no AI spark,
// and "Search" where the light one said "Search or ask". The client config
// (what this server has: AI, calls…) hadn't answered, and everything optional
// reads as off until it does, and stays off when the read fails: features
// vanished and nobody was told. Now the last config is kept for the next
// load, a failed read is asked again, and with nothing known the page says so.

const get = vi.fn()
vi.mock("@/lib/axiosInstance", () => ({ default: { get: (...a: unknown[]) => get(...a) } }))

const { CLIENT_CONFIG_KEY } = await import("@/lib/clientConfigKey")
const { useAIAvailable, useFeature, FEATURE_CALLS } = await import("./useClientConfig")
const { FeaturesNotice } = await import("@/components/banner/FeaturesNotice")

const SERVER = { data: { data: { upload_limit_mb: 10, upload_limit_bytes: 10 << 20, transcription_mode: "frontend", features: { ai: true, calls: true }, email_enabled: true } } }

function Header() {
  const ai = useAIAvailable()
  const calls = useFeature(FEATURE_CALLS)
  return (
    <p>
      {ai ? "Search or ask" : "Search"}
      {calls ? " · Huddle" : ""}
    </p>
  )
}

/** The page, over a fresh cache: seeded with what the last load kept, or empty. */
function page(kept?: unknown) {
  const cache = new Map<string, unknown>()
  if (kept) cache.set(CLIENT_CONFIG_KEY, { data: kept })
  return render(
    <SWRConfig value={{ provider: () => cache as never, dedupingInterval: 0 }}>
      <FeaturesNotice />
      <Header />
    </SWRConfig>,
  )
}

// A block: an arrow that returns the spy hands vitest a cleanup to call.
beforeEach(() => {
  get.mockReset()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("what this server has, when its read fails", () => {
  it("keeps the features the last load knew", async () => {
    get.mockRejectedValue(new Error("Network Error"))
    page(SERVER.data.data)
    await waitFor(() => expect(get).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.getByText("Search or ask · Huddle")).toBeTruthy()
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("says so when nothing is known, and Try again asks again", async () => {
    get.mockRejectedValueOnce(new Error("Network Error")).mockResolvedValue(SERVER)
    page()
    const notice = await screen.findByRole("status")
    expect(notice.textContent).toContain("Couldn't check what this workspace has.")
    expect(notice.textContent).toContain("Some features may be missing until it answers.")
    expect(screen.getByText("Search")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(screen.getByText("Search or ask · Huddle")).toBeTruthy())
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("asks again on its own after a failure", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"] })
    // Every read fails until the clock has moved on: the page's own reads fail,
    // and only a read SWR makes again later can succeed.
    let failing = true
    get.mockImplementation(() => (failing ? Promise.reject(new Error("Network Error")) : Promise.resolve(SERVER)))
    page()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })
    // The page's first reads (one per reader that mounts while none is on its way).
    const first = get.mock.calls.length
    expect(first).toBeGreaterThan(0)
    failing = false
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(get.mock.calls.length).toBeGreaterThan(first)
    vi.useRealTimers()
    await waitFor(() => expect(screen.getByText("Search or ask · Huddle")).toBeTruthy())
  })

  it("says nothing while the first read is on its way", async () => {
    get.mockReturnValue(new Promise(() => {}))
    page()
    await act(async () => {})
    expect(screen.queryByRole("status")).toBeNull()
  })
})
