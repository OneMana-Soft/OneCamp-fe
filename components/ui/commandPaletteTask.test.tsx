import { afterEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"
import { Provider } from "react-redux"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import store from "@/store/store"
import { offerPaletteEntries, type PaletteChoice, type PaletteEntry } from "@/lib/ui/paletteEntries"
import { forgetPaletteCode } from "@/lib/ui/paletteSurfaces"

// linear-28: the palette acts on the task you're on. The open task offers its
// actions first, before anything is typed; one with choices asks which on a
// page of the palette and hands the one picked back to the task's own handler.

const router = { push: () => {} }
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/app/project/p1" }))
const answer = { data: { data: { user_is_admin: true } }, isLoading: false, isError: undefined, mutate: () => {} }
// Each bot's kind, as /user/botKinds answers: an AI is behind scout.
const SCOUT = "5c0a7000-0000-4000-8000-0000000000a1"
const kinds = { ...answer, data: { data: { [SCOUT]: "agent" } } }
vi.mock("@/hooks/useFetch", () => ({ useFetch: (key: string) => (key === "/user/botKinds" ? kinds : answer), useFetchOnlyOnce: () => ({ data: undefined }), useMediaFetch: () => ({ data: undefined }) }))
const config = { features: {} }
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useClientConfig: () => config,
}))
vi.mock("@/hooks/useSplitView", () => ({ useSplitActions: () => () => {} }))
vi.mock("@/hooks/usePauseNotifications", () => ({ usePauseNotifications: () => ({ pause: () => {} }) }))
vi.mock("@/hooks/useSearch", () => ({
  useSearch: () => {
    const [inputValue, setInputValue] = useState("")
    return { inputValue, setInputValue, results: [], isLoading: false, handleResultClick: () => {} }
  },
}))

import { CommandPalette } from "./CommandPalette"

const stops: Array<() => void> = []
afterEach(() => {
  cleanup()
  while (stops.length) stops.pop()!()
  forgetPaletteCode()
})

function offerTask(apply = vi.fn(), copy = vi.fn()) {
  stops.push(
    offerPaletteEntries({
      id: "task",
      group: "This task",
      lead: true,
      entries: () => [
        {
          id: "priority",
          label: "Set priority…",
          keywords: ["urgent", "high"],
          choices: () => [
            { value: "urgent", label: "Urgent" },
            { value: "high", label: "High", current: true },
            { value: "low", label: "Low" },
          ],
          apply,
        },
        { id: "copy-link", label: "Copy link", keywords: ["url"], run: copy },
      ],
    }),
  )
  return { apply, copy }
}

async function openPalette() {
  render(
    <Provider store={store}>
      <CommandPalette />
    </Provider>,
  )
  act(() => void fireEvent.keyDown(document, { key: "k", ctrlKey: true }))
  return screen.findByPlaceholderText("Search or jump to…")
}

const item = (text: string) => screen.getByText(text).closest("[cmdk-item]") as HTMLElement

describe("the palette on a task", () => {
  it("offers the open task's actions first, before anything is typed", async () => {
    offerTask()
    await openPalette()
    const heading = await screen.findByText("This task")
    const group = heading.closest("[cmdk-group]") as HTMLElement
    expect(group.textContent).toContain("Set priority…")
    expect(group.textContent).toContain("Copy link")
    const groups = Array.from(document.querySelectorAll("[cmdk-group]"))
    expect(groups[0]).toBe(group)
  })

  it("asks which priority on a page, marks the current one, and hands the pick to the task", async () => {
    const { apply } = offerTask()
    await openPalette()
    act(() => void fireEvent.click(item("Set priority…")))
    const page = await screen.findByPlaceholderText("Set priority…")
    expect(page).toBeTruthy()
    expect(item("High").textContent).toContain("Current")
    expect(screen.queryByText("Copy link")).toBeNull()
    act(() => void fireEvent.click(item("Urgent")))
    expect(apply).toHaveBeenCalledWith("urgent")
    expect(screen.queryByPlaceholderText("Set priority…")).toBeNull()
  })

  it("filters a page's choices by what is typed", async () => {
    offerTask()
    await openPalette()
    act(() => void fireEvent.click(item("Set priority…")))
    const page = await screen.findByPlaceholderText("Set priority…")
    act(() => void fireEvent.change(page, { target: { value: "lo" } }))
    expect(screen.queryByText("Urgent")).toBeNull()
    expect(screen.getByText("Low")).toBeTruthy()
  })

  it("runs an action with no choices at once", async () => {
    const { copy } = offerTask()
    await openPalette()
    act(() => void fireEvent.click(item("Copy link")))
    expect(copy).toHaveBeenCalledTimes(1)
  })

  it("finds the task's actions by typing, under the task", async () => {
    offerTask()
    const input = await openPalette()
    act(() => void fireEvent.change(input, { target: { value: "priority" } }))
    // A typed row marks what matched ("Set <mark>priority</mark>…"), so it is
    // found by the task it acts on, as the doc's rows are.
    const row = (await screen.findByText("This task")).closest("[cmdk-item]")
    expect(row?.textContent).toContain("Set priority…")
  })

  it("lists a task whose actions are a chunk of their own once the palette has fetched them, first", async () => {
    const make = () => [{ id: "copy-link", label: "Copy link", keywords: ["copy"], run: vi.fn() }]
    stops.push(offerPaletteEntries({ id: "task", group: "This task", lead: true, load: () => Promise.resolve({ make }), entries: (code) => code.make() }))
    await openPalette()
    const group = (await screen.findByText("This task")).closest("[cmdk-group]") as HTMLElement
    expect(group.textContent).toContain("Copy link")
    expect(document.querySelectorAll("[cmdk-group]")[0]).toBe(group)
  })

  it("offers nothing once the task is closed", async () => {
    offerTask()
    stops.pop()!()
    await openPalette()
    expect(screen.queryByText("This task")).toBeNull()
    expect(screen.queryByText("Set priority…")).toBeNull()
  })
})

