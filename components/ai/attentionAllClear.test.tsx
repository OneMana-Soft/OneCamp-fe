import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

vi.mock("@/components/common/withFeature", () => ({ withAI: (C: React.ComponentType) => C }))
let aiState: "unknown" | "available" = "available"
vi.mock("@/hooks/useClientConfig", () => ({ FEATURE_AI: "ai", useFeatureState: () => aiState }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("@/services/memoryService", async (orig) => ({
  ...(await orig<typeof import("@/services/memoryService")>()),
  getAttention: vi.fn().mockResolvedValue({ enabled: true, items: [] }),
}))

const { default: AttentionCard } = await import("@/components/ai/AttentionCard")

// A clear day must read as finished, not as a card that failed to load.
describe("What needs me now, with nothing in it", () => {
  afterEach(() => {
    cleanup()
    aiState = "available"
  })

  // Rendering nothing while the server's config loaded, then arriving, pushed
  // all of Home down. The card holds its place in that moment.
  it("holds its place while it isn't yet known whether AI is on", () => {
    aiState = "unknown"
    render(<AttentionCard />)
    expect(screen.getByRole("status", { name: "Loading what needs you" })).toBeTruthy()
  })

  it("says nothing needs you instead of disappearing", async () => {
    render(<AttentionCard />)
    expect(await screen.findByText("Nothing needs you right now")).toBeTruthy()
    expect(screen.getByRole("status")).toBeTruthy()
  })
})
