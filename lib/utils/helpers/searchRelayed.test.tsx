import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

const KINDS: Record<string, string> = { guests: "guest", slack: "bridge" }
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => KINDS }))

const { getContext, getHighlightedTitle } = await import("@/lib/utils/helpers/search")

const shown = (node: React.ReactNode) => {
  const text = render(<>{node}</>).container.textContent
  cleanup()
  return text
}

// Search indexes a guest's message as the Guests bot's, with its label in the
// text: a hit read "[Priya (Acme) (guest)]Looks good", and a reply "Comment
// by Guests".
describe("a search hit a guest or Slack person wrote", () => {
  afterEach(cleanup)

  it("reads as theirs", () => {
    const post = { type: "post", post: { post_body: "[Priya (Acme) (guest)]Looks good", post_by_user_id: "guests", post_ch_name: "acme" } }
    expect(shown(getHighlightedTitle(post as never))).toBe("Priya (Acme): Looks good")
    expect(shown(getContext(post as never))).toBe("#acme · Priya (Acme)")

    const reply = { type: "comment", comment: { comment_body: "[Ana Ruiz]On it", comment_by_user_id: "slack", comment_by_user_full_name: "Slack" } }
    expect(shown(getHighlightedTitle(reply as never))).toBe("Ana Ruiz: On it")
    expect(shown(getContext(reply as never))).toBe("Reply by Ana Ruiz")
  })

  it("keeps the highlight on what they wrote", () => {
    const hit = {
      type: "post",
      post: { post_body: "[Priya (Acme) (guest)]Looks good", post_by_user_id: "guests" },
      highlight: { post_body: ["[<em>Priya</em> (Acme) (guest)]<em>Looks</em> good"] },
    }
    const { container } = render(<>{getHighlightedTitle(hit as never)}</>)
    expect(container.textContent).toBe("Priya (Acme): Looks good")
    // The search page marks a hit with <mark>, whatever tag the server used.
    expect(container.querySelector("mark")?.textContent).toBe("Looks")
  })

  it("leaves anyone else's hit as it was", () => {
    const hit = { type: "post", post: { post_body: "[note] ship it", post_by_user_id: "u1", post_ch_name: "eng" } }
    expect(shown(getHighlightedTitle(hit as never))).toBe("[note] ship it")
  })
})