// CR-127 and DB-57 on H1 (31 Oct). Two task panels can be open at once (the task's page, the right panel, a split
// pane), and each offers "task": the palette lists one, the one used last. Each action and choice wears its own
// mark. The task's actions are a chunk of their own: when it lands after the list is drawn, its first row takes the
// keyboard, as it would have had it come in time, unless the person has typed or moved since.
describe("the palette on a task: one task, its marks, its first row", () => {
  const selected = () => document.querySelector<HTMLElement>("[cmdk-item][aria-selected=true]")

  /** A task whose actions come in a chunk the test lands when it wants. */
  function offerLateTask() {
    let land!: () => void
    const make = (): PaletteEntry[] => [
      { id: "status", label: "Change status…", keywords: ["status"], run: vi.fn() },
      { id: "copy-link", label: "Copy link", keywords: ["url"], run: vi.fn() },
    ]
    const code = new Promise<{ make: typeof make }>((resolve) => (land = () => resolve({ make })))
    stops.push(offerPaletteEntries({ id: "task", group: "This task", lead: true, load: () => code, entries: (c) => c.make() }))
    return () => act(async () => land())
  }

  it("lists one task's actions when two panels offer one, the one used last, with no duplicate rows or keys", async () => {
    const errs: string[] = []
    const spy = vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void errs.push(a.map(String).join(" ")))
    const runA = vi.fn()
    const runB = vi.fn()
    const panel = (run: () => void) => ({ id: "task", group: "This task", lead: true, entries: () => [{ id: "copy-link", label: "Copy link", keywords: ["url"], run }] })
    const a = panel(runA)
    let stopA = offerPaletteEntries(a)
    stops.push(() => stopA())
    stops.push(offerPaletteEntries(panel(runB)))
    // The person goes back to the first panel: it offers again, so it is the one used last.
    stopA()
    stopA = offerPaletteEntries(a)
    await openPalette()
    await screen.findByText("This task")
    expect(screen.getAllByText("This task")).toHaveLength(1)
    expect(screen.getAllByText("Copy link")).toHaveLength(1)
    act(() => void fireEvent.click(item("Copy link")))
    spy.mockRestore()
    expect(errs.filter((e) => /same key/i.test(e))).toEqual([])
    expect([runA.mock.calls.length, runB.mock.calls.length]).toEqual([1, 0])
  })

  it("still lists the doc used last when a newer doc offers nothing, as the doc's own rule says", async () => {
    stops.push(offerPaletteEntries({ id: "doc", group: "This doc", entries: () => [{ id: "history", label: "Version history", keywords: [], run: vi.fn() }] }))
    stops.push(offerPaletteEntries({ id: "doc", group: "This doc", entries: () => [] }))
    const input = await openPalette()
    // A doc's actions are found by typing; only the thing the person is on leads with nothing typed.
    act(() => void fireEvent.change(input, { target: { value: "history" } }))
    const row = (await screen.findByText("This doc")).closest("[cmdk-item]")
    expect(row?.textContent).toContain("Version history")
  })

  it("draws each action's own mark and the app's marks on a choice page, never the page icon", async () => {
    stops.push(
      offerPaletteEntries({
        id: "task",
        group: "This task",
        lead: true,
        entries: () => [
          { id: "status", label: "Change status…", keywords: [], mark: { glyph: "status" }, choices: () => [{ value: "done", label: "Done", mark: { status: { value: "done", label: "Done" } } }], apply: vi.fn() },
          { id: "priority", label: "Set priority…", keywords: [], mark: { glyph: "priority" }, choices: () => [{ value: "urgent", label: "Urgent", mark: { priority: "urgent" } }], apply: vi.fn() },
          { id: "copy-branch", label: "Copy branch name", keywords: [], mark: { glyph: "branch" }, run: vi.fn() },
        ],
      }),
    )
    await openPalette()
    const group = (await screen.findByText("This task")).closest("[cmdk-group]") as HTMLElement
    expect(group.querySelector(".lucide-file-text")).toBeNull()
    expect(item("Change status…").querySelector(".palette-mark [data-status-glyph]")).not.toBeNull()
    expect(item("Set priority…").querySelector(".palette-mark [data-priority-glyph]")).not.toBeNull()
    expect(item("Copy branch name").querySelector(".palette-mark .lucide-git-branch")).not.toBeNull()
    act(() => void fireEvent.click(item("Set priority…")))
    await screen.findByPlaceholderText("Set priority…")
    expect(item("Urgent").querySelector('.palette-mark [data-priority-glyph="4"]')).not.toBeNull()
  })

  // H1b: tags, cycle and milestone wear the app's own marks (the task form's tag, the Cycles view's, a milestone's),
  // and a tag on its page wears its hue as the tag picker draws it, a dot, never a tinted pill.
  it("draws the tag, cycle and milestone actions' marks, and each tag's hue on its page", async () => {
    stops.push(
      offerPaletteEntries({
        id: "task",
        group: "This task",
        lead: true,
        entries: () => [
          { id: "tags", label: "Add or remove tag…", keywords: [], mark: { glyph: "tag" }, choices: () => [{ value: "frontend", label: "frontend", mark: { tag: "frontend" } }], apply: vi.fn() },
          { id: "cycle", label: "Move to cycle…", keywords: [], mark: { glyph: "cycle" }, choices: () => [], apply: vi.fn() },
          { id: "milestone", label: "Move to milestone…", keywords: [], mark: { glyph: "milestone" }, choices: () => [], apply: vi.fn() },
        ],
      }),
    )
    await openPalette()
    expect(item("Add or remove tag…").querySelector(".palette-mark .lucide-tag")).not.toBeNull()
    expect(item("Move to cycle…").querySelector(".palette-mark .lucide-repeat")).not.toBeNull()
    expect(item("Move to milestone…").querySelector(".palette-mark .lucide-milestone")).not.toBeNull()
    act(() => void fireEvent.click(item("Add or remove tag…")))
    await screen.findByPlaceholderText("Add or remove tag…")
    expect(item("frontend").querySelector(".palette-mark [data-tag-hue].rounded-full")).not.toBeNull()
  })

  it("lists a selection's actions first, under how many are selected, each with the bar's key and the due date's mark (H1b)", async () => {
    stops.push(
      offerPaletteEntries({
        id: "tasks",
        group: "2 tasks selected",
        lead: true,
        entries: () => [
          { id: "due", label: "Set due date…", keywords: [], mark: { glyph: "due" }, keys: "D", choices: () => [], apply: vi.fn() },
          { id: "cycle", label: "Move to cycle…", keywords: [], mark: { glyph: "cycle" }, keys: "⇧ C", choices: () => [], apply: vi.fn() },
        ],
      }),
    )
    await openPalette()
    const group = (await screen.findByText("2 tasks selected")).closest("[cmdk-group]") as HTMLElement
    expect(document.querySelector("[cmdk-group]")).toBe(group)
    expect([...group.querySelectorAll("[cmdk-item]")].map((i) => i.textContent?.replace("⏎", ""))).toEqual(["Set due date…D", "Move to cycle…⇧ C"])
    expect(item("Set due date…").querySelector(".palette-mark .lucide-calendar-days")).not.toBeNull()
    // One cap, space between, as the palette draws every combination ("⌘ L").
    expect(item("Move to cycle…").querySelector(".palette-keys kbd")?.textContent).toBe("⇧ C")
  })

  it("tags an AI teammate on a choice page as the panel's picker does, beside Current, and a person not at all", async () => {
    // Assigning hands the task to the agent and starts its run, so "Agent" shows before the pick (DB-58).
    const sam = { user_uuid: "u-sam", user_name: "sam" }
    const scout = { user_uuid: SCOUT, user_name: "scout", is_bot: true }
    stops.push(
      offerPaletteEntries({
        id: "task",
        group: "This task",
        lead: true,
        entries: () => [
          {
            id: "assignee",
            label: "Assign to…",
            keywords: [],
            mark: { glyph: "people" },
            choices: () => [
              { value: sam.user_uuid, label: "sam", mark: { person: sam } },
              { value: scout.user_uuid, label: "scout", current: true, mark: { person: scout } },
            ],
            apply: vi.fn(),
          },
        ],
      }),
    )
    await openPalette()
    act(() => void fireEvent.click(item("Assign to…")))
    await screen.findByPlaceholderText("Assign to…")
    expect(item("sam").querySelector("[data-principal-tag]")).toBeNull()
    const tag = item("scout").querySelector('.palette-meta [data-principal-tag="ai"]')
    expect(tag, "scout's row wears the Agent tag at its end").not.toBeNull()
    expect(tag?.textContent).toContain("Agent")
    expect(item("scout").querySelector(".palette-meta")?.textContent).toContain("Current")
  })

  it("puts the keyboard on the task's first action when its chunk lands after the list is drawn", async () => {
    const land = offerLateTask()
    await openPalette()
    await waitFor(() => expect(selected()).not.toBeNull())
    expect(screen.queryByText("This task")).toBeNull()
    await land()
    await screen.findByText("This task")
    await waitFor(() => expect(selected()?.textContent).toContain("Change status…"))
  })

  it("leaves the keyboard where the person moved it before the chunk landed", async () => {
    const land = offerLateTask()
    const input = await openPalette()
    await waitFor(() => expect(selected()).not.toBeNull())
    act(() => void fireEvent.keyDown(input, { key: "ArrowDown" }))
    const moved = selected()?.textContent
    expect(moved).toBeTruthy()
    await land()
    await screen.findByText("This task")
    expect(selected()?.textContent).toBe(moved)
  })
})

