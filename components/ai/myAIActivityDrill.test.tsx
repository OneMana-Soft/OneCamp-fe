import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import MyAIActivityCard from "@/components/ai/MyAIActivityCard"
import type { DrillResult, DrillStatus } from "@/services/governanceDrillService"

vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useFeature: () => true,
}))

const mutate = vi.fn()
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: { data: [] }, isLoading: false, mutate }),
}))

let status: DrillStatus | undefined
let result: DrillResult | undefined
let runError: Error | undefined

vi.mock("@/services/governanceDrillService", () => ({
  getMyDrillStatus: () => Promise.resolve(status),
  runMyDrill: () => (runError ? Promise.reject(runError) : Promise.resolve(result)),
}))

const seeded: DrillStatus = {
  seeded: true,
  allowed_channel: "drill-engineering",
  forbidden_channel: "drill-finance",
}

const refused: DrillResult = {
  passed: true,
  steps: [
    { name: "the person is not a member", explain: "so a refusal means something", ok: true },
    { name: "the post is refused", explain: "checked against live membership", ok: true },
  ],
  refusal_reason: "you are not a member of this channel",
  rows: [
    {
      seq: 41,
      id: "row-1",
      action: "agent.drill.refused",
      summary: "Drill: post in #drill-finance refused",
      prev_hash: "aaaa1111",
      entry_hash: "bbbb2222",
      created_at: new Date().toISOString(),
    },
  ],
  chain_ok: true,
  chain_checked: 500,
  chain_partial: true,
  ran_at: new Date().toISOString(),
}

beforeEach(() => {
  status = seeded
  result = refused
  runError = undefined
  mutate.mockClear()
})
afterEach(cleanup)

describe("running the drill as yourself", () => {
  // The drill was admin-only, and on the public demo nobody is an admin. A
  // refusal you watched happen is different evidence from one you were shown.
  it("is offered to a member once the fixture exists", async () => {
    render(<MyAIActivityCard />)
    expect(await screen.findByRole("button", { name: /prove it/i })).toBeTruthy()
  })

  it("is not offered on a workspace where nobody has set it up", async () => {
    status = { ...seeded, seeded: false }
    render(<MyAIActivityCard />)
    await screen.findByText(/Nothing yet/i)
    expect(screen.queryByRole("button", { name: /prove it/i })).toBeNull()
  })

  it("quotes the permission layer rather than paraphrasing it", async () => {
    render(<MyAIActivityCard />)
    fireEvent.click(await screen.findByRole("button", { name: /prove it/i }))
    expect(await screen.findByText(/you are not a member of this channel/i)).toBeTruthy()
  })

  it("shows the audit row the run just wrote, with both hashes", async () => {
    const { container } = render(<MyAIActivityCard />)
    fireEvent.click(await screen.findByRole("button", { name: /prove it/i }))
    await screen.findByText(/agent.drill.refused/)
    const text = container.textContent || ""
    expect(text).toContain("#41")
    expect(text).toMatch(/prev/i)
  })

  // The run writes the rows the feed below shows. Without this the reader
  // presses the button, sees the proof, and the list under it still says
  // nothing has ever happened.
  it("refreshes the feed the run just added to", async () => {
    render(<MyAIActivityCard />)
    fireEvent.click(await screen.findByRole("button", { name: /prove it/i }))
    await waitFor(() => expect(mutate).toHaveBeenCalled())
  })

  it("says so when the run could not happen", async () => {
    runError = new Error("nope")
    render(<MyAIActivityCard />)
    fireEvent.click(await screen.findByRole("button", { name: /prove it/i }))
    expect(await screen.findByRole("alert")).toBeTruthy()
  })

  // An empty feed on a workspace that can prove the point should say so rather
  // than leave the reader waiting for an agent to act.
  it("invites the reader to make something appear", async () => {
    render(<MyAIActivityCard />)
    expect(await screen.findByText(/Press Prove it/i)).toBeTruthy()
  })
})
