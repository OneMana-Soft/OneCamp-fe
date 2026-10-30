import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"

/**
 * What needs me waits for the server to say whether it has AI, so that the
 * AI's rows don't swap in under the reader. It must not wait for an answer
 * that isn't coming: with /config/client failed and nothing kept, the AI
 * answer stays "unknown", and the list held its two loading rows for good
 * while the reads it shows had long come in (the greeting shots, 21 Oct).
 */
const get = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: (...a: unknown[]) => get(...a), post: vi.fn() } }))
vi.mock("@/components/home/useHomeNeeds", () => ({
  useHomeNeeds: () => ({
    items: [{ id: "task:t1", kind: "due", title: "Write the launch announcement", status: "todo", due: "Due today", taskUuid: "t1" }],
    loading: false,
    error: false,
    retry: () => {},
    selfId: "u-sam",
  }),
}))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKind: () => undefined }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))

const { NeedsMe } = await import("@/components/home/NeedsMe")

const SERVER = (ai: boolean) => ({ data: { data: { upload_limit_mb: 10, upload_limit_bytes: 10 << 20, transcription_mode: "frontend", features: { ai }, email_enabled: true } } })
const withAI = vi.fn(() => <section data-testid="ai-part" />)
// The loading section names itself by its heading; its aria-label says it is loading.
const loadingRows = () => document.querySelector('[data-needs-me][aria-label="Loading what needs you"]')

/** Home's list over a fresh cache: nothing kept from an earlier load. */
function home(ai = true) {
  const cache = new Map<string, unknown>()
  return render(
    <SWRConfig value={{ provider: () => cache as never, dedupingInterval: 0 }}>
      <NeedsMe withAI={ai ? withAI : undefined} />
    </SWRConfig>,
  )
}

beforeEach(() => {
  get.mockReset()
  withAI.mockClear()
})
afterEach(() => {
  cleanup()
})

describe("what needs me, waiting for the server's AI answer", () => {
  it("waits while the answer is on the way", async () => {
    get.mockReturnValue(new Promise(() => {}))
    home()
    await act(async () => {})
    expect(loadingRows()).not.toBeNull()
    expect(screen.queryByText("Write the launch announcement")).toBeNull()
  })

  it("stops waiting once asking has failed, and shows what it has", async () => {
    get.mockRejectedValue(new Error("Network Error"))
    home()
    await waitFor(() => expect(screen.getByText("Write the launch announcement")).toBeTruthy())
    expect(loadingRows()).toBeNull()
    expect(withAI).not.toHaveBeenCalled()
  })

  it("hands the list to the AI's part once the server says it has AI", async () => {
    get.mockResolvedValue(SERVER(true))
    home()
    await waitFor(() => expect(screen.getByTestId("ai-part")).toBeTruthy())
  })

  it("shows its own rows when the server says it has no AI", async () => {
    get.mockResolvedValue(SERVER(false))
    home()
    await waitFor(() => expect(screen.getByText("Write the launch announcement")).toBeTruthy())
    expect(withAI).not.toHaveBeenCalled()
  })

  it("never waits on the edition without AI, which passes no AI part", async () => {
    get.mockReturnValue(new Promise(() => {}))
    home(false)
    await act(async () => {})
    expect(screen.getByText("Write the launch announcement")).toBeTruthy()
  })
})