// H1b (linear-28): a choice page whose choices the surface reads when it opens
// (a task's cycles, milestones, tags) says it is loading, then lists them, or
// says it couldn't and offers Try again: one place, for every surface. The
// pick still goes to the surface's own handler.
describe("a choice page whose choices are read as it opens", () => {
  /** A task whose "Move to cycle…" reads its choices; resolve or reject them when the test wants. */
  function offerCycles(choices: () => Promise<PaletteChoice[]>, apply = vi.fn()) {
    stops.push(
      offerPaletteEntries({
        id: "task",
        group: "This task",
        lead: true,
        entries: () => [{ id: "cycle", label: "Move to cycle…", keywords: ["cycle"], choices, apply }],
      }),
    )
    return apply
  }
  const CYCLE_12: PaletteChoice[] = [{ value: "c12", label: "Cycle 12" }]

  async function openCycles() {
    await openPalette()
    act(() => void fireEvent.click(item("Move to cycle…")))
    return screen.findByPlaceholderText("Move to cycle…")
  }

  it("says it is loading, then lists the choices, and hands the pick to the surface", async () => {
    let answer!: (choices: PaletteChoice[]) => void
    const apply = offerCycles(() => new Promise((resolve) => (answer = resolve)))
    await openCycles()
    expect(screen.getByText("Loading…").closest("[role=status]")).not.toBeNull()
    await act(async () => answer(CYCLE_12))
    expect(screen.queryByText("Loading…")).toBeNull()
    act(() => void fireEvent.click(item("Cycle 12")))
    expect(apply).toHaveBeenCalledWith("c12")
  })

  it("says it couldn't load them, and Try again asks again", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {})
    const choices = vi.fn<() => Promise<PaletteChoice[]>>().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(CYCLE_12)
    offerCycles(choices)
    await openCycles()
    expect(await screen.findByText("Couldn't load these just now")).toBeInTheDocument()
    act(() => void fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    expect(await screen.findByText("Cycle 12")).toBeInTheDocument()
    expect(choices).toHaveBeenCalledTimes(2)
    quiet.mockRestore()
  })

  it("asks once while the page is open, not on every keystroke that filters it", async () => {
    const choices = vi.fn(() => Promise.resolve([...CYCLE_12, { value: "c13", label: "Cycle 13" }]))
    offerCycles(choices)
    const input = await openCycles()
    expect(await screen.findByText("Cycle 13")).toBeInTheDocument()
    for (const typed of ["c", "cy", "13"]) act(() => void fireEvent.change(input, { target: { value: typed } }))
    expect(await screen.findByText("Cycle 13")).toBeInTheDocument()
    expect(screen.queryByText("Cycle 12")).toBeNull()
    expect(choices).toHaveBeenCalledTimes(1)
  })
})
