import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Profiler } from "react"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import type { SearchResult } from "@/services/searchService"

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }), usePathname: () => "/app/home" }))

const state = {
  users: {
    userSidebar: {
      userChannels: [
        { ch_uuid: "c1", ch_name: "engineering", ch_private: false },
        { ch_uuid: "c2", ch_name: "design", ch_private: false },
      ],
      userChats: [],
      userProjects: [{ uid: "", project_uuid: "p1", project_name: "Q4 launch" }],
      userTeams: [],
      userDocs: [],
      userBoards: [],
    },
  },
  recentItems: { items: [] },
}
vi.mock("react-redux", () => ({
  useSelector: (select: (s: typeof state) => unknown) => select(state),
  useDispatch: () => vi.fn(),
}))

let answer: SearchResult[] = []
const asked: string[] = []
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    if (url) asked.push(url)
    if (url.startsWith("/search/unifiedSearch/")) return { data: { data: { page: answer } }, isLoading: false }
    return { data: { data: { user_uuid: "me", user_is_admin: false } }, isLoading: false }
  },
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }),
}))
// The search waits for a pause in typing; here every key is the pause.
vi.mock("@/hooks/useDebounce", () => ({ useDebounce: <T,>(v: T) => v }))
vi.mock("@/services/aiSearchService", () => ({
  unifiedSearch: vi.fn(async () => ({ enabled: false, groups: [] })),
  isAbortedRequest: () => false,
}))
vi.mock("@/hooks/useCapabilities", () => ({ useCapabilities: () => ({ can: () => false }) }))
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useClientConfig: () => ({ features: {} }),
}))
vi.mock("@/hooks/useTrackPageVisit", () => ({ useTrackPageVisit: () => {} }))
vi.mock("@/hooks/useSplitView", () => ({ useSplitActions: () => () => {} }))
vi.mock("@/components/shortcuts/ShortcutsDialog", () => ({ openShortcuts: () => {} }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => ({}) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))

import { CommandPalette } from "@/components/ui/CommandPalette"

beforeEach(() => {
  answer = []
  asked.length = 0
  push.mockClear()
})
afterEach(cleanup)

const open = (mount = true) => {
  if (mount) render(<CommandPalette />)
  act(() => {
    fireEvent.keyDown(document, { key: "k", ctrlKey: true })
  })
  return document.querySelector("[cmdk-input]") as HTMLInputElement
}
const type = (input: HTMLInputElement, text: string) => {
  for (let i = 1; i <= text.length; i++) {
    act(() => {
      fireEvent.change(input, { target: { value: text.slice(0, i) } })
    })
  }
}
const group = (heading: string) => {
  const el = [...document.querySelectorAll("[cmdk-group]")].find((g) => g.querySelector("[cmdk-group-heading]")?.textContent === heading)
  return el as HTMLElement | undefined
}

describe("the command palette", () => {
  it("shows every hit the search sends, matched in the title or not", () => {
    // The server matched these on their author; cmdk used to score them again
    // against the first 60 characters of the title and drop them.
    answer = [
      { type: "post", post: { post_id: "a", post_body: "Lunch at noon", post_ch_name: "design", post_by_user_full_name: "Zed" } },
      { type: "chat", chat: { chat_id: "b", chat_body: "See you then", chat_by_user_full_name: "Zed" } },
      { type: "task", task: { task_id: "c", task_name: "Book the room", task_project_name: "Q4 launch" } },
    ] as SearchResult[]
    const input = open()
    type(input, "zed")
    const hits = group("Messages, docs and tasks")
    expect(hits).toBeDefined()
    expect(within(hits!).getAllByRole("option")).toHaveLength(3)
  })

  it("finds a channel from the sidebar on the first keys, before any answer", () => {
    const input = open()
    type(input, "en")
    const jump = group("Jump to")
    expect(jump && within(jump).getByText("engineering")).toBeTruthy()
    fireEvent.click(within(jump!).getByText("engineering"))
    expect(push).toHaveBeenCalledWith("/app/channel/c1")
  })

  it("offers the full search for what was typed", () => {
    const input = open()
    type(input, "q4 plan")
    fireEvent.click(screen.getByText("Search everything for “q4 plan”"))
    expect(push).toHaveBeenCalledWith("/app/search?query=q4%20plan")
  })

  it("takes Home to Home", () => {
    open()
    fireEvent.click(screen.getByText("Home"))
    expect(push).toHaveBeenCalledWith("/app/home")
  })

  it("renders no more than it must while typing", () => {
    let commits = 0
    render(
      <Profiler id="palette" onRender={() => commits++}>
        <CommandPalette />
      </Profiler>,
    )
    const input = open(false)
    commits = 0
    type(input, "launch")
    // About two and a half commits a key: ours, then cmdk's own selection and
    // item bookkeeping. A second copy of the query, kept in step by an effect,
    // took the palette to 19 for these six keys.
    expect(commits).toBeLessThanOrEqual(15)
  })
})
