import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

vi.mock("@/components/common/withFeature", () => ({ withAI: (C: React.ComponentType) => C }))
let aiState: "unknown" | "available" = "available"
vi.mock("@/hooks/useClientConfig", () => ({ FEATURE_AI: "ai", useFeatureState: () => aiState }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("@/services/memoryService", async (orig) => ({
  ...(await orig<typeof import("@/services/memoryService")>()),
  getAttention: vi.fn().mockResolvedValue({
    enabled: true,
    items: [{ source: "task", kind: "Due today", title: "Write the launch announcement", url: "/app/task/t1", ref_id: "t1", subtitle: "Q4 launch" }],
  }),
}))

const { default: AttentionCard } = await import("@/components/ai/AttentionCard")

// What each line box is made of: the classes that set a row's height.
const frame = (root: ParentNode) => {
  const row = root.querySelector("[data-attention-row]")
  return {
    row: (row?.className || "").split(" ").filter((c) => !c.startsWith("hover:") && c !== "transition-colors").sort().join(" "),
    title: root.querySelector("[data-attention-title]")?.className,
    meta: root.querySelector("[data-attention-meta]")?.className,
  }
}

// Home's grid sits under this card. The skeleton's row was 3 px shorter than
// a real row, so the grid moved when the answer came (Home's last shift).
describe("What needs me now, while it loads", () => {
  afterEach(() => {
    cleanup()
    aiState = "available"
  })

  it("draws its skeleton row in the real row's frame, so the card keeps its height", async () => {
    aiState = "unknown"
    const loading = render(<AttentionCard />)
    expect(screen.getByRole("status", { name: "Loading what needs you" })).toBeTruthy()
    const skeleton = frame(loading.container)
    expect(skeleton.row).not.toBe("")
    cleanup()

    aiState = "available"
    const loaded = render(<AttentionCard />)
    await screen.findByText("Write the launch announcement")
    expect(frame(loaded.container)).toEqual(skeleton)
  })
})
