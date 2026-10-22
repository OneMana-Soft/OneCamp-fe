import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import type { SearchResult } from "@/services/searchService"

// A message found in a DM or a group opens there, at its thread, from the
// palette: it went to /app/chat/<message id> on a click, and its row and
// recent item to /app/chat/<its author> (SA-BUG-1).

const push = vi.fn()
const dispatched = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }), usePathname: () => "/app/home" }))

const state = {
  users: { userSidebar: { userChannels: [], userChats: [], userProjects: [], userTeams: [], userDocs: [], userBoards: [] } },
  recentItems: { items: [] },
}
vi.mock("react-redux", () => ({
  useSelector: (select: (s: typeof state) => unknown) => select(state),
  useDispatch: () => dispatched,
}))

let answer: SearchResult[] = []
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    if (url.startsWith("/search/unifiedSearch/")) return { data: { data: { page: answer } }, isLoading: false }
    return { data: { data: { user_uuid: "me", user_is_admin: false } }, isLoading: false }
  },
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }),
}))
vi.mock("@/hooks/useDebounce", () => ({ useDebounce: <T,>(v: T) => v }))
vi.mock("@/hooks/useCapabilities", () => ({ useCapabilities: () => ({ can: () => false }) }))
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useClientConfig: () => ({ features: {} }),
}))
vi.mock("@/hooks/usePauseNotifications", () => ({ usePauseNotifications: () => ({ pause: vi.fn(), resume: vi.fn() }) }))
vi.mock("@/hooks/useTrackPageVisit", () => ({ useTrackPageVisit: () => {} }))
vi.mock("@/hooks/useSplitView", () => ({ useSplitActions: () => () => {} }))
vi.mock("@/components/shortcuts/ShortcutsDialog", () => ({ openShortcuts: () => {} }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => ({}) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))

import { CommandPalette } from "@/components/ui/CommandPalette"

beforeEach(() => {
  answer = []
  push.mockClear()
  dispatched.mockClear()
})
afterEach(cleanup)

const search = (text: string) => {
  render(<CommandPalette />)
  act(() => {
    fireEvent.keyDown(document, { key: "k", ctrlKey: true })
  })
  const input = document.querySelector("[cmdk-input]") as HTMLInputElement
  for (let i = 1; i <= text.length; i++) {
    act(() => {
      fireEvent.change(input, { target: { value: text.slice(0, i) } })
    })
  }
}
const hitRow = (text: string) =>
  [...document.querySelectorAll("[cmdk-item]")].find((r) => r.textContent?.includes(text)) as HTMLElement | undefined
const recentPaths = () =>
  dispatched.mock.calls.map(([a]) => a?.payload?.path).filter((p): p is string => typeof p === "string")

describe("a message hit in the palette", () => {
  it("opens a DM message in the conversation with the other person, at its thread", () => {
    answer = [{ type: "chat", chat: { chat_id: "m1", chat_grp_id: "maya me", chat_by_user_id: "me", chat_body: "the deck is ready", chat_by_user_full_name: "Me" } }] as SearchResult[]
    search("deck")
    const row = hitRow("the deck is ready")
    expect(row?.getAttribute("data-href")).toBe("/app/chat/maya/m1")
    fireEvent.click(row!)
    expect(push).toHaveBeenCalledWith("/app/chat/maya/m1")
    expect(recentPaths()).toEqual(["/app/chat/maya/m1"])
  })

  it("opens a group message in the group, not a DM with its author", () => {
    answer = [{ type: "chat", chat: { chat_id: "m2", chat_grp_id: "g1", chat_by_user_id: "maya", chat_body: "launch notes", chat_by_user_full_name: "Maya" } }] as SearchResult[]
    search("launch")
    const row = hitRow("launch notes")
    expect(row?.getAttribute("data-href")).toBe("/app/chat/group/g1/m2")
    fireEvent.click(row!)
    expect(push).toHaveBeenCalledWith("/app/chat/group/g1/m2")
    expect(recentPaths()).toEqual(["/app/chat/group/g1/m2"])
  })
})
