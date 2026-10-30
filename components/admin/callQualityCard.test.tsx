import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"

// The days below are dates: the tests run on a clock they set.
pinTestClock(new Date("2026-10-22T09:30:00Z"))

// How the workspace's calls went (calls A5, #56; zoom-17's "shown per
// install"): Admin › Health and updates, from the server's rolled-up days.
let answer: { data?: { data?: unknown[] }; isError?: unknown } = {}
const urls: string[] = []
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    urls.push(url)
    return answer
  },
}))

import CallQualityCard, { summarizeDays } from "./CallQualityCard"

const day = (o: Partial<Record<string, number>>) => ({ day: "2026-10-20", calls: 0, people: 0, samples: 0, rtt_p50_ms: 0, rtt_p95_ms: 0, loss_p95_pct: 0, freeze_share: 0, cpu_share: 0, network_share: 0, ...o })

afterEach(() => {
  cleanup()
  answer = {}
  urls.length = 0
})

describe("the install's calls, summed", () => {
  it("adds up calls and people, and weighs each day's shares and round trip by its samples", () => {
    const s = summarizeDays([
      day({ calls: 3, people: 9, samples: 300, rtt_p50_ms: 60, network_share: 0.1, cpu_share: 0, freeze_share: 0.02 }),
      day({ calls: 1, people: 2, samples: 100, rtt_p50_ms: 140, network_share: 0.5, cpu_share: 0.2, freeze_share: 0 }),
      day({}),
    ] as never)
    expect(s).toEqual({ calls: 4, people: 11, samples: 400, rttMs: 80, network: 0.2, cpu: 0.05, freeze: 0.015 })
    expect(summarizeDays([])).toBeNull()
    expect(summarizeDays([day({})] as never)).toBeNull()
  })
})

describe("the call quality card", () => {
  it("shows the last 30 days as figures, each named in words", () => {
    answer = { data: { data: [day({ calls: 4, people: 11, samples: 400, rtt_p50_ms: 80, network_share: 0.2, cpu_share: 0.003, freeze_share: 0.015 })] } }
    render(<CallQualityCard />)
    expect(urls[0]).toBe("/calls/quality/days?days=30")
    expect(screen.getByRole("heading", { name: "Call quality" })).toBeInTheDocument()
    const tile = (label: string) => screen.getByText(label).closest("[data-stat-tile]")!.querySelector("[data-stat-value]")!.textContent
    expect(tile("Calls")).toBe("4")
    expect(tile("Typical round trip")).toBe("80 ms")
    expect(tile("Held back by the network")).toBe("20%")
    // A sliver of a share says so (the shared formatter's rule).
    expect(tile("Held back by a computer")).toBe("<1%")
    expect(tile("Video froze")).toBe("2%")
    expect(screen.getByText(/11 people/)).toBeInTheDocument()
  })

  it("says so when there were no calls, and when it couldn't read them", () => {
    answer = { data: { data: [] } }
    render(<CallQualityCard />)
    expect(screen.getByText(/No calls in the last 30 days/)).toBeInTheDocument()
    cleanup()
    answer = { isError: new Error("down") }
    render(<CallQualityCard />)
    expect(screen.getByText(/couldn't read/)).toBeInTheDocument()
  })
})
