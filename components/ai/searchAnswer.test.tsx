import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen, fireEvent } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/** The AI answer on the search page (hub.md S11). */
let answer: unknown = null
let fail = false
vi.mock("@/services/aiSearchService", async (orig) => ({
  ...(await orig<typeof import("@/services/aiSearchService")>()),
  unifiedSearchAnswer: vi.fn(async () => {
    if (fail) throw new Error("500")
    return answer
  }),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/hooks/useClientConfig", async (orig) => ({ ...(await orig<typeof import("@/hooks/useClientConfig")>()), useFeature: () => true, useAIAvailable: () => true }))

const { default: SearchAnswer, splitByCitations } = await import("@/components/ai/SearchAnswer")

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  answer = null
  fail = false
})

async function settle() {
  await act(async () => {
    vi.advanceTimersByTime(600)
  })
  await act(async () => {})
}

const CITED = {
  enabled: true,
  query: "launch",
  answer: "The launch is the last Tuesday [1], and the load test is the one red item [2].",
  citations: [
    { index: 1, source: "workspace", title: "Q4 launch plan", doc_uuid: "d1", kind: "doc" },
    { index: 2, source: "workspace", title: "Release candidate", post_uuid: "p1", channel_uuid: "c1", kind: "post" },
  ],
}

describe("the AI answer card", () => {
  it("maps every citation number to a rendered chip, and lights the chip from its marker", async () => {
    vi.useFakeTimers()
    answer = CITED
    render(<SearchAnswer query="launch" resultCount={17} />)
    await settle()
    const markers = [...document.querySelectorAll("[data-citation-marker]")].map((m) => m.getAttribute("data-citation-marker"))
    const chips = [...document.querySelectorAll("[data-citation-chip]")].map((c) => c.getAttribute("data-citation-chip"))
    expect(markers).toEqual(["1", "2"])
    for (const m of markers) expect(chips).toContain(m)
    fireEvent.mouseEnter(document.querySelector('[data-citation-marker="2"]')!)
    expect(document.querySelector('[data-citation-chip="2"]')!.hasAttribute("data-lit")).toBe(true)
    expect(screen.getByText(/from 2 results you can open/)).toBeTruthy()
  })

  it("says one honest line when it found no clear answer, never an invented one", async () => {
    vi.useFakeTimers()
    answer = { enabled: true, query: "x", answer: "", citations: [], note: "no sources" }
    render(<SearchAnswer query="launch" />)
    await settle()
    expect(document.querySelector("[data-search-answer=none]")!.textContent).toBe("No clear answer in what you can see.")
  })

  it("says the answer is unavailable when the request fails", async () => {
    vi.useFakeTimers()
    fail = true
    render(<SearchAnswer query="launch" />)
    await settle()
    expect(screen.getByText("AI answer unavailable")).toBeTruthy()
  })

  it("has the agent gradient as its one top edge", async () => {
    vi.useFakeTimers()
    answer = CITED
    render(<SearchAnswer query="launch" />)
    await settle()
    expect(document.querySelector("[data-search-answer=card]")!.className).toContain("hub-agent-edge")
    const css = readFileSync(join(process.cwd(), "app/hub.css"), "utf8")
    const edge = css.slice(css.indexOf(".hub-agent-edge::before"), css.indexOf("}", css.indexOf(".hub-agent-edge::before")))
    expect(edge).toMatch(/linear-gradient\(90deg, var\(--agent-a1\), var\(--agent-a2\)\)/)
  })

  it("splits the answer at its markers, numbering only known sources", () => {
    expect(splitByCitations("a [1] b [9]", new Set([1]))).toEqual([{ text: "a " }, { cite: 1 }, { text: " b [9]" }])
  })
})
