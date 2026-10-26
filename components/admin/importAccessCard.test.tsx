import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// Admin > Import and export: earlier imports' access, re-checked, for an admin to look over.

const answers = new Map<string, unknown>()
const failures = new Set<string>()
const mutate = vi.fn()
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => ({ data: answers.get(key), isLoading: false, isError: failures.has(key) ? new Error("down") : undefined, mutate }),
}))
const appMutate = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock("@/lib/swrMutate", () => ({ appMutate }))
const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }))
const confirm = vi.fn()
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
const svc = vi.hoisted(() => ({ chooseForImportAccess: vi.fn() }))
vi.mock("@/lib/importAccess", async (orig) => ({ ...(await orig<object>()), ...svc }))

import ImportAccessCard, { countLines, importLine, reasonWords, taskLists } from "./ImportAccessCard"
import { IMPORT_ACCESS_KEY, type ImportAccess, type ImportAccessProject, type ImportAccessState } from "@/lib/importAccess"
import { pinTestClock } from "@/lib/testing/testClock"

// Today is the pinned 15 Oct 2026: a date this year reads without its year.
pinTestClock()

const GONE = "a1111111-1111-4111-8111-111111111111"
const project =(over: Partial<ImportAccessProject> = {}): ImportAccessProject => ({
  project_uuid: "11111111-1111-4111-8111-111111111111",
  name: "Launch",
  archived: false,
  state: "rechecked",
  restricted: 0,
  unassigned: 0,
  already_restricted: 0,
  opened_since: 0,
  opened: 0,
  creator_outside: 0,
  assignee_outside: 0,
  comments_hidden: 0,
  gone_or_hidden: 0,
  ...over,
})
const WAITING: ImportAccess = {
  import_id: "99999999-9999-4999-8999-999999999999",
  provider: "jira",
  site: "acme.atlassian.net",
  ran_at: "2026-05-03T10:00:00Z",
  ran_by: "Ada",
  state: "needs_admin",
  reason: "no_connection",
  projects: [project({ state: "needs_admin" }), project({ project_uuid: "22222222-2222-4222-8222-222222222222", name: "Archive", archived: true, state: "needs_admin" })],
}
const CHECKED: ImportAccess = {
  ...WAITING,
  import_id: "88888888-8888-4888-8888-888888888888",
  ran_at: "2025-04-12T10:00:00Z",
  state: "rechecked",
  reason: undefined,
  projects: [project({ restricted: 4, comments_hidden: 2, gone_or_hidden: 1, gone_or_hidden_tasks: [GONE] })],
}

function access(imports: ImportAccess[]) {
  answers.set(IMPORT_ACCESS_KEY, { imports })
}

// An import's button by its verb and name (its date is pinned on its own below).
const REVIEW_WAITING = /^Review Jira · acme\.atlassian\.net/
const SEE_CHECKED = /^See Jira · acme\.atlassian\.net/

// Each line a project's state can show; one at most is shown.
const STATE_LINES = [
  "Not re-checked yet.",
  "Re-checked in part.",
  "Not re-checked, kept as it is.",
  "Re-checked in part, then kept as it is.",
  "Its tasks are kept to the project's admins.",
  "Put back as it was, where nobody had changed it since.",
  "Being re-checked…",
  "Nothing here needed changing.",
]

/** An import whose one project stands where `state` says, with `counts`. */
const standing = (state: ImportAccessState, counts: Partial<ImportAccessProject> = {}): ImportAccess => ({
  ...WAITING,
  state,
  reason: state === "needs_admin" ? "no_connection" : undefined,
  projects: [project({ state, ...counts })],
})

async function open(name: string | RegExp) {
  await act(async () => fireEvent.click(screen.getByRole("button", { name })))
  return screen.findByRole("dialog")
}

