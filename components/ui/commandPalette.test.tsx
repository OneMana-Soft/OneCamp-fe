import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Profiler } from "react"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import type { SearchResult } from "@/services/searchService"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { hueFor } from "@/lib/campHue"

const push = vi.fn()
const dispatched = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }), usePathname: () => "/app/home" }))

const state = {
  users: {
    userSidebar: {
      userChannels: [
        { ch_uuid: "c1", ch_name: "engineering", ch_private: false },
        { ch_uuid: "c2", ch_name: "design", ch_private: false },
        { ch_uuid: "chan-war-room", ch_name: "war-room", ch_private: false },
      ],
      userChats: [],
      userProjects: [{ uid: "", project_uuid: "p1", project_name: "Q4 launch" }],
      userTeams: [],
      userDocs: [],
      userBoards: [],
    },
  },
  recentItems: { items: [] as { id: string; type: string; title: string; path: string; timestamp: number }[] },
}
vi.mock("react-redux", () => ({
  useSelector: (select: (s: typeof state) => unknown) => select(state),
  useDispatch: () => dispatched,
}))

let answer: SearchResult[] = []
let searchFails = false
const asked: string[] = []
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    if (url) asked.push(url)
    if (url.startsWith("/search/unifiedSearch/") && searchFails) return { data: undefined, isError: Object.assign(new Error("Request failed with status code 500"), { response: { status: 500 } }), isLoading: false }
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
let features: Record<string, boolean> = {}
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useClientConfig: () => ({ features }),
}))
// The Ask view is AI-only and tested on its own (paletteAsk.test.tsx).
vi.mock("@/components/ai/PaletteAsk", () => ({
  default: (p: { query: string; askNonce: number; continueNonce: number }) => (
    <div data-testid="ask-view">{`ask:${p.query}:${p.askNonce}:${p.continueNonce}`}</div>
  ),
}))
vi.mock("@/hooks/usePauseNotifications", () => ({ usePauseNotifications: () => ({ pause: vi.fn(), resume: vi.fn() }) }))
vi.mock("@/hooks/useSplitView", () => ({ useSplitActions: () => () => {} }))
vi.mock("@/components/shortcuts/ShortcutsDialog", () => ({ openShortcuts: () => {} }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => ({}) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))

import { CommandPalette, closestName, commandKeys } from "@/components/ui/CommandPalette"
import { pauseEndsLine, pausePresets } from "@/lib/notifications/pause"
import { openPalette, onPaletteState } from "@/lib/ui/palette"
import { FEATURE_AI } from "@/hooks/useClientConfig"
import { GO_KEYS } from "@/lib/goKeys"

