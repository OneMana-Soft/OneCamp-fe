import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { putOnScreen, SCREENS } from "@/lib/testing/screens"

// jira-01 J-H web: a task's links in its panel. The server sends each link in
// its words ("is duplicated by") with the other task as the reader may see it.

type Read = { data?: unknown; isLoading?: boolean; isError?: unknown }
const s = vi.hoisted(() => ({
  reads: {} as Record<string, Read>,
  asked: [] as string[],
  // Each read's request config, as the app sends it (OWN_ERRORS: the screen says a failure itself, so no toast says it twice).
  config: {} as Record<string, unknown>,
  mutate: vi.fn(async () => undefined),
  post: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ data: { msg: "Saved." } })),
  toast: vi.fn(),
}))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string, _shape?: unknown, _fetch?: unknown, request?: unknown) => {
    if (url) s.asked.push(url)
    if (url) s.config[url] = request
    return { data: undefined, isLoading: false, isError: undefined, ...s.reads[url], mutate: s.mutate }
  },
}))
vi.mock("@/hooks/useProjectStatuses", () => ({ useProjectStatuses: () => ({ options: [] }) }))
vi.mock("@/hooks/use-toast", () => ({ toast: s.toast }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: s.post } }))

const { TaskLinks } = await import("@/components/task/TaskLinks")

const task = (uuid: string, name: string, key: string, status = "todo") => ({ uuid, name, key, status, project_uuid: "p" })
const LINKS = {
  links: [
    { kind: "relates", direction: "out", label: "relates to", task: task("b", "Book the venue", "SF-2") },
    { kind: "duplicates", direction: "in", label: "is duplicated by", task: task("c", "Venue booking", "SF-3", "done") },
  ],
  count: 2,
}
const PROJECT = {
  data: {
    tasks: [
      { task_uuid: "a", task_name: "Plan the fair", task_status: "todo", task_key: "SF-1" },
      { task_uuid: "d", task_name: "Print the flyers", task_status: "todo", task_key: "SF-4" },
      { task_uuid: "e", task_name: "Hire the band", task_status: "todo", task_key: "SF-5" },
    ],
    total: 2,
    can_edit: true,
    project_access: {},
  },
}

const panel = (canEdit: boolean, onOpen = vi.fn()) => render(<TaskLinks taskUUID="a" projectUUID="p" canEdit={canEdit} onOpen={onOpen} />)

afterEach(() => {
  cleanup()
  s.reads = {}
  s.asked = []
  s.config = {}
  vi.clearAllMocks()
})

