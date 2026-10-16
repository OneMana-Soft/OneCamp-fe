import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// QA SH-09 (14 Oct 2026): Home's briefing ran a doc's title into its body on
// one line, "Launch sync notes Attendees: Sam, Maya, Jonas Decisions…". A
// highlight that names itself is drawn as its name, then its text in ink-2.

const highlights = vi.hoisted(() => ({ list: [] as unknown[] }))
vi.mock("@/components/common/withFeature", () => ({ withAI: <P,>(C: React.ComponentType<P>) => C }))
vi.mock("@/services/memoryService", () => ({
  briefingKey: () => "briefing",
  getBriefing: async () => ({ enabled: true, open_items: [], highlights: highlights.list, day_items: [] }),
}))
vi.mock("@/lib/utils/sharedRequest", () => ({ peekShared: () => undefined }))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "u1" } } }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("react-redux", () => ({ useSelector: (pick: (s: unknown) => unknown) => pick({ users: { userSidebar: { userChannels: [] } } }) }))

const { default: BriefingCard } = await import("./BriefingCard")

afterEach(cleanup)

describe("the briefing's recent highlights", () => {
  it("draws a doc's name on its own line and its text under it", async () => {
    highlights.list = [
      { content_type: "doc", content_uuid: "d1", doc_uuid: "d1", author_name: "Maya Chen", snippet: "Launch sync notes · Attendees: Sam, Maya, Jonas", title: "Launch sync notes", excerpt: "Attendees: Sam, Maya, Jonas" },
      { content_type: "post", content_uuid: "p1", author_name: "Jonas Weber", snippet: "Can someone check the rollback steps?" },
    ]
    render(<BriefingCard />)
    const title = await screen.findByText("Launch sync notes")
    expect(title.hasAttribute("data-highlight-title")).toBe(true)
    const excerpt = screen.getByText("Attendees: Sam, Maya, Jonas")
    expect(excerpt.className).toContain("text-ink-2")
    // A message has no name of its own: its line is the snippet.
    expect(screen.getByText("Can someone check the rollback steps?")).toBeTruthy()
  })
})
