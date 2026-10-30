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
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: (...a: unknown[]) => get(...a) } }))

const { CLIENT_CONFIG_KEY } = await import("@/lib/clientConfigKey")
const { useAIAvailable, useFeature, useFeatureState, FEATURE_AI, FEATURE_CALLS } = await import("./useClientConfig")
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

// 22 Oct: Home's needs list waits for the AI answer so its AI rows don't swap
// in, and with the read failed and nothing kept it waited for good. A route
// still waits (FeaturesNotice offers Try again); a part of a page stops.
describe("a part of a page that waits for the answer", () => {
  function Parts() {
    const route = useFeatureState(FEATURE_AI)
    const part = useFeatureState(FEATURE_AI, { onFailure: "unavailable" })
    return <p>{`route ${route} · part ${part}`}</p>
  }
  function parts(kept?: unknown) {
    const cache = new Map<string, unknown>()
    if (kept) cache.set(CLIENT_CONFIG_KEY, { data: kept })
    return render(
      <SWRConfig value={{ provider: () => cache as never, dedupingInterval: 0 }}>
        <Parts />
      </SWRConfig>,
    )
  }

  it("waits while the read is on its way, as a route does", async () => {
    get.mockReturnValue(new Promise(() => {}))
    parts()
    await act(async () => {})
    expect(screen.getByText("route unknown · part unknown")).toBeTruthy()
  })

  it("stops waiting once the read has failed with nothing known, while a route waits on", async () => {
    get.mockRejectedValue(new Error("Network Error"))
    parts()
    await waitFor(() => expect(screen.getByText("route unknown · part unavailable")).toBeTruthy())
  })

  // 22 Oct: a server with nothing optional answers with the defaults. Nothing
  // was drawn again for that answer, so Home's list held its placeholder until
  // something else drew the page (5 s later, a failed read's retry).
  it.each([
    ["an empty config", { msg: "ok", data: {} }],
    ["no config at all", { msg: "ok" }],
  ])("takes %s as an answer, for both", async (_, body) => {
    get.mockResolvedValue({ data: body })
    parts()
    await waitFor(() => expect(screen.getByText("route unavailable · part unavailable")).toBeTruthy())
  })

  it("keeps the last load's answer through a failed read, for both", async () => {
    get.mockRejectedValue(new Error("Network Error"))
    parts(SERVER.data.data)
    await waitFor(() => expect(get).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.getByText("route available · part available")).toBeTruthy()
  })
})

// 28 Oct (DESIGN-BUILD-24): a call's guest page asked the members' config four
// times, and the server refused each one (401): a guest has no session. A
// visitor's page (a guest link, a booking, a form; lib/visitorPage) asks
// nothing, and the workspace's optional parts are not a visitor's: each reads
// as off, and known, even where this browser kept a member's answer.
describe("on a visitor's page", () => {
  beforeEach(() => window.history.pushState({}, "", "/guest/m/a-guest-link"))
  afterEach(() => window.history.pushState({}, "", "/"))

  it("asks nothing, and every optional part reads as off, known", async () => {
    get.mockResolvedValue(SERVER)
    page(SERVER.data.data)
    await act(async () => {})
    expect(get).not.toHaveBeenCalled()
    expect(screen.getByText("Search")).toBeTruthy()
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("tells a part that waits, as it tells a route, that nothing is there", async () => {
    get.mockResolvedValue(SERVER)
    render(<FeatureLine />)
    await act(async () => {})
    expect(get).not.toHaveBeenCalled()
    expect(screen.getByText("route unavailable · part unavailable")).toBeTruthy()
  })
})

function FeatureLine() {
  const route = useFeatureState(FEATURE_AI)
  const part = useFeatureState(FEATURE_AI, { onFailure: "unavailable" })
  return <p>{`route ${route} · part ${part}`}</p>
}
