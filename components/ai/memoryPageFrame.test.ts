import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

// /app/ai/memory in the final visual check (10 Oct): its list on its header's
// column, its states and skeleton in the list's frame, kinds in camp hues, and
// its words in the app's style. QA_BACKLOG "Tab consistency": AI memory.
const src = readFileSync(resolve(__dirname, "WorkspaceMemoryPanel.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "")

describe("the workspace memory page", () => {
  it("starts its list on the header's edge, not in a centred column", () => {
    expect(src).not.toMatch(/max-w-3xl mx-auto/)
    expect(src).toMatch(/<ul className="space-y-1\.5 max-w-3xl -mx-3">/)
  })

  it("says a failed load in the list, with a retry, and clears the last status's rows", () => {
    expect(src).toMatch(/setItems\(\[\]\)\s*setLoadFailed\(true\)/)
    expect(src).toMatch(/loadFailed \? \(\s*<div[^>]*>\s*<ErrorState subject="workspace memory" onRetry/)
    expect(src).not.toMatch(/Couldn't load workspace memory/)
  })

  it("loads in a row's frame and line boxes", () => {
    expect(src).toMatch(/data-memory-skeleton-row="" className="rounded-lg border border-transparent px-3 py-2\.5/)
    expect(src).toMatch(/h-\[19px\][\s\S]{0,200}mt-1 h-\[18px\]/)
  })

  it("draws kinds in camp hues and keeps the accent and raw colours out", () => {
    // A link may turn orange on hover; nothing else here is the accent.
    expect(src).not.toMatch(/violet-|blue-500|slate-|bg-primary\/10|(?<!hover:)text-primary/)
    expect(src).toMatch(/dot: "bg-camp-dusk"/)
  })

  it("writes in the app's style: sentence case, one #, full muted ink, the app's times", () => {
    expect(src).toContain('"Workspace memory"')
    expect(src).not.toMatch(/Workspace Memory|italic|text-muted-foreground\/(50|60|70|80)/)
    expect(src).toMatch(/backlink\.Icon === Hash \? backlink\.label/)
    expect(src).not.toMatch(/toLocaleDateString/)
  })
})
