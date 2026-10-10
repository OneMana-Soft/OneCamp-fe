import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Profiler } from "react"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import type { SearchResult } from "@/services/searchService"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { hueFor } from "@/lib/campHue"

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

  // Each kind had one raw Tailwind colour (every task blue, every channel
  // orange): the kind said twice, and nothing about which one it was.
  it("marks a place in its own identity hue", () => {
    const input = open()
    type(input, "eng")
    const row = within(group("Jump to")!).getByText("engineering").closest("[cmdk-item]")!
    expect(row.querySelector("[data-hue]")?.getAttribute("data-hue")).toBe(hueFor("c1"))
  })

  it("names no raw Tailwind hue for a kind", () => {
    const src = readFileSync(resolve(__dirname, "CommandPalette.tsx"), "utf8")
    expect(src).not.toMatch(/text-(blue|orange|cyan|purple|pink)-\d{3}/)
  })

  it("gives Boards the board glyph, not the page glyph Docs has", () => {
    open()
    const row = (label: string) => within(group("Navigate")!).getByText(label).closest("[cmdk-item]")!
    expect(row("Boards").querySelector("svg")?.getAttribute("class")).toMatch(/lucide-layout-dashboard/)
    expect(row("Docs").querySelector("svg")?.getAttribute("class")).toMatch(/lucide-file-text/)
  })

  // Typed whole, "Docs" sat under two tasks that only mention docs, and the
  // row the keyboard was on was halfway down the list.
  it("puts a command the query names above what the search found in the text", () => {
    answer = [
      { type: "task", task: { task_id: "t1", task_name: "Record the walkthrough for the docs site", task_project_name: "Q4 launch" } },
      { type: "task", task: { task_id: "t2", task_name: "Write the API docs", task_project_name: "Q4 launch" } },
    ] as SearchResult[]
    const input = open()
    type(input, "docs")
    const headings = [...document.querySelectorAll("[cmdk-group-heading]")].map((h) => h.textContent)
    expect(headings.indexOf("Commands")).toBeGreaterThanOrEqual(0)
    expect(headings.indexOf("Commands")).toBeLessThan(headings.indexOf("Messages, docs and tasks"))
    expect(document.querySelector("[cmdk-item]")?.textContent).toMatch(/^Docs/)
  })

  it("keeps a command the query only brushes, by a keyword, under the search's hits", () => {
    answer = [{ type: "task", task: { task_id: "t3", task_name: "Move the wiki pages", task_project_name: "Q4 launch" } }] as SearchResult[]
    const input = open()
    type(input, "wiki")
    const headings = [...document.querySelectorAll("[cmdk-group-heading]")].map((h) => h.textContent)
    expect(headings.indexOf("Messages, docs and tasks")).toBeGreaterThanOrEqual(0)
    expect(headings.indexOf("Messages, docs and tasks")).toBeLessThan(headings.indexOf("Commands"))
  })

  // Centred, the dialog moved with every change in the list's length: the
  // field being typed in jumped between the empty palette and a short answer.
  it("hangs from a fixed height rather than the middle of the window", () => {
    open()
    const dialog = document.querySelector("[data-command-dialog]") as HTMLElement
    expect(dialog.className).toMatch(/\btop-\[\d+dvh\]/)
    expect(dialog.className).toMatch(/\btranslate-y-0\b/)
    expect(dialog.className).not.toMatch(/top-\[50%\]|translate-y-\[-50%\]/)
  })

  it("doesn't list a place twice, once to jump to and once as a hit", () => {
    answer = [
      { type: "project", project: { project_id: "p1", project_name: "Q4 launch" }, highlight: { project_name: ["Q4 <mark>launch</mark>"] } },
      { type: "task", task: { task_id: "t1", task_name: "Write the launch announcement", task_project_id: "p1" } },
    ] as SearchResult[]
    const input = open()
    type(input, "q4 launch")
    expect(within(group("Jump to")!).getByText("Q4 launch")).toBeTruthy()
    const hits = group("Messages, docs and tasks")!
    expect(within(hits).getAllByRole("option")).toHaveLength(1)
    expect(within(hits).queryByText("Q4 launch")).toBeNull()
  })
})
