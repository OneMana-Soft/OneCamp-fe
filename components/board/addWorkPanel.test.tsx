import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { boardScene, type TestElement } from "@/lib/testing/boardScene"
import { cardElement, cardSize } from "@/lib/board/cards"
import { pinTestClock } from "@/lib/testing/testClock"
import type { SearchResult } from "@/services/searchService"
import AddWorkPanel from "./addWorkPanel"
import { useAddWorkReads } from "./addWorkReads"

// The board's "Add from OneCamp" panel (miro-13 2): find a task, a doc or a
// project, or open a project's list, and put it on the board as its live card:
// a press lays it in the middle of the view (above the sheet on a phone), past
// anything already there, and on a computer a row can be dragged to its spot.

// A deleted project carries the day it was deleted (app/testClock.test.ts).
pinTestClock()

const sheet = { on: false }
vi.mock("@/components/ui/overlayMode", () => ({ useSheetMode: () => sheet.on, SHEET_QUERY: "" }))

const RESULTS: SearchResult[] = [
  { type: "task", task: { task_id: "t1", task_name: "Book the venue", task_status: "inProgress", task_project_name: "Launch" } },
  { type: "channel", channel: { ch_id: "c1", ch_name: "general" } },
  { type: "doc", doc: { doc_uuid: "d1", doc_title: "Venue brief" } },
]
const search = { failed: false, searching: false, none: false, retry: vi.fn() }
vi.mock("@/hooks/useSearchPicks", () => ({
  useSearchPicks: <T,>(query: string, pick: (r: SearchResult) => T | null) => ({
    items: query.trim() && !search.failed && !search.none ? RESULTS.map(pick).filter(Boolean) : [],
    searching: search.searching && !!query.trim(),
    failed: search.failed && !!query.trim(),
    retry: search.retry,
  }),
}))

const projects = {
  list: [{ project_uuid: "p1", project_name: "Launch" }, { project_uuid: "p2", project_name: "Hiring" }] as { project_uuid: string; project_name: string; project_deleted_at?: string }[],
  waiting: false,
  failed: false,
  mutate: vi.fn(),
}
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) =>
    url.includes("userProjectList")
      ? { data: projects.waiting || projects.failed ? undefined : { data: { user_projects: projects.list } }, isLoading: projects.waiting, isError: projects.failed, mutate: projects.mutate }
      : { data: undefined, isLoading: false },
}))

const boards: Record<string, unknown> = {
  p1: {
    project_tasks_in_progress: [{ task_uuid: "t1", task_name: "Book the venue", task_status: "inProgress", task_key: "EV-12" }],
    project_tasks_todo: [{ task_uuid: "t2", task_name: "Print badges", task_status: "todo", task_key: "EV-14" }],
    project_tasks_done: [{ task_uuid: "t9", task_name: "Pick a date", task_status: "done", task_key: "EV-2" }],
  },
  p2: {},
}
const asked: string[] = []
const tasks = { waiting: false, failed: false, retry: vi.fn() }
// What a project's own read says (lib/liveEntity): "gone" once it's deleted, "none" once it's out of the reader's reach,
// and "none" while the read is off (a search), as useLiveEntity gives for no id.
const reads = { gone: new Set<string>(), none: new Set<string>() }
vi.mock("@/hooks/useProjectBoard", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useProjectBoard: (projectId: string, opts: { enabled?: boolean } = {}) => {
    const on = opts.enabled !== false && !!projectId
    if (on) asked.push(projectId)
    const state = !on || reads.none.has(projectId) ? "none" : reads.gone.has(projectId) ? "gone" : "ok"
    const off = state !== "ok" || tasks.waiting || tasks.failed
    return { project: { state }, board: off ? undefined : boards[projectId], loading: tasks.waiting, failed: tasks.failed, retry: tasks.retry }
  },
}))

const ORIGIN = window.location.origin
const TASK = cardSize("task")

// As the board page has it: the panel's reads and states come from the page's first load (addWorkReads).
function Panel(props: { api: ExcalidrawImperativeAPI; onClose: () => void }) {
  return <AddWorkPanel {...props} reads={useAddWorkReads()} />
}

function panel(elements: TestElement[] = []) {
  const s = boardScene(elements)
  const onClose = vi.fn()
  render(<Panel api={s.api} onClose={onClose} />)
  return { s, onClose, cards: () => s.elements().filter((e) => e.type === "embeddable" && !e.isDeleted) }
}

