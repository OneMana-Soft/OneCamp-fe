import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"

// An answer's chart is a chunk of its own (MarkdownMessage's lazy parts, 17 Oct
// 2026). Its code is fetched as soon as the answer opens a ```chart fence, so it
// is usually in by the time the numbers have streamed and the chart is drawn at
// once; a chart that can't load says so in its own place, and the rest of the
// answer stays. With next/dynamic, a chart that couldn't load threw to the
// page's error boundary and took the page with it.

const SPEC = JSON.stringify({ type: "bar", title: "Open tickets", labels: ["Mon", "Tue"], series: [{ name: "Open", values: [3, 5] }] })
const OPENING = 'Open tickets by day.\n```chart\n{"type": "bar", "title": "Open'
const WHOLE = `Open tickets by day.\n\`\`\`chart\n${SPEC}\n\`\`\`\nThey rose.`

const FakeChart = ({ chart }: { chart: { title?: string } }) => <svg role="img" aria-label={chart.title} />

/** MarkdownMessage with its lazy parts as new, under this test's mock of the chart. */
async function freshMarkdown() {
  vi.resetModules()
  return (await import("@/components/ai/MarkdownMessage")).default
}

afterEach(() => {
  cleanup()
  vi.doUnmock("@/components/charts/SvgChart")
  vi.restoreAllMocks()
})

describe("an answer's chart", () => {
  it("is fetched as soon as its fence opens, and drawn at once when the fence closes", async () => {
    const fetched = vi.fn()
    vi.doMock("@/components/charts/SvgChart", () => {
      fetched()
      return { default: FakeChart }
    })
    const MarkdownMessage = await freshMarkdown()
    const view = render(<MarkdownMessage content={OPENING} />)
    await act(async () => {})
    expect(fetched).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("img")).toBeNull()

    view.rerender(<MarkdownMessage content={WHOLE} />)
    // No placeholder frame: the code was already in.
    expect(screen.getByRole("img", { name: "Open tickets" })).toBeTruthy()
    expect(view.container.querySelector("[data-block-room]")).toBeNull()
  })

  it("that can't load says so in its own place, with Try again, and the rest of the answer stays", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.doMock("@/components/charts/SvgChart", () => {
      throw new Error("Loading chunk 812 failed")
    })
    const MarkdownMessage = await freshMarkdown()
    const view = render(<MarkdownMessage content={WHOLE} />)
    await act(async () => {})
    expect(view.container.querySelector("[data-block-failed]")?.textContent).toMatch(/Couldn't show this chart\. Check your connection, then try again\./)
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy()
    expect(view.container.textContent).toContain("Open tickets by day.")
    expect(view.container.textContent).toContain("They rose.")
    expect(view.container.textContent).not.toContain("```")
  })
})
