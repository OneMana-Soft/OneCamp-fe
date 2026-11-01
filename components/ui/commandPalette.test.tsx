import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Profiler } from "react"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import type { SearchResult } from "@/services/searchService"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { hueFor } from "@/lib/campHue"
import { CHIP_TONE } from "@/lib/ui/chipTone"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { PEEK_READ_REST_MS } from "@/components/ui/palettePeek"

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
// A task's own read (GET /task/info/{id}), by id; one missing answers 404.
let taskInfo: Record<string, Record<string, unknown>> = {}
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    if (url) asked.push(url)
    if (url.startsWith("/search/unifiedSearch/") && searchFails) return { data: undefined, isError: Object.assign(new Error("Request failed with status code 500"), { response: { status: 500 } }), isLoading: false }
    if (url.startsWith("/search/unifiedSearch/")) return { data: { data: { page: answer } }, isLoading: false }
    if (url.startsWith("/task/info/")) {
      const task = taskInfo[url.slice("/task/info/".length)]
      return task ? { data: { msg: "ok", data: task }, isLoading: false } : { data: undefined, isError: Object.assign(new Error("Request failed with status code 404"), { response: { status: 404 } }), isLoading: false }
    }
    return { data: { data: { user_uuid: "me", user_is_admin: false } }, isLoading: false }
  },
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }),
}))
// The search waits for a pause in typing; here every key is the pause, except in a test that runs the real wait on
// fake timers (the peek's rest). It is set before the palette mounts and put back after, so a mount never switches.
let realDebounce = false
vi.mock("@/hooks/useDebounce", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/hooks/useDebounce")>()
  return { useDebounce: <T,>(v: T, delay?: number) => (realDebounce ? real.useDebounce(v, delay) : v) }
})
vi.mock("@/hooks/useCapabilities", () => ({ useCapabilities: () => ({ can: () => false }) }))
let features: Record<string, boolean> = {}
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useClientConfig: () => ({ features }),
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
  taskInfo = {}
  searchFails = false
  features = {}
  state.recentItems.items = []
  asked.length = 0
  push.mockClear()
  realDebounce = false
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
    expect(screen.queryByText("Ask OneCamp AI…")).toBeNull()
    expect(document.querySelectorAll("[cmdk-item]").length).toBeLessThanOrEqual(10)
  })

  // The edition without AI: no Ask, whatever the server says.
  it("has no Ask at all, even where the server claims AI", () => {
    features = { [FEATURE_AI]: true }
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

describe("no Ask in the palette (shell P2, edition without AI)", () => {
  it("opens on Search even when asked for Ask", () => {
    features = { [FEATURE_AI]: true }
    render(<CommandPalette />)
    act(() => openPalette({ mode: "ask" }))
    expect(screen.queryByTestId("ask-view")).toBeNull()
    expect(document.querySelector(".palette-input-row")?.getAttribute("data-mode")).toBe("search")
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

  // DESIGN-BUILD-62 MUST 1: the peek carries text, so a hit's context reaches it
  // as words (hitContextText), never as String() of the row's element.
  it("a search hit's preview says where the hit is from, as its row does, never [object Object]", () => {
    answer = [{ type: "task", task: { task_id: "t-room", task_name: "Book the launch room", task_project_name: "Q4 launch" } }] as SearchResult[]
    const input = open()
    type(input, "launch room")
    act(() => void fireEvent.keyDown(input, { key: "ArrowDown" }))
    act(() => void fireEvent.keyDown(input, { key: "ArrowUp" }))
    expect(document.querySelector(".palette [cmdk-item][data-selected=true]")?.textContent).toContain("Book the launch room")
    act(() => void fireEvent.keyDown(input, { key: " " }))
    const peek = document.querySelector(".palette-peek")
    expect(peek?.textContent).toContain("Book the launch room")
    expect(peek?.textContent).toContain("Q4 launch")
    expect(peek?.textContent).not.toContain("[object Object]")
  })

  // DESIGN-BUILD-62 MUST 2: a preview sits beside the palette or inside it, never
  // over it. It is drawn in the palette, under the list and above the footer's
  // keys, and the CSS sets it beside the palette where the window has room for
  // it (e2e/palettePeek.spec.ts measures it beside at 1280 and inside at 1024).
  it("the preview is drawn in the palette, under the list and above the footer's keys", () => {
    state.recentItems.items = [{ id: "d1", type: "doc", title: "Launch sync notes", path: "/app/doc/d1", timestamp: 1 }]
    const input = open()
    act(() => void fireEvent.keyDown(input, { key: " " }))
    const peek = document.querySelector(".palette-peek")
    expect(peek?.textContent).toMatch(/Launch sync notes/)
    expect(document.querySelector(".palette")?.contains(peek)).toBe(true)
    expect(peek?.previousElementSibling?.hasAttribute("cmdk-list")).toBe(true)
    expect(peek?.nextElementSibling?.classList.contains("palette-footer")).toBe(true)
  })

  // V-db63-1 S2: a preview earns its place with what the row can't show, as
  // Linear's peek opens an issue's properties and body.
  const ROOM_HIT = {
    type: "task",
    task: {
      task_id: "t-room", task_name: "Book the launch room", task_project_name: "Q4 launch", task_status: "inProgress", task_priority: "high",
      task_assignee_user_full_name: "Maya Chen", task_desc: "<p>Ask facilities for the big room.</p><p>Then book the screens.</p>",
    },
  }
  /** Onto the hit called `title` with the arrows, then Space: its preview. */
  const peekTheHit = (input: HTMLInputElement, title: string) => {
    act(() => void fireEvent.keyDown(input, { key: "ArrowDown" }))
    act(() => void fireEvent.keyDown(input, { key: "ArrowUp" }))
    expect(document.querySelector(".palette [cmdk-item][data-selected=true]")?.textContent).toContain(title)
    act(() => void fireEvent.keyDown(input, { key: " " }))
    return document.querySelector(".palette-peek")
  }
  const factOf = (kind: string) => document.querySelector(`.palette-peek [data-peek-fact="${kind}"]`)?.textContent ?? null

  it("a task hit's preview shows its status, priority, assignee and its description's first line, and its due date from the task's one read", () => {
    const due = new Date()
    due.setDate(due.getDate() + 1)
    due.setHours(17, 0, 0, 0)
    answer = [ROOM_HIT] as SearchResult[]
    taskInfo["t-room"] = {
      task_name: "Book the launch room", task_status: "inProgress", task_custom_status_name: "Booking", task_priority: "high",
      task_assignee: { user_name: "Maya Chen" }, task_due_date: due.toISOString(),
    }
    const input = open()
    type(input, "launch room")
    // Listing the hit reads nothing more: the task's read waits for its preview.
    expect(asked.some((u) => u.startsWith("/task/info/"))).toBe(false)
    const peek = peekTheHit(input, "Book the launch room")
    expect(asked).toContain("/task/info/t-room")
    expect(factOf("status")).toBe("Status: Booking")
    expect(factOf("priority")).toBe("Priority: High")
    expect(factOf("assignee")).toBe("Assignee: Maya Chen")
    expect(factOf("due")).toBe("Due date: Tomorrow")
    expect(peek?.querySelector("[data-peek-body]")?.textContent).toBe("Ask facilities for the big room.")
    // Where it's from is its project; its assignee has a property of its own, so the preview names them once.
    expect(peek?.textContent).toContain("Q4 launch")
    expect(peek?.textContent?.match(/Maya Chen/g)).toHaveLength(1)
  })

  it("a task its preview can't read keeps the hit's own properties, with no due date", () => {
    answer = [ROOM_HIT] as SearchResult[]
    const input = open()
    type(input, "launch room")
    peekTheHit(input, "Book the launch room")
    expect(asked).toContain("/task/info/t-room")
    expect(factOf("status")).toBe("Status: In progress")
    expect(factOf("priority")).toBe("Priority: High")
    expect(factOf("assignee")).toBe("Assignee: Maya Chen")
    expect(factOf("due")).toBeNull()
  })

  it("a doc hit's preview shows the first line of its body, and no properties", () => {
    answer = [{ type: "doc", doc: { doc_uuid: "d-zephyr", doc_title: "Zephyr launch notes", doc_snippet: "Goals for the launch week\nOwners and dates", doc_created_by_user_full_name: "Ana Diaz" } }] as SearchResult[]
    const input = open()
    type(input, "zephyr")
    const peek = peekTheHit(input, "Zephyr launch notes")
    expect(peek?.querySelector("[data-peek-body]")?.textContent).toBe("Goals for the launch week")
    expect(peek?.querySelector('[aria-label="Properties"]')).toBeNull()
    expect(asked.some((u) => u.startsWith("/task/info/"))).toBe(false)
  })

  // DESIGN-BUILD-66's MUST 1: the properties are the design system's chips (components/ui/chip), as the task card draws
  // them: the glyph inside the chip, a late due date in the danger tone, and each label a LabelChip with its hue's dot.
  it("draws each property as the shared chip: a late due date in the danger tone, each label with its own hue's dot", () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(0, 0, 0, 0)
    answer = [ROOM_HIT] as SearchResult[]
    taskInfo["t-room"] = { task_name: "Book the launch room", task_status: "inProgress", task_priority: "high", task_due_date: yesterday.toISOString(), task_label: "Launch, Ops" }
    const input = open()
    type(input, "launch room")
    peekTheHit(input, "Book the launch room")
    const facts = [...document.querySelectorAll(".palette-peek [data-peek-fact]")]
    expect(facts.map((f) => f.getAttribute("data-peek-fact"))).toEqual(["status", "priority", "due", "label", "label"])
    for (const f of facts) expect(f.querySelector("[data-chip]"), `${f.textContent} is a chip`).not.toBeNull()
    const due = facts[2]
    expect(due.textContent).toBe("Due date: Yesterday")
    expect(due.getAttribute("data-due")).toBe("overdue")
    const dueChip = due.querySelector("[data-chip]")!
    for (const c of CHIP_TONE.danger.split(" ")) expect(dueChip.classList.contains(c), c).toBe(true)
    expect(facts.slice(3).map((l) => l.textContent)).toEqual(["Label: Launch", "Label: Ops"])
    expect(facts.slice(3).map((l) => l.querySelector("[data-chip-dot]")?.classList.contains(HUE_CLASS[hueFor(l.textContent!.slice("Label: ".length))]))).toEqual([true, true])
  })

  // CODE-REVIEWER-144's MUST 1 (row 2196): today's ink is pinned at the chip that draws it. Row 2193's symptom was a task
  // due today in the danger ink, and the facts layer's pins can't see which tone the chip is given.
  it("a task due today, at local midnight, reads Today on the sun chip, never the danger one", () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    answer = [ROOM_HIT] as SearchResult[]
    taskInfo["t-room"] = { task_name: "Book the launch room", task_status: "inProgress", task_priority: "high", task_due_date: today.toISOString() }
    const input = open()
    type(input, "launch room")
    peekTheHit(input, "Book the launch room")
    const due = document.querySelector('.palette-peek [data-peek-fact="due"]')!
    expect(due.textContent).toBe("Due date: Today")
    expect(due.getAttribute("data-due")).toBe("today")
    const dueChip = due.querySelector("[data-chip]")!
    for (const c of CHIP_TONE.sun.split(" ")) expect(dueChip.classList.contains(c), c).toBe(true)
    // Both tones carry shadow-none; the danger tone's own classes are its tint and its ink.
    const sun = new Set(CHIP_TONE.sun.split(" "))
    for (const c of CHIP_TONE.danger.split(" ").filter((c) => !sun.has(c))) expect(dueChip.classList.contains(c), c).toBe(false)
  })

  // CODE-REVIEWER-143's MUST 2: the preview reads a task only where the selection rests (PEEK_READ_REST_MS). Arrowing
  // with the preview open reads none of the hits it passes, a doc's row between them included, and the task it stops on
  // once, after the rest. The search's own pause and the peek's rest both run, on fake timers.
  it("arrowing across hits with the preview open reads none it passes, and the task it rests on once, after the rest", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"] })
    realDebounce = true
    try {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(0, 0, 0, 0)
      const task = (id: string, name: string) => ({ type: "task", task: { task_id: id, task_name: name, task_project_name: "Q4 launch", task_status: "todo" } })
      answer = [
        task("t-room", "Zinnia room"),
        task("t-screens", "Zinnia screens"),
        { type: "doc", doc: { doc_uuid: "d-notes", doc_title: "Zinnia notes", doc_snippet: "Goals" } },
        task("t-party", "Zinnia party"),
      ] as SearchResult[]
      for (const [id, name] of [["t-room", "Zinnia room"], ["t-screens", "Zinnia screens"], ["t-party", "Zinnia party"]]) {
        taskInfo[id] = { task_name: name, task_status: "todo", task_due_date: tomorrow.toISOString() }
      }
      const reads = () => [...new Set(asked.filter((u) => u.startsWith("/task/info/")))]
      const input = open()
      type(input, "zinnia")
      act(() => void vi.advanceTimersByTime(1_000))
      // Space on a task is asked for: the preview it opens reads that task at once.
      peekTheHit(input, "Zinnia room")
      expect(reads()).toEqual(["/task/info/t-room"])
      for (const passing of ["Zinnia screens", "Zinnia notes", "Zinnia party"]) {
        act(() => void fireEvent.keyDown(input, { key: "ArrowDown" }))
        act(() => void vi.advanceTimersByTime(PEEK_READ_REST_MS / 5))
        expect(document.querySelector(".palette-peek")?.textContent, "the preview follows the selection").toContain(passing)
      }
      expect(reads(), "nothing read on the way").toEqual(["/task/info/t-room"])
      expect(factOf("due")).toBeNull()
      act(() => void vi.advanceTimersByTime(PEEK_READ_REST_MS))
      expect(reads()).toEqual(["/task/info/t-room", "/task/info/t-party"])
      expect(factOf("due")).toBe("Due date: Tomorrow")
      act(() => void vi.advanceTimersByTime(PEEK_READ_REST_MS * 5))
      expect(reads(), "resting longer reads nothing more").toEqual(["/task/info/t-room", "/task/info/t-party"])
    } finally {
      realDebounce = false
      vi.useRealTimers()
    }
  })
})


// linear-28 to_win 2: Linear narrows its palette with a letter and Space (i, p,
// u, d …). A letter and a space typed into the empty field set a scope, shown
// as a chip where a page's crumb sits; the search asks the server for that kind
// only (lib/search/scopePrefix), and only that kind shows. Backspace on the
// empty field, or a tap on the chip, searches everything again.
describe("scopes by a prefix (linear-28)", () => {
  const scopeChip = () => document.querySelector<HTMLElement>("[data-palette-scope]")
  const mixed = [
    { type: "task", task: { task_id: "t1", task_name: "Book the room", task_project_name: "Q4 launch" } },
    { type: "doc", doc: { doc_uuid: "d1", doc_title: "Room booking notes" } },
  ] as SearchResult[]
  const options = (heading: string) => within(group(heading)!).getAllByRole("option").map((o) => o.textContent)

  it("narrows to tasks on t and a space: a chip, an empty field, and a request for tasks only", () => {
    answer = mixed
    const input = open()
    type(input, "t ")
    expect(input.value).toBe("")
    expect(scopeChip()?.getAttribute("data-palette-scope")).toBe("tasks")
    expect(scopeChip()?.textContent).toBe("Tasks")
    expect(input.placeholder).toBe("Search tasks…")
    type(input, "room")
    expect(asked).toContain(`/search/unifiedSearch/${encodeURIComponent("type:task room")}`)
    expect(options("Tasks")).toEqual([expect.stringContaining("Book the room")])
    expect(group("Messages, docs and tasks")).toBeUndefined()
  })

  it("keeps only what its kind holds: no commands, and only its own places", () => {
    let input = open()
    type(input, "settings")
    expect(group("Commands") ?? group("Settings")).toBeDefined()
    cleanup()
    input = open()
    type(input, "t ")
    type(input, "settings")
    expect(group("Commands")).toBeUndefined()
    cleanup()
    input = open()
    type(input, "t ")
    type(input, "q4")
    expect(group("Jump to")).toBeUndefined()
    cleanup()
    input = open()
    type(input, "p ")
    type(input, "q4")
    expect(row(group("Jump to"), "Q4 launch")).toBeDefined()
  })

  it("searches everything again on Backspace in the empty field, or a tap on the chip", () => {
    const input = open()
    type(input, "d ")
    expect(scopeChip()?.textContent).toBe("Docs")
    act(() => void fireEvent.keyDown(input, { key: "Backspace" }))
    expect(scopeChip()).toBeNull()
    expect(input.placeholder).not.toBe("Search docs…")
    type(input, "c ")
    // With words in the field, Backspace edits the words and the scope stays.
    type(input, "x")
    act(() => void fireEvent.keyDown(input, { key: "Backspace" }))
    expect(scopeChip()?.textContent).toBe("Channels")
    act(() => void fireEvent.click(scopeChip()!))
    expect(scopeChip()).toBeNull()
  })

  it("leaves i and a space as words", () => {
    const input = open()
    // "i" names no scope: a search may start "I …".
    type(input, "i ")
    expect(input.value).toBe("i ")
    expect(scopeChip()).toBeNull()
  })

  it("sends its full search to the search page on the scope's chip", () => {
    answer = mixed
    const input = open()
    type(input, "t ")
    type(input, "room")
    fireEvent.click(screen.getByText("Search all tasks for “room”"))
    expect(push).toHaveBeenCalledWith("/app/search?query=room&in=tasks")
  })

  it("says plainly when the scope holds nothing, and offers the scope's full search", () => {
    const input = open()
    type(input, "p ")
    type(input, "qz plan")
    expect(screen.getByText("No projects called “qz plan”")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Search all projects" }))
    expect(push).toHaveBeenCalledWith("/app/search?query=qz%20plan&in=projects")
  })

  it("lists the recent things of its kind before anything is typed", () => {
    state.recentItems.items = [
      { id: "t9", type: "task", title: "Book the room", path: "/app/task/t9", timestamp: 2 },
      { id: "d1", type: "doc", title: "Launch sync notes", path: "/app/doc/d1", timestamp: 1 },
    ]
    const input = open()
    type(input, "t ")
    expect(options("Recent")).toEqual([expect.stringContaining("Book the room")])
    expect(group("Suggested")).toBeUndefined()
  })

  it("ends with the palette: the next opening searches everything", () => {
    const input = open()
    type(input, "u ")
    expect(scopeChip()?.textContent).toBe("People")
    act(() => void fireEvent.keyDown(document, { key: "k", ctrlKey: true }))
    const again = open(false)
    expect(scopeChip()).toBeNull()
    expect(again.placeholder).not.toBe("Search people…")
  })
})
