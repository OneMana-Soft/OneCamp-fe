import { describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"

vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => ({}) }))
import { getHighlightedTitle, getTitle } from "@/lib/utils/helpers/search"
import type { SearchResult } from "@/services/searchService"

// STEP4 #8: typing a key into search offers the task first (the server puts
// it there), labelled "Q4-12 · the task's title"; every task hit with a key
// reads that way.
const hit = (task: Record<string, unknown>, highlight?: Record<string, string[]>) => ({ type: "task", task, highlight }) as unknown as SearchResult

describe("a task hit's title", () => {
  it("leads with its key", () => {
    expect(getTitle(hit({ task_id: "t", task_name: "Pricing page copy", task_key: "Q4-12" }))).toBe("Q4-12 · Pricing page copy")
    expect(getTitle(hit({ task_id: "t", task_name: "Pricing page copy" }))).toBe("Pricing page copy")
  })

  it("leads with its key when the title matched too", () => {
    const { container } = render(<>{getHighlightedTitle(hit({ task_id: "t", task_name: "Pricing page copy", task_key: "Q4-12" }, { task_name: ["<em>Pricing</em> page copy"] }))}</>)
    expect(container.textContent).toBe("Q4-12 · Pricing page copy")
  })
})