describe("a task's links (J-H web)", () => {
  it("F1 reads each link in the server's words, with the other task's key, name and status, and opens it", () => {
    s.reads["/task/a/links"] = { data: LINKS }
    const onOpen = vi.fn()
    panel(false, onOpen)
    expect(s.asked).toContain("/task/a/links")
    expect(screen.getByText("relates to")).toBeTruthy()
    expect(screen.getByText("is duplicated by")).toBeTruthy()
    expect(screen.getByText("SF-2")).toBeTruthy()
    expect(screen.getByText("SF-3")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Book the venue" }))
    expect(onOpen).toHaveBeenCalledWith("b")
  })

  it("F2 a reader who may not change the task sees the links and no way to add or take one off", () => {
    s.reads["/task/a/links"] = { data: LINKS }
    panel(false)
    expect(screen.queryByRole("button", { name: "Link a task" })).toBeNull()
    expect(screen.queryByRole("button", { name: /^Take off/ })).toBeNull()
    cleanup()
    s.reads["/task/a/links"] = { data: { links: [], count: 0 } }
    panel(false)
    expect(screen.getByText("It isn't linked to another task.")).toBeTruthy()
  })

  it("F3 taking a link off asks the server's soft remove, with the link's kind and direction", async () => {
    s.reads["/task/a/links"] = { data: LINKS }
    panel(true)
    fireEvent.click(screen.getByRole("button", { name: 'Take off "is duplicated by Venue booking"' }))
    await waitFor(() => expect(s.post).toHaveBeenCalledWith("/task/link/delete", { task_uuid: "a", other_task_uuid: "c", kind: "duplicates", direction: "in" }, expect.anything()))
    await waitFor(() => expect(s.mutate).toHaveBeenCalled())
  })

  it("F4 links a task of its project the way picked: how it links over the shared task picker, and the pick links it", async () => {
    s.reads["/task/a/links"] = { data: { links: [], count: 0 } }
    s.reads["/project/p/timeline"] = { data: PROJECT }
    panel(true)
    fireEvent.click(screen.getByRole("button", { name: "Link a task" }))
    const pick = await screen.findByRole("option", { name: /Print the flyers/ })
    // Each row says its key.
    expect(pick.textContent).toContain("SF-4")
    expect(s.asked).toContain("/project/p/timeline")
    // Never the task itself.
    expect(screen.queryByRole("option", { name: /Plan the fair/ })).toBeNull()
    expect(screen.getByText(/Blocking isn't a link: add it under Dependencies/)).toBeTruthy()
    fireEvent.click(screen.getByRole("radio", { name: "is duplicated by" }))
    expect(s.post).not.toHaveBeenCalled()
    // The server takes it, and the links read again hold it.
    const made = { kind: "duplicates", direction: "in", label: "is duplicated by", task: task("d", "Print the flyers", "SF-4") }
    s.mutate.mockImplementationOnce(async () => {
      s.reads["/task/a/links"] = { data: { links: [made], count: 1 } }
    })
    fireEvent.click(pick)
    await waitFor(() => expect(s.post).toHaveBeenCalledWith("/task/link", { task_uuid: "a", other_task_uuid: "d", kind: "duplicates", direction: "in" }, expect.anything()))
    // A link that holds closes the picker (a refused one keeps it open, F5), and the new row shows.
    await waitFor(() => expect(screen.queryByRole("radiogroup", { name: "How it links" })).toBeNull())
    expect(screen.queryAllByRole("option")).toHaveLength(0)
    expect(screen.getByRole("button", { name: 'Take off "is duplicated by Print the flyers"' })).toBeTruthy()
  })

  it("F5 a refused link says the server's words, the 201st among them", async () => {
    s.reads["/task/a/links"] = { data: { links: [], count: 0 } }
    s.reads["/project/p/timeline"] = { data: PROJECT }
    const words = "A task holds at most 200 links: take one off first."
    s.post.mockRejectedValueOnce(Object.assign(new Error("Request failed with status code 400"), { isAxiosError: true, response: { status: 400, data: { msg: words } } }))
    panel(true)
    fireEvent.click(screen.getByRole("button", { name: "Link a task" }))
    fireEvent.click(await screen.findByRole("option", { name: /Print the flyers/ }))
    await waitFor(() => expect(s.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "The link wasn't made", description: words })))
    // The picker stays open, so another task can be picked.
    expect(screen.getByRole("option", { name: /Print the flyers/ })).toBeTruthy()
    expect(screen.getByRole("radiogroup", { name: "How it links" })).toBeTruthy()
  })

  it("F6 a read that fails says so where the links go, with the shared Try again", () => {
    s.reads["/task/a/links"] = { isError: new Error("Network Error") }
    panel(true)
    const retry = screen.getByRole("button", { name: /Couldn't load the linked tasks\. Try again/ })
    expect(retry.hasAttribute("data-part-failed")).toBe(true)
    fireEvent.click(retry)
    expect(s.mutate).toHaveBeenCalled()
  })

  it("F10 the picker's read of the project's tasks says a failure itself: the compact error with Try again, and no toast", async () => {
    s.reads["/task/a/links"] = { data: { links: [], count: 0 } }
    s.reads["/project/p/timeline"] = { isError: new Error("Network Error") }
    panel(true)
    fireEvent.click(screen.getByRole("button", { name: "Link a task" }))
    expect(await screen.findByText("Couldn't load this project's tasks")).toBeTruthy()
    // Read with OWN_ERRORS (the shared read, useProjectTaskChoices), so the app's toast for a failed read stays quiet.
    expect(s.config["/project/p/timeline"]).toEqual({ suppressErrorToast: true })
    expect(s.toast).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(s.mutate).toHaveBeenCalled()
  })

  it("F11 on a touch screen wide enough for the popover (a tablet), the picker takes the focus itself, so no keyboard rises", async () => {
    const undo = putOnScreen(SCREENS["a tablet"])
    try {
      s.reads["/task/a/links"] = { data: { links: [], count: 0 } }
      s.reads["/project/p/timeline"] = { data: PROJECT }
      panel(true)
      fireEvent.click(screen.getByRole("button", { name: "Link a task" }))
      await screen.findByRole("option", { name: /Print the flyers/ })
      // A popover, not a sheet, whose filter waits to be tapped: the menu itself has the focus, as every combobox's does under a finger.
      const menu = screen.getByRole("dialog", { name: "A task in this project" })
      await waitFor(() => expect(document.activeElement).toBe(menu))
      expect(document.activeElement).not.toBe(screen.getByPlaceholderText("Find a task in this project"))
    } finally {
      undo()
    }
  })

  it("F8 a row's key typed in the filter finds that row and drops the others", async () => {
    s.reads["/task/a/links"] = { data: { links: [], count: 0 } }
    s.reads["/project/p/timeline"] = { data: PROJECT }
    panel(true)
    fireEvent.click(screen.getByRole("button", { name: "Link a task" }))
    await screen.findByRole("option", { name: /Hire the band/ })
    fireEvent.change(screen.getByPlaceholderText("Find a task in this project"), { target: { value: "SF-4" } })
    await waitFor(() => expect(screen.queryByRole("option", { name: /Hire the band/ })).toBeNull())
    expect(screen.getByRole("option", { name: /Print the flyers/ })).toBeTruthy()
  })

  it("F9 opened by a mouse or the keyboard, the picker puts the focus in its filter, the way to link a Shift+Tab back", async () => {
    s.reads["/task/a/links"] = { data: { links: [], count: 0 } }
    s.reads["/project/p/timeline"] = { data: PROJECT }
    panel(true)
    fireEvent.click(screen.getByRole("button", { name: "Link a task" }))
    await screen.findByRole("option", { name: /Print the flyers/ })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByPlaceholderText("Find a task in this project")))
  })

  it("F7 how it links is one row of the shared chips, the pick in the brand tint, and the arrows move it, never the list row", async () => {
    s.reads["/task/a/links"] = { data: { links: [], count: 0 } }
    s.reads["/project/p/timeline"] = { data: PROJECT }
    panel(true)
    fireEvent.click(screen.getByRole("button", { name: "Link a task" }))
    const pick = await screen.findByRole("option", { name: /Print the flyers/ })
    const group = screen.getByRole("radiogroup", { name: "How it links" })
    const ways = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]'))
    expect(ways.map((w) => w.textContent)).toEqual(["relates to", "duplicates", "is duplicated by", "clones", "is cloned by"])
    // Chips, never a radio's circle over the to-do glyphs of the rows below.
    for (const w of ways) expect(w.hasAttribute("data-chip")).toBe(true)
    expect(group.querySelector("svg")).toBeNull()
    const relates = screen.getByRole("radio", { name: "relates to" })
    expect(relates.getAttribute("aria-checked")).toBe("true")
    expect(relates.className).toContain("bg-brand-muted")
    // An arrow in the head picks the next way and never moves the list's lit row (cmdk passes over a key marked used).
    const lit = () => document.querySelector('[cmdk-item][data-selected="true"]')?.textContent ?? null
    const before = lit()
    act(() => relates.focus())
    fireEvent.keyDown(relates, { key: "ArrowDown" })
    await waitFor(() => expect(screen.getByRole("radio", { name: "duplicates" }).getAttribute("aria-checked")).toBe("true"))
    expect(lit()).toBe(before)
    for (const [key, way] of [["End", "is cloned by"], ["ArrowUp", "clones"], ["Home", "relates to"], ["ArrowRight", "duplicates"]] as const) {
      fireEvent.keyDown(document.activeElement!, { key })
      await waitFor(() => expect(screen.getByRole("radio", { name: way }).getAttribute("aria-checked")).toBe("true"))
      expect(lit()).toBe(before)
    }
    // Enter on a way picks no task: an Enter that reached the list would link its lit row.
    fireEvent.keyDown(document.activeElement!, { key: "Enter" })
    await act(() => new Promise((r) => setTimeout(r, 50)))
    expect(s.post).not.toHaveBeenCalled()
    expect(screen.getByRole("option", { name: /Print the flyers/ })).toBeTruthy()
    fireEvent.click(pick)
    await waitFor(() => expect(s.post).toHaveBeenCalledWith("/task/link", { task_uuid: "a", other_task_uuid: "d", kind: "duplicates", direction: "out" }, expect.anything()))
  })
})
