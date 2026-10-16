import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { PostsRes } from "@/types/post"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// QA F-28: the posts page had a header of its own ("Your Posts" in title case
// on a computer), its states in the middle of the screen, and every row said
// "0" beside a speech bubble.

let answer: { data?: unknown; isLoading: boolean; isError?: unknown } = { isLoading: false }
const mutate = vi.fn()
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ ...answer, mutate }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))

const { PostCard } = await import("@/components/posts/PostCard")
const { default: PostsPage } = await import("@/app/app/posts/page")

const post = (over: Partial<PostsRes> = {}): PostsRes =>
  ({
    post_uuid: "p1",
    post_text: "<p>The rollout plan is in the doc.</p>",
    post_created_at: "2026-10-14T09:00:00Z",
    post_by: { user_uuid: "u1", user_name: "Sam Rivera" },
    post_channel: { ch_uuid: "c1", ch_name: "engineering" },
    post_comment_count: 0,
    post_reactions: [],
    ...over,
  }) as unknown as PostsRes

afterEach(cleanup)

describe("a post's row", () => {
  it("has no count line when nobody has replied or reacted", () => {
    const { container } = render(<PostCard post={post()} />)
    expect(container.querySelector("[data-post-counts]")).toBeNull()
    expect(container.textContent).not.toMatch(/\b0\b/)
  })

  it("counts replies and reactions only where there are some, in words for a screen reader", () => {
    const { container, rerender } = render(<PostCard post={post({ post_comment_count: 3 })} />)
    expect(container.querySelector("[data-post-counts]")!.textContent).toBe("3 replies")
    rerender(<PostCard post={post({ post_comment_count: 1, post_reactions: [{}, {}] as PostsRes["post_reactions"] })} />)
    expect(container.querySelector("[data-post-counts]")!.textContent).toBe("1 reply2 reactions")
  })
})

describe("the posts page", () => {
  beforeEach(() => {
    mutate.mockReset()
  })

  it("is titled in sentence case by the shared header", () => {
    answer = { isLoading: false, data: { data: { posts: [], has_more: false } } }
    render(<PostsPage />)
    expect(screen.getByRole("heading", { level: 1, name: "Your posts" })).toBeInTheDocument()
    expect(screen.queryByText("Your Posts")).toBeNull()
  })

  it("says there are none where the rows begin, as the other lists do", () => {
    answer = { isLoading: false, data: { data: { posts: null, has_more: false } } }
    const { container } = render(<PostsPage />)
    expect(screen.getByText("You haven't posted yet")).toBeInTheDocument()
    expect(container.querySelector("[data-posts-state] [data-hub-empty]")).not.toBeNull()
  })

  it("says a failed read failed, with Try again, and not that there are none", () => {
    answer = { isLoading: false, isError: { response: { status: 503 } } }
    render(<PostsPage />)
    expect(screen.getByText("Your posts aren't loading. Nothing has been lost.")).toBeInTheDocument()
    expect(screen.queryByText("You haven't posted yet")).toBeNull()
    screen.getByRole("button", { name: "Try again" }).click()
    expect(mutate).toHaveBeenCalled()
  })
})
