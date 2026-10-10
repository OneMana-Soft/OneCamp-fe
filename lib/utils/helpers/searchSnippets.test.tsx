import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import type { SearchResult } from "@/services/searchService"

let kinds: Record<string, string> | undefined = {}
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => kinds }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))

import { getHighlightedContext, getHighlightedTitle, getTitle } from "@/lib/utils/helpers/search"
import { GlobalSearchGet } from "@/services/searchService"

afterEach(() => {
  cleanup()
  kinds = {}
})

const hit = (partial: Partial<SearchResult>) => partial as SearchResult

describe("search hits on screen", () => {
  it("decode the entities the server stored, even one the highlighter split", () => {
    // The demo's real answer for "39" (10 Oct 2026).
    const r = hit({
      type: "post",
      post: { post_body: "What did you work on today?Check-in for Saturday. Answer in this thread; everyone&#39;s answers are together here.", post_ch_name: "engineering" },
      highlight: { post_body: ["Answer in this thread; everyone&#<mark>39</mark>;s answers are together here."] },
    })
    const { container } = render(<>{getHighlightedTitle(r)}</>)
    expect(container.textContent).toBe("…Answer in this thread; everyone's answers are together here.")
    expect(container.textContent).not.toContain("&#")
    expect(container.querySelectorAll("mark")).toHaveLength(0)
  })

  it("mark what matched, with no ellipsis on a whole message", () => {
    const body = "Does the pricing table still fit on one screen on a phone?"
    const r = hit({ type: "post", post: { post_body: body }, highlight: { post_body: ["Does the <mark>pricing</mark> table still fit on one screen on a phone?"] } })
    const { container } = render(<>{getHighlightedTitle(r)}</>)
    expect(container.textContent).toBe(body)
    expect(container.querySelector("mark")?.textContent).toBe("pricing")
  })

  it("never put a fragment's markup into the page", () => {
    const r = hit({ type: "chat", chat: { chat_body: "x" }, highlight: { chat_body: ['<img src=x onerror="alert(1)"><mark>launch</mark><script>alert(2)</script>'] } })
    const { container } = render(<>{getHighlightedTitle(r)}</>)
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("script")).toBeNull()
    expect(container.querySelector("mark")?.textContent).toBe("launch")
  })

  it("show a plain title decoded when nothing in it matched", () => {
    expect(getTitle(hit({ type: "post", post: { post_body: "Q&amp;A at 3, don&#39;t miss it" } }))).toBe("Q&A at 3, don't miss it")
    expect(getTitle(hit({ type: "attachment", attachment: { attachment_file_name: "launch-plan.pdf" } }))).toBe("launch-plan.pdf")
  })

  it("give a doc's passages ellipses only where they were cut", () => {
    const r = hit({
      type: "doc",
      doc: { doc_title: "Q4 launch plan", doc_created_by_user_full_name: "Sam Rivera" },
      highlight: {
        doc_title: ["Q4 <mark>launch</mark> plan"],
        doc_body: ["We <mark>launch</mark> on the last Tuesday of the month.", "onboarding: Maya Walkthrough and checklist: Jonas Risks The pilot's SAML certificate expires the week before <mark>launch</mark>"],
      },
    })
    const { container } = render(<>{getHighlightedContext(r)}</>)
    expect(container.textContent).toBe(
      "Doc by Sam RiveraWe launch on the last Tuesday of the month. …onboarding: Maya Walkthrough and checklist: Jonas Risks The pilot's SAML certificate expires the week before launch…",
    )
  })

  it("say where a task is without inventing an assignee", () => {
    const { container } = render(<>{getHighlightedContext(hit({ type: "task", task: { task_name: "Pick the launch date", task_project_name: "Q4 launch" } }))}</>)
    expect(container.textContent).toBe("Q4 launch")
    expect(container.textContent).not.toContain("undefined")
  })
})

describe("the search request", () => {
  it("encodes what was typed, so a # or a / is part of the query", () => {
    expect(GlobalSearchGet("#engineering")).toBe("/search/unifiedSearch/%23engineering")
    expect(GlobalSearchGet("a/b")).toBe("/search/unifiedSearch/a%2Fb")
    expect(GlobalSearchGet("50% ")).toBe("/search/unifiedSearch/50%25")
    expect(GlobalSearchGet("what?")).toBe("/search/unifiedSearch/what%3F")
  })
})