beforeEach(() => {
  answer = []
  searchFails = false
  features = {}
  state.recentItems.items = []
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
/** The row in a group whose text contains `text` (matches are split by <mark>). */
const row = (g: HTMLElement | undefined, text: string) =>
  [...(g?.querySelectorAll("[cmdk-item]") ?? [])].find((r) => r.textContent?.includes(text)) as HTMLElement | undefined
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

  // Only places carry hue (DESIGN_V3 §3.5, D13). Hits came on the search
  // page's hue tiles: a task sat on a sun square under the ink-3 docs and
  // boards of Jump to. A message is its kind's ink-3 glyph, and a task its
  // status glyph, as the search page, Recent and Home draw it (the one mark,
  // components/ui/graphics/placeMark).
  it("marks a message hit with its kind's ink-3 glyph and a task hit with its status glyph, never a hue tile", () => {
    answer = [
      { type: "post", post: { post_id: "a", post_body: "Lunch at noon", post_ch_name: "design", post_by_user_full_name: "Zed" } },
      { type: "task", task: { task_id: "c", task_name: "Book the room", task_project_name: "Q4 launch", task_status: "inProgress" } },
    ] as SearchResult[]
    const input = open()
    type(input, "zed")
    const [message, task] = within(group("Messages, docs and tasks")!).getAllByRole("option").map((o) => o.querySelector(".palette-mark")!)
    for (const mark of [message, task]) expect(mark.querySelector("[data-hue]")).toBeNull()
    expect(message.querySelector("svg")?.getAttribute("class")).toMatch(/text-ink-3/)
    expect(task.querySelector("[data-status-glyph]")?.getAttribute("data-status-glyph")).toBe("progress")
  })

  // A touch screen with no keyboard hides what the keys do (mobile T5).
  it("marks its key hints so a touch screen with no keyboard drops them", () => {
    const input = open()
    type(input, "launch")
    const footer = document.querySelector(".palette-footer")
    expect(footer?.hasAttribute("data-kbd-hint")).toBe(true)
    for (const enter of document.querySelectorAll(".palette-enter")) expect(enter.hasAttribute("data-kbd-hint")).toBe(true)
  })

  it("finds a channel from the sidebar on the first keys, before any answer", () => {
    const input = open()
    type(input, "en")
    const jump = group("Jump to")
    const hit = row(jump, "engineering")
    expect(hit).toBeTruthy()
    fireEvent.click(hit!)
    expect(push).toHaveBeenCalledWith("/app/channel/c1")
  })

  it("offers the full search for what was typed", () => {
    const input = open()
    type(input, "launch")
    fireEvent.click(screen.getByText("Search everything for “launch”"))
    expect(push).toHaveBeenCalledWith("/app/search?query=launch")
  })

  it("says plainly when nothing matched, and still offers the full search", () => {
    const input = open()
    type(input, "qz plan")
    expect(screen.getByText("Nothing called “qz plan”")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Search messages" }))
    expect(push).toHaveBeenCalledWith("/app/search?query=qz%20plan")
  })

  // QA DSA-04 (14 Oct 2026): a failed search must not read as "nothing called".
  it("says a failed search failed, with Try again, never that nothing is called that", () => {
    searchFails = true
    const input = open()
    type(input, "qz plan")
    expect(screen.queryByText("Nothing called “qz plan”")).toBeNull()
    expect(screen.getByText("Couldn't search just now")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy()
  })

  it("takes Settings straight to your profile on a computer, where the settings nav is the index", () => {
    // /app/settings on a computer draws nothing and moves on to the profile:
    // two moves for one press (fluid-14).
    const input = open()
    type(input, "settings")
    fireEvent.click(row(group("Commands"), "Settings")!)
    expect(push).toHaveBeenCalledWith("/app/settings/profile")
  })

  it("takes Home to Home, once typed", () => {
    const input = open()
    type(input, "home")
    fireEvent.click(row(group("Commands"), "Home")!)
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

  // Colour is a noun (design v3): a project carries its own hue on its tile;
  // a channel and a doc have none, only an ink-3 glyph.
  // A channel wears its own hue (INTERACTION_SPEC D13): the tile it has in the
  // sidebar, the list and its header, not a grey #.
  it("marks a project and a channel each in its own hue", () => {
    const input = open()
    type(input, "q4")
    const project = row(group("Jump to"), "Q4 launch")!
    expect(project.querySelector("[data-hue]")?.getAttribute("data-hue")).toBe(hueFor("p1"))
    type(input, "eng")
    const channel = row(group("Jump to"), "engineering")!
    const tile = channel.querySelector("[data-channel-tile]")!
    expect(tile.getAttribute("data-hue")).toBe(hueFor("c1"))
  })

  // SH-24: a row's highlight is the layer's menu tint in the hue of what it
  // opens, where it was the grey --press for everything; its bar is that
  // hue's mark.
  it("tints a row's highlight in the hue of what it opens", () => {
    const input = open()
    type(input, "eng")
    expect(row(group("Jump to"), "engineering")!.getAttribute("data-hue")).toBe(hueFor("c1"))
    type(input, "q4")
    expect(row(group("Jump to"), "Q4 launch")!.getAttribute("data-hue")).toBe(hueFor("p1"))
    const rules = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8")
    const at = rules.indexOf('.palette-row[data-selected="true"] {')
    expect(rules.slice(at, rules.indexOf("}", at))).not.toMatch(/background/)
    const bar = rules.indexOf('.palette-row[data-selected="true"]::before {')
    expect(rules.slice(bar, rules.indexOf("}", bar))).toMatch(/background:\s*var\(--ix-mark/)
  })

  it("names no raw Tailwind hue for a kind", () => {
    const src = readFileSync(resolve(__dirname, "CommandPalette.tsx"), "utf8")
    expect(src).not.toMatch(/text-(blue|orange|cyan|purple|pink)-\d{3}/)
  })

  it("gives Boards the board glyph, not the page glyph Docs has", () => {
    const input = open()
    type(input, "boards")
    expect(row(group("Commands"), "Boards")!.querySelector("svg")?.getAttribute("class")).toMatch(/lucide-layout-dashboard/)
    type(input, "docs")
    expect(row(group("Commands"), "Docs")!.querySelector("svg")?.getAttribute("class")).toMatch(/lucide-file-text/)
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
    expect(dialog.className).toMatch(/\bpalette\b/)
    const frame = rule(".palette {")
    expect(frame).toMatch(/top:\s*14dvh/)
    expect(frame).not.toMatch(/top:\s*50%|translate/)
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

// The palette's CSS block (globals.css, "V3 SHELL: PALETTE").
const CSS = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8")
const BLOCK = CSS.slice(CSS.indexOf("/* V3 SHELL: PALETTE */"))
function rule(selector: string): string {
  const at = BLOCK.indexOf(`\n${selector}`)
  expect(at, `${selector} is styled`).toBeGreaterThan(-1)
  return BLOCK.slice(at, BLOCK.indexOf("}", at))
}

describe("the palette, as design v3 draws it (shell P1)", () => {
  it("is 640px wide at r16 on the modal step, with no blur behind it", () => {
    const frame = rule(".palette {")
    expect(frame).toMatch(/width:\s*min\(640px, calc\(100vw - 32px\)\)/)
    expect(frame).toMatch(/border-radius:\s*16px/)
    expect(frame).toMatch(/box-shadow:\s*var\(--e4\)/)
    expect(rule(".palette-scrim {")).toMatch(/rgb\(10 11 14 \/ 0\.32\)/)
    expect(BLOCK).not.toMatch(/backdrop-filter/)
  })

  it("has a 52px field at 16px", () => {
    expect(rule(".palette-input-row {")).toMatch(/height:\s*52px/)
    expect(rule(".palette-input {")).toMatch(/font-size:\s*16px/)
  })

  it("rows are 40px at r8, and the selected one carries a tick in its hue's mark (the accent without one), not a grey fill", () => {
    expect(rule(".palette-row {")).toMatch(/height:\s*40px[\s\S]*border-radius:\s*8px/)
    expect(rule('.palette-row[data-selected="true"]::before {')).toMatch(/width:\s*2px[\s\S]*background:\s*var\(--ix-mark, var\(--brand\)\)/)
  })

  it("marks what matched by weight, not a tint", () => {
    expect(rule(".palette mark {")).toMatch(/background:\s*transparent[\s\S]*font-weight:\s*590/)
    const input = open()
    type(input, "eng")
    expect(row(group("Jump to"), "engineering")!.querySelector("mark")?.textContent).toBe("eng")
  })

  it("has no close button: Esc and the scrim close it", () => {
    open()
    const dialog = document.querySelector("[data-command-dialog]") as HTMLElement
    expect(within(dialog).queryByRole("button", { name: /close/i })).toBeNull()
  })

  it("opens on what you were just in and a few things to start, not every destination", () => {
    state.recentItems.items = [{ id: "p1", type: "project", title: "Q4 launch", path: "/app/project/p1", timestamp: 1 }]
    features = { [FEATURE_AI]: true }
    open()
    const headings = [...document.querySelectorAll("[cmdk-group-heading]")].map((h) => h.textContent)
    expect(headings).toEqual(["Recent", "Suggested"])
    expect(group("Navigate")).toBeUndefined()
    expect(row(group("Suggested"), "New message")).toBeTruthy()
    expect(screen.getByText("Ask OneCamp AI…")).toBeTruthy()
    expect(document.querySelectorAll("[cmdk-item]").length).toBeLessThanOrEqual(10)
  })

  it("ends every typed list with Ask, where AI is on", () => {
    features = { [FEATURE_AI]: true }
    const input = open()
    type(input, "launch")
    const items = [...document.querySelectorAll("[cmdk-item]")]
    expect(items.at(-1)?.textContent).toMatch(/Ask OneCamp AI: “launch”/)
  })

  it("has no Ask at all where AI is off", () => {
    const input = open()
    expect(screen.queryByText("Ask OneCamp AI…")).toBeNull()
    expect(screen.queryByRole("group", { name: "Search or ask" })).toBeNull()
    type(input, "launch")
    act(() => void fireEvent.keyDown(input, { key: "Tab" }))
    expect(screen.queryByTestId("ask-view")).toBeNull()
  })

  it("teaches a destination's G key on its row", () => {
    expect(commandKeys("nav-inbox")).toBe(`G ${GO_KEYS.find((g) => g.to === "/app/inbox")!.key.toUpperCase()}`)
    const input = open()
    type(input, "inbox")
    expect(row(group("Commands"), "Inbox")!.querySelector('[aria-label^="G then"]')).toBeTruthy()
  })

  it("pushes a page for an argument, and Backspace on an empty field pops it", () => {
    open()
    fireEvent.click(row(group("Suggested"), "Change theme")!)
    const input = document.querySelector("[cmdk-input]") as HTMLInputElement
    expect(document.querySelector(".palette-crumb")?.textContent).toBe("Theme")
    expect(row(document.querySelector(".palette-list") as HTMLElement, "Match my device")).toBeTruthy()
    act(() => void fireEvent.keyDown(input, { key: "Backspace" }))
    expect(document.querySelector(".palette-crumb")).toBeNull()
    expect(group("Suggested")).toBeTruthy()
  })

  // QA SH-14 (14 Oct 2026): "dark" and "theme" found only messages; Change
  // theme… sat in Suggested and no word reached it.
  it("finds Change theme… and Pause notifications… by the words people type, and opens their pages", () => {
    for (const [word, label, crumb] of [["dark", "Change theme…", "Theme"], ["theme", "Change theme…", "Theme"], ["colour", "Change theme…", "Theme"], ["snooze", "Pause notifications…", "Pause notifications"]]) {
      const input = open()
      type(input, word)
      const found = row(group("Commands"), label)
      expect(found, word).toBeTruthy()
      fireEvent.click(found!)
      expect(document.querySelector(".palette-crumb")?.textContent).toBe(crumb)
      expect(document.querySelector("[cmdk-input]")).toBeTruthy()
      cleanup()
    }
  })

  it("opens from elsewhere with a query, and says it is open", () => {
    render(<CommandPalette />)
    const seen: boolean[] = []
    const stop = onPaletteState((o) => seen.push(o))
    act(() => openPalette({ query: "q4" }))
    const input = document.querySelector("[cmdk-input]") as HTMLInputElement
    expect(input.value).toBe("q4")
    expect(seen.at(-1)).toBe(true)
    stop()
  })

  it("suggests the nearest name when nothing matched", () => {
    expect(closestName("qz launch", ["Q4 launch", "engineering"])).toBe("Q4 launch")
    expect(closestName("zzzzzz", ["Q4 launch"])).toBeNull()
  })

  // One set for the palette, the profile menu and the pause dialog: the
  // palette and the menu had copies of their own that drifted.
  it("pauses for the pause dialog's own set, each saying when it ends", () => {
    const now = new Date(2026, 9, 11, 15, 0)
    const choices = pausePresets(now)
    expect(choices.slice(0, 4).map((c) => c.label)).toEqual(["For 30 minutes", "For 1 hour", "For 2 hours", "Until tomorrow, 9:00\u00a0AM"])
    const clock = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`
    expect(pauseEndsLine(choices[0], clock)).toBe("until 15:30")
    expect(pauseEndsLine(choices[3], clock)).toBe("")
    const src = readFileSync(resolve(__dirname, "CommandPalette.tsx"), "utf8")
    expect(src).toMatch(/filterChoices\(pausePresets\(new Date\(\)\), query\)/)
  })
})

describe("Ask in the palette (shell P2)", () => {
  const askView = () => screen.queryByTestId("ask-view")?.textContent

  it("Tab crosses to Ask with the query as typed, and back again", () => {
    features = { [FEATURE_AI]: true }
    const input = open()
    type(input, "what blocks the launch")
    act(() => void fireEvent.keyDown(input, { key: "Tab" }))
    expect(askView()).toBe("ask:what blocks the launch:0:0")
    expect(document.querySelector(".palette-input-row")?.getAttribute("data-mode")).toBe("ask")
    expect(input.getAttribute("placeholder")).toBe("Ask about your workspace…")
    act(() => void fireEvent.keyDown(input, { key: "Tab" }))
    expect(askView()).toBeUndefined()
    expect(input.value).toBe("what blocks the launch")
  })

  it("asks on Enter and continues in the panel on ⌘⏎", () => {
    features = { [FEATURE_AI]: true }
    const input = open()
    type(input, "status?")
    act(() => void fireEvent.keyDown(input, { key: "Tab" }))
    act(() => void fireEvent.keyDown(input, { key: "Enter" }))
    expect(askView()).toBe("ask:status?:1:0")
    act(() => void fireEvent.keyDown(input, { key: "Enter", metaKey: true }))
    expect(askView()).toBe("ask:status?:1:1")
  })

  // IME sweep (14 Oct 2026): Safari confirms an input method's word with an
  // Enter whose keyCode is 229 and isComposing false, which asked mid-word.
  it("an input method's Enter picks its word and doesn't ask", () => {
    features = { [FEATURE_AI]: true }
    const input = open()
    type(input, "にほん")
    act(() => void fireEvent.keyDown(input, { key: "Tab" }))
    act(() => void fireEvent.keyDown(input, { key: "Enter", keyCode: 229 }))
    expect(askView()).toBe("ask:にほん:0:0")
    act(() => void fireEvent.keyDown(input, { key: "Enter" }))
    expect(askView()).toBe("ask:にほん:1:0")
  })

  it("the Ask row takes the query across and asks it", () => {
    features = { [FEATURE_AI]: true }
    const input = open()
    type(input, "launch")
    fireEvent.click(screen.getByText(/Ask OneCamp AI: “launch”/))
    expect(askView()).toBe("ask:launch:1:0")
  })

  it("opens on Ask when asked to", () => {
    features = { [FEATURE_AI]: true }
    render(<CommandPalette />)
    act(() => openPalette({ mode: "ask" }))
    expect(askView()).toBe("ask::0:0")
  })
})

describe("previews and open beside (shell P3)", () => {
  it("⌘⏎ opens the selected row beside the page", () => {
    const input = open()
    type(input, "war-ro")
    dispatched.mockClear()
    act(() => void fireEvent.keyDown(input, { key: "Enter", metaKey: true }))
    const action = dispatched.mock.calls.map((c) => c[0]).find((a) => /openInSplit/.test(a?.type ?? ""))
    expect(action?.payload).toMatchObject({ kind: "channel", id: "chan-war-room" })
    expect(push).not.toHaveBeenCalled()
  })

  it("Space on an empty field previews the selected row, and Space again closes it", () => {
    state.recentItems.items = [{ id: "d1", type: "doc", title: "Launch sync notes", path: "/app/doc/d1", timestamp: 1 }]
    const input = open()
    act(() => void fireEvent.keyDown(input, { key: " " }))
    const peek = document.querySelector(".palette-peek")
    expect(peek?.textContent).toMatch(/Launch sync notes/)
    act(() => void fireEvent.keyDown(input, { key: " " }))
    expect(document.querySelector(".palette-peek")).toBeNull()
  })

  it("a space typed into a query stays a space", () => {
    const input = open()
    type(input, "q4")
    const ev = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true })
    act(() => void input.dispatchEvent(ev))
    expect(ev.defaultPrevented).toBe(false)
    expect(document.querySelector(".palette-peek")).toBeNull()
  })
})

