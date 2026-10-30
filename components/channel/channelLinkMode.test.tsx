import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

// A channel opened at an older post from a link (?postId=, from Activity,
// the Inbox, search, Later, Home or an AI citation), driven through the list.
// FE-BUG-8: in a channel already in memory the list kept its latest page, so
// the linked post never showed (and its thread spun). FE-BUG-9: Jump to latest
// kept the link and loaded the linked page again. FE-BUG-12: a channel beside
// a linked one in split view asked for the main view's post as its own.

// The address, as the router keeps it: a change re-renders who reads it.
let address = new URLSearchParams()
const readers = new Set<() => void>()
const goTo = (query: string) => {
  address = new URLSearchParams(query)
  readers.forEach((r) => r())
}
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react")
  return {
    useSearchParams: () => useSyncExternalStore((r) => (readers.add(r), () => void readers.delete(r)), () => address),
  }
})

const asked: string[] = []
const answers: Record<string, unknown> = {}
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    if (url) asked.push(url)
    return { data: answers[url], isLoading: false, isError: undefined, mutate: () => {}, lastRequestStartedAt: 1 }
  },
  // Who is signed in, and a group's people: nobody, here.
  useFetchOnlyOnce: () => ({ data: undefined, isLoading: false, isError: undefined, mutate: () => {} }),
}))
vi.mock("@/components/conversation/ConversationRows", () => ({
  ConversationRows: ({ rows: posts, toLatest: clickedScrollToBottom }: { rows: { post_uuid: string }[]; toLatest: () => void }) => (
    <div>
      <ol aria-label="Messages">{posts.map((p) => <li key={p.post_uuid}>{p.post_uuid}</li>)}</ol>
      <button type="button" onClick={clickedScrollToBottom}>Jump to latest</button>
    </div>
  ),
}))
vi.mock("@/hooks/useMessageResync", () => ({ useMessageResync: () => {} }))
vi.mock("@/components/typingIndicator/typingIndicatorBar", () => ({ ChannelTypingBar: () => null }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))

const CH = "c0ffee00-0000-4000-8000-000000000001"
const BESIDE = "c0ffee00-0000-4000-8000-000000000002"
const OLD = "0ld00000-0000-4000-8000-00000000000a"

const { default: store, RESET_STORE_ACTION } = await import("@/store/store")
const { updateChannelPosts } = await import("@/store/slice/channelSlice")
const { ChannelList } = await import("@/lib/testing/conversationLists")
const { InSplitPaneContext } = await import("@/hooks/useLinkTarget")
const { GetEndpointUrl } = await import("@/services/endPoints")
const { ChatGet } = await import("@/services/endpoints/chat")

const post = (id: string, at: string) => ({ post_uuid: id, post_text: id, post_created_at: at })
const latestOf = (ch: string) => `${GetEndpointUrl.GetChannelLatestPost}/${ch}`
const linkedOf = (ch: string, p: string) => `${ChatGet.GetNewPostIncludingCurrentPost}/${ch}/${p}`
const shown = () => screen.getAllByRole("listitem").map((li) => li.textContent)

beforeEach(() => {
  store.dispatch({ type: RESET_STORE_ACTION })
  address = new URLSearchParams()
  window.history.replaceState(null, "", `/app/channel/${CH}`)
  asked.length = 0
  // The latest page comes newest first; the linked page from the linked post on.
  answers[latestOf(CH)] = { data: { posts: [post("today-2", "2026-10-13T10:00:00Z"), post("today-1", "2026-10-13T09:00:00Z")], has_more: true } }
  answers[linkedOf(CH, OLD)] = { data: { posts: [post(OLD, "2026-10-06T09:00:00Z"), post("old-2", "2026-10-06T09:05:00Z")], has_more: true } }
  answers[latestOf(BESIDE)] = { data: { posts: [post("beside-1", "2026-10-13T08:00:00Z")], has_more: false } }
})
afterEach(cleanup)

const list = (channelId: string) => <Provider store={store}><ChannelList channelId={channelId} /></Provider>

describe("a channel opened at an older post from a link", () => {
  it("shows the linked post when the channel's latest page is already in memory", () => {
    store.dispatch(updateChannelPosts({ channelId: CH, posts: [post("today-1", "2026-10-13T09:00:00Z"), post("today-2", "2026-10-13T10:00:00Z")] } as never))
    address = new URLSearchParams(`postId=${OLD}`)
    render(list(CH))
    expect(shown()).toEqual([OLD, "old-2"])
  })

  it("goes back to the latest page on Jump to latest, leaving the link", () => {
    address = new URLSearchParams(`postId=${OLD}`)
    window.history.replaceState(null, "", `/app/channel/${CH}?postId=${OLD}`)
    const view = render(list(CH))
    expect(shown()).toEqual([OLD, "old-2"])
    fireEvent.click(screen.getByRole("button", { name: "Jump to latest" }))
    expect(window.location.pathname + window.location.search).toBe(`/app/channel/${CH}`)
    // The address without the link, as the router leaves it.
    act(() => goTo(""))
    expect(shown()).toEqual(["today-1", "today-2"])
    view.unmount()
  })
})

describe("a channel beside a linked one in split view", () => {
  it("shows its own latest page, never asking for the main view's post", () => {
    address = new URLSearchParams(`postId=${OLD}`)
    render(
      <Provider store={store}>
        <InSplitPaneContext.Provider value={true}>
          <ChannelList channelId={BESIDE} />
        </InSplitPaneContext.Provider>
      </Provider>,
    )
    expect(asked).not.toContain(linkedOf(BESIDE, OLD))
    expect(asked).toContain(latestOf(BESIDE))
    expect(shown()).toEqual(["beside-1"])
  })
})