const type = (text: string) => fireEvent.change(screen.getByRole("searchbox", { name: "Search tasks, docs and projects" }), { target: { value: text } })

afterEach(() => {
  cleanup()
  sheet.on = false
  search.failed = false
  search.searching = false
  search.none = false
  projects.waiting = false
  projects.failed = false
  tasks.waiting = false
  tasks.failed = false
  reads.gone.clear()
  reads.none.clear()
  projects.list = [{ project_uuid: "p1", project_name: "Launch" }, { project_uuid: "p2", project_name: "Hiring" }]
  asked.length = 0
  try {
    localStorage.clear()
  } catch {
    /* none in this run */
  }
})

describe("add from OneCamp", () => {
  it("a task found by search is laid as its card in the middle of the view, selected, as one undo step", () => {
    const p = panel()
    type("venue")
    // A channel has no card, so it isn't offered.
    expect(screen.queryByText("general")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /Book the venue/ }))
    const [card] = p.cards()
    expect(card).toMatchObject({ link: `${ORIGIN}/app/task/t1`, customData: { kind: "card" }, x: 500 - TASK.width / 2, y: 400 - TASK.height / 2 })
    expect(p.s.writes.at(-1)?.captureUpdate).toBe("IMMEDIATELY")
    expect(p.s.writes.at(-1)?.appState?.selectedElementIds).toEqual({ [card.id]: true })
    // Said to a screen reader, and the computer's panel stays open for the next one.
    expect(screen.getByRole("status").textContent).toBe("Book the venue is on the board")
    expect(p.onClose).not.toHaveBeenCalled()
  })

  it("the next one goes below the last, never on it", () => {
    const p = panel()
    type("venue")
    fireEvent.click(screen.getByRole("button", { name: /Venue brief/ }))
    type("book")
    fireEvent.click(screen.getByRole("button", { name: /Book the venue/ }))
    const [doc, task] = p.cards()
    expect(doc.link).toBe(`${ORIGIN}/app/doc/d1`)
    expect(task.x + TASK.width / 2).toBe(500)
    expect(task.y).toBeGreaterThanOrEqual(doc.y + doc.height)
  })

  it("on a phone, the card lands in the middle of what the sheet leaves in view", () => {
    sheet.on = true
    const p = panel()
    type("venue")
    fireEvent.click(screen.getByRole("button", { name: /Book the venue/ }))
    const [card] = p.cards()
    expect(card.y + TASK.height / 2).toBe(200)
    expect(card.x + TASK.width / 2).toBe(500)
  })

  it("on a computer a row is dragged with its link, which the board's drop makes a card", () => {
    panel()
    type("venue")
    const set = vi.fn()
    const row = screen.getByRole("button", { name: /Book the venue/ })
    expect(row.getAttribute("draggable")).toBe("true")
    fireEvent.dragStart(row, { dataTransfer: { setData: set, effectAllowed: "" } })
    expect(set).toHaveBeenCalledWith("text/uri-list", `${ORIGIN}/app/task/t1`)
    expect(set).toHaveBeenCalledWith("text/plain", `${ORIGIN}/app/task/t1`)
  })

  it("with nothing typed, it lists a project's open tasks under their status; done ones aren't offered", () => {
    const p = panel()
    expect(asked).toContain("p1")
    const list = screen.getByRole("region", { name: "Launch's open tasks" })
    expect(within(list).getByText("In progress")).toBeTruthy()
    expect(within(list).getByText("To do")).toBeTruthy()
    expect(within(list).queryByText("Pick a date")).toBeNull()
    fireEvent.click(within(list).getByRole("button", { name: /Print badges/ }))
    expect(p.cards().map((c) => c.link)).toEqual([`${ORIGIN}/app/task/t2`])
    // Another project is a pick away, and the pick is kept for the next board.
    fireEvent.click(screen.getByRole("combobox", { name: "Project" }))
    fireEvent.click(screen.getByRole("option", { name: "Hiring" }))
    expect(screen.getByRole("heading", { name: "Hiring has no open tasks" })).toBeTruthy()
    cleanup()
    panel()
    expect(screen.getByRole("combobox", { name: "Project" }).textContent).toContain("Hiring")
  })

  it("a thing already on the board says so, and a press goes to its card instead of laying another", () => {
    const placed = cardElement({ id: "card-1", x: 0, y: 0, link: `${ORIGIN}/app/task/t1`, kind: "task" }) as unknown as TestElement
    const p = panel([placed])
    const go = vi.spyOn(p.s.api as unknown as { scrollToContent: () => void }, "scrollToContent")
    type("venue")
    const row = screen.getByRole("button", { name: /Book the venue/ })
    expect(row.textContent).toContain("On the board")
    fireEvent.click(row)
    expect(p.cards()).toHaveLength(1)
    expect(go).toHaveBeenCalled()
    expect(p.s.writes.at(-1)?.appState?.selectedElementIds).toEqual({ "card-1": true })
  })

  it("a search that fails says so, with a way to ask again; none of your projects says that too", () => {
    search.failed = true
    projects.list = []
    panel()
    expect(screen.getByRole("heading", { name: /aren.t in a project yet/ })).toBeTruthy()
    type("venue")
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }))
    expect(search.retry).toHaveBeenCalled()
  })

  it("while it reads, a list draws the shared skeleton rows and says what it waits for (DB-56 MUST 2)", () => {
    projects.waiting = true
    panel()
    expect(screen.getByRole("status", { name: "Loading your projects…" }).querySelector("[aria-hidden=true]")).toBeTruthy()
    cleanup()
    projects.waiting = false
    tasks.waiting = true
    panel()
    expect(screen.getByRole("status", { name: "Loading tasks…" })).toBeTruthy()
    search.searching = true
    type("venue")
    expect(screen.getByRole("status", { name: "Searching…" })).toBeTruthy()
  })

  it("a search that finds nothing is the shared quiet empty state, as no projects and a project with nothing open are", () => {
    search.none = true
    panel()
    type("zzz")
    expect(screen.getByRole("heading", { name: "Nothing found for “zzz”" })).toBeTruthy()
  })

  it("a list that can't be read says so, with a way to ask again: the projects, a project's tasks", () => {
    projects.failed = true
    panel()
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }))
    expect(projects.mutate).toHaveBeenCalled()
    cleanup()
    projects.failed = false
    tasks.failed = true
    panel()
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }))
    expect(tasks.retry).toHaveBeenCalled()
  })

  it("a project deleted, or out of reach, is passed over: never “Loading tasks…” for good (DB-61, miro-13 MUST 1)", () => {
    // A deleted project listed first, as the demo's seed refresh leaves its retired ones: it is neither offered nor read.
    projects.list = [{ project_uuid: "p0", project_name: "Q4 launch-retired", project_deleted_at: "2026-10-14T09:00:00Z" }, ...projects.list]
    panel()
    expect(screen.getByRole("region", { name: "Launch's open tasks" })).toBeTruthy()
    expect(asked).not.toContain("p0")
    fireEvent.click(screen.getByRole("combobox", { name: "Project" }))
    expect(screen.queryByRole("option", { name: /Q4 launch/ })).toBeNull()
    cleanup()
    // The kept project, deleted since the list was read: its own read says "gone", and the next live project shows.
    localStorage.setItem("onecamp:board:addFrom", "p2")
    reads.gone.add("p2")
    panel()
    expect(asked).toContain("p2")
    expect(screen.queryByText("Loading tasks…")).toBeNull()
    expect(screen.getByRole("region", { name: "Launch's open tasks" })).toBeTruthy()
  })

  it("with every project gone or out of reach it says there's no project, and a search never passes one over", () => {
    reads.none.add("p1")
    reads.gone.add("p2")
    panel()
    expect(screen.queryByText("Loading tasks…")).toBeNull()
    expect(screen.getByRole("heading", { name: "You aren't in a project yet" })).toBeTruthy()
    cleanup()
    reads.none.clear()
    reads.gone.clear()
    // While a search is typed, the project's read is off: that is no reason to drop the project.
    panel()
    type("venue")
    type("")
    expect(screen.getByRole("region", { name: "Launch's open tasks" })).toBeTruthy()
  })

  it("the lazy panel imports none of the shared core: the page's first load hands it its reads and states (CR-125 row 2109)", () => {
    const src = readFileSync("components/board/addWorkPanel.tsx", "utf8")
    const imports = [...src.matchAll(/^import\s+(?!type\b)[^"']*["']([^"']+)["']/gm)].map((m) => m[1])
    expect(imports.length).toBeGreaterThan(5)
    const core = /^(swr|react-redux|@reduxjs\/|@\/hooks\/(useFetch|usePost|use-toast)$|@\/lib\/axiosInstance$|@\/components\/ui\/(error-state|empty-state|skeletonRows|graphics)(\/|$))/
    expect(imports.filter((i) => core.test(i))).toEqual([])
  })
})
