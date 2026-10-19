import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { ReactNode } from "react"

import { verifyChain } from "@/components/ai/proveIt"
import type { AIActivityItem } from "@/services/aiActivityService"

/** Prove it (hub.md AI15): the chain sweep and its banner. */
const entry = (seq: number, prev: string, hash: string): AIActivityItem => ({
  kind: "audit",
  title: "agent.drill.refused",
  summary: "Drill: post in #drill-finance refused (you are not a member of this channel)",
  status: "refused",
  at: `2026-10-10T06:00:${String(seq).padStart(2, "0")}Z`,
  seq,
  prev_hash: prev,
  entry_hash: hash,
})
const GOOD = [entry(46, "h45", "h46"), entry(45, "h44", "h45"), entry(37, "h36", "h37"), entry(36, "h35", "h36")]
const BROKEN = [entry(46, "tampered", "h46"), entry(45, "h44", "h45")]

describe("verifyChain", () => {
  it("checks every pair of neighbours on screen", () => {
    expect(verifyChain(GOOD)).toEqual({ ok: true, links: 2, entries: 4, brokenSeq: undefined })
  })
  it("names the first entry that does not match the one before it", () => {
    expect(verifyChain(BROKEN)).toMatchObject({ ok: false, brokenSeq: 46 })
  })
})

let items: AIActivityItem[] = GOOD
const celebrate = vi.fn(() => 1)
vi.mock("@/lib/celebrate", async (orig) => ({ ...(await orig<typeof import("@/lib/celebrate")>()), celebrateOnce: (...a: unknown[]) => celebrate(...(a as [])) }))
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()), useFeature: () => true }))
vi.mock("@/services/governanceDrillService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/governanceDrillService")>()),
  getMyDrillStatus: vi.fn(async () => undefined),
}))
vi.mock("@/hooks/useFetch", () => {
  const cache = new Map<unknown, unknown>()
  return {
    useFetch: () => {
      if (!cache.has(items)) cache.set(items, { data: { data: items }, isLoading: false, mutate: async () => {} })
      return cache.get(items)
    },
  }
})
vi.mock("@/components/list/virtualInfiniteScroll", () => ({
  VirtualInfiniteScroll: <T,>({ items, renderItem }: { items: T[]; renderItem: (item: T, i: number) => ReactNode }) => (
    <div>{items.map((item, i) => <div key={i}>{renderItem(item, i)}</div>)}</div>
  ),
}))

import MyAIActivityCard from "@/components/ai/MyAIActivityCard"
import { warmBursts } from "@/lib/celebrateSoon"

// The celebrations' bursts are a chunk fetched when the page is idle
// (lib/celebrateSoon): here they are in before anything finishes.
beforeAll(async () => {
  await warmBursts()
})

beforeEach(() => {
  vi.useFakeTimers()
  celebrate.mockClear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  items = GOOD
})

async function pressProve() {
  fireEvent.click(screen.getByRole("button", { name: /Prove it/ }))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000)
  })
}

describe("Prove it", () => {
  it("ticks each row's chain link and says the chain is intact, with the count, in moss", async () => {
    const { container } = render(<MyAIActivityCard variant="feed" />)
    await pressProve()
    expect(container.querySelectorAll("[data-chain=ok]")).toHaveLength(4)
    const banner = container.querySelector("[data-prove-banner=ok]") as HTMLElement
    expect(banner.className).toContain("bg-camp-moss-tint")
    expect(banner.textContent).toMatch(/Chain intact · 2 links between 4 entries verified/)
    expect(celebrate).toHaveBeenCalledWith("prove-it", expect.anything(), expect.objectContaining({ daily: false, hue: "moss" }))
  })

  it("on a break, says which entry and opens it, with no sparks", async () => {
    items = BROKEN
    const { container } = render(<MyAIActivityCard variant="feed" />)
    await pressProve()
    const banner = container.querySelector("[data-prove-banner=broken]") as HTMLElement
    expect(banner.textContent).toContain("Entry #46 doesn't match the one before it.")
    expect(container.querySelector("[data-chain=broken]")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Show entry" }))
    expect(container.querySelector("[data-feed-evidence]")?.textContent).toContain("#46")
    expect(celebrate).not.toHaveBeenCalled()
  })

  it("never claims compliance", () => {
    for (const f of ["components/ai/MyAIActivityCard.tsx", "components/ai/aiActivityFeedRow.tsx", "components/ai/proveIt.ts"]) {
      const src = readFileSync(join(process.cwd(), f), "utf8").replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "")
      expect(src, f).not.toMatch(/complian(t|ce)/i)
    }
  })
})
