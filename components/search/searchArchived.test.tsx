import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import type { SearchResult } from "@/services/searchService"

// An archived channel's history stays in its members' search, and a hit from
// it says Archived (SN-BUG-9): the server marks its posts, replies and files.

vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => undefined }))

const { SearchResultRow, inArchivedChannel } = await import("./searchResultRow")

afterEach(cleanup)

const post = (extra: Record<string, unknown>) => ({ type: "post", post: { post_id: "p1", post_body: "the rollout checklist", post_ch_name: "launch", ...extra } }) as unknown as SearchResult

describe("a hit from an archived channel", () => {
  it("is known by its mark, on a post, a reply or a file", () => {
    expect(inArchivedChannel(post({ channel_archived: true }))).toBe(true)
    expect(inArchivedChannel(post({}))).toBe(false)
    expect(inArchivedChannel({ type: "comment", comment: { comment_id: "c", channel_archived: true } } as unknown as SearchResult)).toBe(true)
    expect(inArchivedChannel({ type: "attachment", attachment: { attachment_id: "a", channel_archived: true } } as unknown as SearchResult)).toBe(true)
  })

  it("says Archived in its row, and a live one doesn't", () => {
    const { container, rerender } = render(<ul><SearchResultRow result={post({ channel_archived: true })} onOpen={vi.fn()} /></ul>)
    expect(container.querySelector("[data-search-archived]")?.textContent).toBe("Archived")
    rerender(<ul><SearchResultRow result={post({})} onOpen={vi.fn()} /></ul>)
    expect(container.querySelector("[data-search-archived]")).toBeNull()
  })
})