describe("Admin > Import and export: earlier imports re-checked", () => {
  afterEach(() => {
    cleanup()
    answers.clear()
    failures.clear()
    svc.chooseForImportAccess.mockReset()
    confirm.mockReset()
    toast.mockReset()
    appMutate.mockClear()
    mutate.mockReset()
  })

  it("draws nothing while it loads, nor when no earlier import was re-checked", () => {
    const { container, rerender } = render(<ImportAccessCard />)
    expect(container).toBeEmptyDOMElement()
    access([])
    rerender(<ImportAccessCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it("says what failed, with a way to try again, when the list can't load", () => {
    failures.add(IMPORT_ACCESS_KEY)
    render(<ImportAccessCard />)
    fireEvent.click(screen.getByRole("button", { name: /try again/i }))
    expect(mutate).toHaveBeenCalled()
  })

  it("lists each import by its tool and site, who ran it and where it stands", () => {
    access([WAITING, CHECKED])
    render(<ImportAccessCard />)
    const rows = within(screen.getByRole("list", { name: "Earlier imports re-checked" })).getAllByRole("listitem")
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain("Jira · acme.atlassian.net")
    expect(rows[0].textContent).toContain("Imported by Ada on 3 May · 2 projects")
    expect(rows[0].textContent).toContain("Needs you")
    expect(rows[1].textContent).toContain("Imported by Ada on 12 Apr 2025 · 1 project")
    expect(rows[1].textContent).toContain("Re-checked")
    expect(screen.getByText(/1 needs you/).textContent).toBe(
      "Each was re-checked against its tool with the connection it was made with, where that still works. 1 needs you: choose what happens to it.",
    )
  })

  it("offers an import that waits for an admin a re-check with their own connection, keeping it, or keeping it to admins", async () => {
    access([WAITING])
    render(<ImportAccessCard />)
    const sheet = await open(REVIEW_WAITING)
    expect(within(sheet).getByText(/has no Jira connection here/)).toBeTruthy()
    expect(within(sheet).getByText("Archived")).toBeTruthy()
    for (const name of ["Keep to admins", "Keep as it is", "Re-check with my connection"]) {
      expect(within(sheet).getByRole("button", { name })).toBeTruthy()
    }
    expect(within(sheet).queryByRole("button", { name: "Undo changes" })).toBeNull()

    svc.chooseForImportAccess.mockResolvedValue("Kept as it is.")
    confirm.mockImplementation((q: { onConfirm(): unknown }) => q.onConfirm())
    await act(async () => fireEvent.click(within(sheet).getByRole("button", { name: "Keep as it is" })))
    expect(confirm.mock.calls[0][0].title).toBe("Keep it as it is?")
    expect(svc.chooseForImportAccess).toHaveBeenCalledWith(WAITING.import_id, "keep")
    expect(toast).toHaveBeenCalledWith({ title: "Kept as it is." })
    expect(appMutate).toHaveBeenCalledWith(IMPORT_ACCESS_KEY)
  })

  it("re-checks at once, and says in the sheet why the server refused", async () => {
    access([WAITING])
    render(<ImportAccessCard />)
    const sheet = await open(REVIEW_WAITING)
    svc.chooseForImportAccess.mockRejectedValue({ isAxiosError: true, response: { status: 409, data: { msg: "Connect the import's tool as yourself first." } } })
    await act(async () => fireEvent.click(within(sheet).getByRole("button", { name: "Re-check with my connection" })))
    expect(confirm).not.toHaveBeenCalled()
    expect(svc.chooseForImportAccess).toHaveBeenCalledWith(WAITING.import_id, "recheck")
    expect(within(sheet).getByRole("alert").textContent).toBe("Connect the import's tool as yourself first.")
    expect(appMutate).toHaveBeenCalledWith(IMPORT_ACCESS_KEY)
  })

  it("shows a re-check busy while it runs, and holds the other choices until it's answered", async () => {
    access([WAITING])
    render(<ImportAccessCard />)
    const sheet = await open(REVIEW_WAITING)
    let answer: (words: string) => void = () => {}
    svc.chooseForImportAccess.mockReturnValue(new Promise<string>((resolve) => (answer = resolve)))
    await act(async () => fireEvent.click(within(sheet).getByRole("button", { name: "Re-check with my connection" })))
    const recheck = within(sheet).getByRole("button", { name: "Re-check with my connection" })
    expect(recheck).toHaveAttribute("aria-busy", "true")
    expect(recheck).toBeEnabled()
    for (const name of ["Keep to admins", "Keep as it is"]) expect(within(sheet).getByRole("button", { name })).toBeDisabled()
    await act(async () => answer("Re-checked."))
    expect(toast).toHaveBeenCalledWith({ title: "Re-checked." })
  })

  it("shows what a re-check changed, opens its listed tasks by id only, and offers its undo", async () => {
    access([CHECKED])
    render(<ImportAccessCard />)
    expect(screen.getByText("Each was re-checked against its tool with the connection it was made with, where that still works.")).toBeTruthy()
    const sheet = await open(SEE_CHECKED)
    expect(within(sheet).getByText("4 tasks kept to the people Jira lets in")).toBeTruthy()
    expect(within(sheet).getByText("2 comments hidden")).toBeTruthy()
    const listed = within(sheet).getByRole("list", { name: "1 task Jira no longer shows whoever ran it, left as it was" })
    expect(within(listed).getByRole("link", { name: "Task 1" }).getAttribute("href")).toBe(`/app/task/${GONE}`)
    expect(within(sheet).getByRole("button", { name: "Undo changes" })).toBeTruthy()
    expect(within(sheet).queryByRole("button", { name: "Keep as it is" })).toBeNull()
  })

  it("words each reason, each count and each list; failed tasks only when they keep failing", () => {
    expect(reasonWords("owner_gone", "jira")).toBe("Whoever ran it has left, so it couldn't be re-checked.")
    expect(reasonWords("other_source", "jira")).toBe("The Jira connection it was made with now reaches a different site.")
    expect(countLines(project({ unassigned: 1, opened_since: 2 }), "jira")).toEqual([
      "1 assignee taken off a task they can't see",
      "2 tasks someone opened since, left open",
    ])
    expect(taskLists(project({ failed: [GONE], creator_outside: 1, creator_outside_tasks: [GONE] }), "jira").map((l) => l.label)).toEqual([
      "1 task made by someone Jira doesn't let in",
      "1 task kept failing to re-check",
    ])
    const fifty = Array.from({ length: 50 }, (_, i) => `b${String(i).padStart(7, "0")}-1111-4111-8111-111111111111`)
    expect(taskLists(project({ assignee_outside: 1200, assignee_outside_tasks: fifty }), "jira").map((l) => l.label)).toEqual([
      "1,200 tasks assigned to someone Jira doesn't let in · the first 50 listed",
    ])
    expect(importLine({ ...WAITING, state: "kept", decided_by: "Ana" })).toBe("Kept as it is by Ana.")
    expect(importLine(CHECKED)).toBe("Re-checked against Jira with the connection it was made with.")
    expect(importLine({ ...CHECKED, decided_by: "Ana" })).toBe("Re-checked against Jira with Ana's connection.")
  })

  it("words one task's count and list as one, and more as more", () => {
    const three = [GONE, "a2222222-2222-4222-8222-222222222222", "a3333333-3333-4333-8333-333333333333"]
    expect(countLines(project({ already_restricted: 1 }), "jira")).toEqual(["1 task someone here had restricted already, left as it was"])
    expect(countLines(project({ already_restricted: 3 }), "jira")).toEqual(["3 tasks someone here had restricted already, left as they were"])
    expect(taskLists(project({ gone_or_hidden: 1, gone_or_hidden_tasks: [GONE] }), "jira").map((l) => l.label)).toEqual([
      "1 task Jira no longer shows whoever ran it, left as it was",
    ])
    expect(taskLists(project({ gone_or_hidden: 3, gone_or_hidden_tasks: three }), "jira").map((l) => l.label)).toEqual([
      "3 tasks Jira no longer shows whoever ran it, left as they were",
    ])
  })

  it("tells two imports of one site apart by their date, on their buttons and in their sheets", async () => {
    access([WAITING, { ...WAITING, import_id: "77777777-7777-4777-8777-777777777777", ran_at: "2026-03-02T10:00:00Z" }, CHECKED])
    render(<ImportAccessCard />)
    for (const name of [
      "Review Jira · acme.atlassian.net, imported 3 May",
      "Review Jira · acme.atlassian.net, imported 2 Mar",
      "See Jira · acme.atlassian.net, imported 12 Apr 2025",
    ]) {
      expect(screen.getByRole("button", { name })).toBeTruthy()
    }
    const sheet = await open("Review Jira · acme.atlassian.net, imported 2 Mar")
    expect(sheet).toHaveAccessibleDescription("Imported by Ada on 2 Mar. Whoever ran it has no Jira connection here, so it couldn't be re-checked.")
  })

  // A project's line follows where it stands: "Nothing here needed changing" is only a re-checked project's with
  // nothing changed, and an undone project's counts, which say what was put back, aren't shown as if they held.
  it.each<[string, ImportAccessState, Partial<ImportAccessProject>, string | null, string[], string[]]>([
    ["waiting for an admin, not re-checked yet", "needs_admin", {}, "Not re-checked yet.", [], []],
    [
      "waiting for an admin after part of its re-check",
      "needs_admin",
      { restricted: 2, failed: [GONE] },
      "Re-checked in part.",
      ["2 tasks kept to the people Jira lets in", "1 task kept failing to re-check"],
      [],
    ],
    ["kept as it is without a re-check", "kept", {}, "Not re-checked, kept as it is.", [], []],
    ["kept as it is after part of its re-check", "kept", { restricted: 2 }, "Re-checked in part, then kept as it is.", ["2 tasks kept to the people Jira lets in"], []],
    ["kept to its admins", "contained", {}, "Its tasks are kept to the project's admins.", [], []],
    [
      "whose re-check was undone",
      "undone",
      { restricted: 4, comments_hidden: 2 },
      "Put back as it was, where nobody had changed it since.",
      [],
      ["4 tasks kept to the people Jira lets in", "2 comments hidden"],
    ],
    ["being re-checked, with what it did so far", "rechecking", { restricted: 1 }, "Being re-checked…", ["1 task kept to the people Jira lets in"], []],
    ["re-checked with nothing to change", "rechecked", {}, "Nothing here needed changing.", [], []],
    ["re-checked with changes", "rechecked", { restricted: 4 }, null, ["4 tasks kept to the people Jira lets in"], []],
  ])("words a project %s by where it stands", async (_, state, counts, line, shown, hidden) => {
    access([standing(state, counts)])
    render(<ImportAccessCard />)
    const sheet = await open(state === "needs_admin" ? REVIEW_WAITING : SEE_CHECKED)
    const block = sheet.querySelector<HTMLElement>("[data-access-project]")
    expect(block).not.toBeNull()
    for (const words of STATE_LINES) {
      if (words === line) expect(within(block!).getByText(words)).toBeTruthy()
      else expect(within(block!).queryByText(words)).toBeNull()
    }
    for (const words of shown) expect(within(block!).getByText(words)).toBeTruthy()
    for (const words of hidden) expect(within(block!).queryByText(words)).toBeNull()
  })
})
