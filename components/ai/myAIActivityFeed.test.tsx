import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"

import MyAIActivityCard from "@/components/ai/MyAIActivityCard"

vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useFeature: () => true,
}))
vi.mock("@/services/governanceDrillService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/governanceDrillService")>()),
  getMyDrillStatus: vi.fn(async () => undefined),
}))
// jsdom lays nothing out, so the virtual list would draw no rows: every row here.
vi.mock("@/components/list/virtualInfiniteScroll", () => ({
  VirtualInfiniteScroll: <T,>({ items, renderItem }: { items: T[]; renderItem: (item: T, i: number) => ReactNode }) => (
    <div>{items.map((item, i) => <div key={i}>{renderItem(item, i)}</div>)}</div>
  ),
}))

const refusal = {
  kind: "audit",
  title: "agent.drill.refused",
  actor: "visitor@demo.onemana.dev",
  summary: "Drill: post in #drill-finance refused (you are not a member of this channel)",
  status: "refused",
  source: "agent",
  at: "2026-10-10T06:00:00Z",
  seq: 46,
  prev_hash: "d94363b0aaaaaaaaaaaaaaaa3fa89917",
  entry_hash: "91582c2abbbbbbbbbbbbbbbbd15dfa87",
  initiator: "person",
}
const run = {
  kind: "agent_run",
  title: "Release Captain",
  actor: "agent",
  summary: "Posted the release notes in #engineering",
  status: "succeeded",
  source: "mention",
  at: "2026-10-10T05:00:00Z",
  agent_id: "a-1",
  run_id: "r-1",
}

let answer: { data?: unknown; isLoading: boolean; isError?: unknown; mutate: () => void } = {
  data: { data: [refusal, run] },
  isLoading: false,
  mutate: () => {},
}
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => answer }))

afterEach(() => {
  cleanup()
  answer = { data: { data: [refusal, run] }, isLoading: false, mutate: () => {} }
})

describe("the AI record in Activity (the feed variant)", () => {
  it("draws each entry as an Activity row: a mark, who acted and how, what on, and when", () => {
    const { container } = render(<MyAIActivityCard variant="feed" />)
    const rows = container.querySelectorAll("[data-feed-row]")
    expect(rows).toHaveLength(2)
    const first = rows[0] as HTMLElement
    // The feed's one row: ListRow at its density, led by a 36px mark with a badge.
    expect(first.className).toContain("md:min-h-16")
    expect(first.querySelector("[data-hue]")?.className).toContain("size-9")
    expect(first.textContent).toContain("An agent")
    expect(first.textContent).toContain("acted as you")
    expect(first.textContent).toContain("refused by permissions")
    expect(first.textContent).toContain("Drill: post in #drill-finance refused")
    // A named agent is drawn like a person, by its name.
    const second = rows[1] as HTMLElement
    expect(second.textContent).toContain("Release Captain")
    expect(second.textContent).toContain("ran")
    expect(second.textContent).toContain("Posted the release notes")
  })

  it("keeps the evidence one press away rather than on four lines", () => {
    const { container } = render(<MyAIActivityCard variant="feed" />)
    const row = container.querySelector("[data-feed-row]") as HTMLElement
    // Not on the row at rest: the row is the feed's height.
    expect(row.textContent).not.toContain("#46")
    expect(row.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(row)
    expect(row.getAttribute("aria-expanded")).toBe("true")
    expect(row.textContent).toContain("#46")
    expect(row.textContent).toContain("agent.drill.refused")
  })

  it("is drawn in the Activity frame, not as a card with a title of its own", () => {
    const { container } = render(<MyAIActivityCard variant="feed" />)
    expect(container.querySelector("[data-feed-frame] > [data-feed-toolbar]")).toBeTruthy()
    expect(screen.queryByText("What the AI did for you")).toBeNull()
    // The download sits in the toolbar row, where the other tabs keep their filter.
    expect(container.querySelector("[data-feed-toolbar]")?.textContent).toContain("Download the record")
  })

  it("says a failed load failed, never that nothing has acted as you", () => {
    answer = { data: undefined, isLoading: false, isError: new Error("500"), mutate: () => {} }
    const { container } = render(<MyAIActivityCard variant="feed" />)
    expect(container.querySelector("[data-feed-state]")?.textContent).toMatch(/Couldn.t load your AI activity/)
    expect(container.textContent).not.toMatch(/Nothing has acted as you yet/)
  })

  it("explains an empty record with the frame's empty state and its spot", () => {
    answer = { data: { data: [] }, isLoading: false, mutate: () => {} }
    const { container } = render(<MyAIActivityCard variant="feed" />)
    const state = container.querySelector("[data-feed-state]")
    expect(state?.textContent).toMatch(/Nothing has acted as you yet/)
    expect(state?.querySelector("[data-empty-illustration]")).toBeTruthy()
  })
})

describe("the AI record on the settings page (the card)", () => {
  it("is still the card: its title, whose record it is, and the admin feed's rows", () => {
    const { container } = render(<MyAIActivityCard />)
    expect(screen.getByText("What the AI did for you")).toBeTruthy()
    expect(container.textContent).toMatch(/you see yourself/i)
    expect(container.querySelectorAll("ul > li")).toHaveLength(2)
    // Nothing of the feed's frame or rows.
    expect(container.querySelector("[data-feed-frame]")).toBeNull()
    expect(container.querySelector("[data-feed-row]")).toBeNull()
  })

  // "Nothing yet" on a governance record that failed to load told the reader
  // no agent had acted as them.
  it("says a failed load failed", () => {
    answer = { data: undefined, isLoading: false, isError: new Error("500"), mutate: () => {} }
    const { container } = render(<MyAIActivityCard />)
    expect(container.textContent).toMatch(/Couldn.t load your AI activity/)
    expect(container.textContent).not.toMatch(/Nothing yet/)
  })
})
