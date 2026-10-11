import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"

// The self-test runs inline on the Overview (design v3, admin §A15): each
// check's glyph resolves in sequence, a spinner and then a moss check or a
// danger cross, 120ms apart, and the finished set says "N of M passed" with a
// seal. The stagger is presentation only, so under reduced motion every
// result shows at once, and every result is the server's.

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/services/aiModelService", async (orig) => ({
  ...(await orig<typeof import("@/services/aiModelService")>()),
  getAISelfTestStatus: vi.fn(),
  getAuthorizedModels: vi.fn(),
  runAISelfTest: vi.fn(),
}))

import { SELF_TEST_STAGGER_MS, SelfTestRows, useSelfTest } from "@/components/admin/ai/AISelfTestSection"
import { getAISelfTestStatus, getAuthorizedModels } from "@/services/aiModelService"

const done = {
  state: "completed",
  passed: 2,
  failed: 1,
  total: 3,
  checks: [
    { name: "Answers a plain question", passed: true },
    { name: "Calls a tool with the right arguments", passed: true },
    { name: "Refuses a channel it can't see", passed: false, detail: "It posted." },
  ],
}
const config = { enabled: true, chat_model: "llama3.2" } as never

function Harness() {
  const test = useSelfTest()
  return <SelfTestRows test={test} config={config} />
}

function setReducedMotion(reduce: boolean) {
  window.matchMedia = ((q: string) => ({ matches: reduce && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} })) as never
}

beforeEach(() => {
  vi.mocked(getAISelfTestStatus).mockResolvedValue(done as never)
  vi.mocked(getAuthorizedModels).mockResolvedValue([] as never)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const states = (c: HTMLElement) => [...c.querySelectorAll("[data-check-row]")].map((r) => (r as HTMLElement).dataset.state)

describe("the self-test's rows", () => {
  it("resolves one check every 120ms, then says how many passed with a seal", async () => {
    setReducedMotion(false)
    vi.useFakeTimers()
    const { container } = render(<Harness />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(states(container)).toEqual(["pending", "pending", "pending"])
    expect(container.querySelector("[data-self-test-result]")).toBeNull()
    await act(async () => {
      vi.advanceTimersByTime(SELF_TEST_STAGGER_MS)
    })
    expect(states(container)).toEqual(["passed", "pending", "pending"])
    for (let i = 0; i < 2; i++) {
      await act(async () => {
        vi.advanceTimersByTime(SELF_TEST_STAGGER_MS)
      })
    }
    expect(states(container)).toEqual(["passed", "passed", "failed"])
    expect(screen.getByText("2 of 3 passed")).toBeTruthy()
    expect(screen.getByText("It posted.")).toBeTruthy()
    expect(SELF_TEST_STAGGER_MS).toBe(120)
  })

  it("shows every result at once under reduced motion", async () => {
    setReducedMotion(true)
    const { container } = render(<Harness />)
    expect(await screen.findByText("2 of 3 passed")).toBeTruthy()
    expect(states(container)).toEqual(["passed", "passed", "failed"])
  })

  it("draws nothing before any run", async () => {
    setReducedMotion(false)
    vi.mocked(getAISelfTestStatus).mockResolvedValue({ state: "idle", passed: 0, failed: 0, total: 0 } as never)
    const { container } = render(<Harness />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(container.querySelector("[data-self-test]")).toBeNull()
  })
})
