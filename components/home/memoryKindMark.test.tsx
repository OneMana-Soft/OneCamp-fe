import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// DESIGN-BUILD-118 F1 (C11): a commitment's mark on Home was CheckCircle2,
// the done task's disc with its check, beside an open task's empty circle.
// A memory item's kind takes its mark from one kind -> mark map
// (lib/ui/memoryKindIcon), on Home's needs row, the briefing and the memory
// page (memoryStillRelevant.test), and a commitment's is not a status glyph.

const KindMark = vi.hoisted(() => (p: { className?: string }) => <svg data-kind-mark="" className={p.className} />)
vi.mock("@/lib/ui/memoryKindIcon", async (orig) => {
  const m = await orig<{ MEMORY_KIND_ICON: object }>()
  return { ...m, MEMORY_KIND_ICON: { ...m.MEMORY_KIND_ICON, commitment: KindMark } }
})
const openItems = vi.hoisted(() => ({ list: [] as unknown[] }))
vi.mock("@/components/common/withFeature", () => ({ withAI: <P,>(C: React.ComponentType<P>) => C }))
vi.mock("@/services/memoryService", () => ({
  briefingKey: () => "briefing",
  getBriefing: async () => ({ enabled: true, open_items: openItems.list, highlights: [], day_items: [] }),
}))
vi.mock("@/lib/utils/sharedRequest", () => ({ peekShared: () => undefined }))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "u1" } } }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("react-redux", () => ({ useSelector: (pick: (s: unknown) => unknown) => pick({ users: { userSidebar: { userChannels: [] } } }) }))

const { NeedsLead } = await import("@/components/home/needsRow")
const { default: BriefingCard } = await import("@/components/ai/BriefingCard")
const { MEMORY_KIND_ICON } = await vi.importActual<typeof import("@/lib/ui/memoryKindIcon")>("@/lib/ui/memoryKindIcon")

afterEach(cleanup)

describe("a commitment's mark", () => {
  it("is not a done task's check: the map gives it a mark of its own", () => {
    const { container } = render(<MEMORY_KIND_ICON.commitment />)
    const cls = container.querySelector("svg")?.getAttribute("class") ?? ""
    expect(cls).toContain("lucide-handshake")
    expect(cls).not.toMatch(/check/)
  })

  it("leads Home's needs row from the map, in dusk ink", () => {
    const { container } = render(<NeedsLead item={{ id: "c1", kind: "due", title: "Send the deck", commitment: true, overdue: true, due: "Commitment · was due 3 Nov" }} />)
    const mark = container.querySelector("[data-kind-mark]")
    expect(mark).toBeTruthy()
    expect(mark?.getAttribute("class")).toContain("text-camp-dusk-ink")
  })

  it("marks the briefing's open commitment from the map", async () => {
    openItems.list = [{ id: "m1", kind: "commitment", content: "Send the deck", status: "open", source_type: "channel" }]
    render(<BriefingCard />)
    const row = (await screen.findByText("Send the deck")).closest("li") as HTMLElement
    expect(row.querySelector("[data-kind-mark]")).toBeTruthy()
  })
})
