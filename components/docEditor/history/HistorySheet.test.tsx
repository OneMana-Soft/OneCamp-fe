import * as React from "react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

// Version history (B8): a sheet of every version kept, in days, beside a
// read-only preview; changes marked against the version before or the doc
// now; a version named, pinned and restored, live. Errors are said as errors.

const answers = new Map<string, unknown>()
const mutate = vi.fn(async () => undefined)
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => {
    const a = key ? answers.get(key) : undefined
    if (a === "loading") return { data: undefined, isLoading: true, isError: undefined, mutate }
    if (a instanceof Error) return { data: undefined, isLoading: false, isError: a, mutate }
    return { data: a, isLoading: false, isError: undefined, mutate }
  },
  useFetchOnlyOnce: () => ({ data: undefined, isLoading: false, mutate }),
}))
const post = vi.fn()
vi.mock("@/lib/axiosInstance", () => ({ default: { post: (...a: unknown[]) => post(...a), get: vi.fn() } }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
const media = { isMobile: false, isTablet: false, isDesktop: true }
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => media }))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a), useToast: () => ({ toast }) }))

import { TooltipProvider } from "@/components/ui/tooltip"
import HistorySheet from "./HistorySheet"
import { forgetMadeVersions } from "./preview/materialize"
import { versionBodyKey, versionsKey } from "./versions"

const DOC = "d1"
const today = (h: number, m = 0) => {
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

function answer(versions: unknown[], bodies: Record<string, string>) {
  answers.set(versionsKey(DOC), { data: { versions, people: { maya: { name: "Maya Chen" }, sam: { name: "Sam Rivera" }, rc: { name: "Release Captain" } } } })
  for (const [id, html] of Object.entries(bodies)) answers.set(versionBodyKey(DOC, id), { data: { html } })
  answers.set(`/doc/getDocInfo/${DOC}`, { data: { doc_title: "Launch plan" } })
}

const V2 = { id: "v2", kind: "doc", pinned: false, reason: "interval", created_at: today(10, 30), contributors: [{ user_uuid: "maya" }, { agent_uuid: "rc", asker_uuid: "sam" }] }
const V1 = { id: "v1", kind: "doc", pinned: true, name: "Sent to Acme", reason: "saved", created_at: today(9, 5), contributors: [{ user_uuid: "sam" }] }

const sheet = () =>
  render(
    <TooltipProvider>
      <HistorySheet docId={DOC} onClose={() => {}} />
    </TooltipProvider>,
  )

// The diff loads when changes are turned on, and a version is drawn in
// slices: both here before the tests, and waited for longer than a second,
// which a full parallel run on a loaded machine took.
configure({ asyncUtilTimeout: 5000 })
beforeAll(async () => {
  await import("./diff")
})

beforeEach(() => {
  media.isMobile = false
  answer([V2, V1], {
    v2: '<p data-block-id="a">We ship on Friday</p><p data-block-id="b">Owners: Sam</p>',
    v1: '<p data-block-id="a">We ship on Thursday</p><p data-block-id="b">Owners: Sam</p>',
  })
})

afterEach(() => {
  cleanup()
  answers.clear()
  post.mockReset()
  toast.mockReset()
  mutate.mockClear()
  forgetMadeVersions()
  localStorage.clear()
})

describe("version history", () => {
  it("lists every version in days, names a named one, and credits an agent with who asked it", async () => {
    sheet()
    const rail = await screen.findByRole("listbox", { name: "Versions" })
    expect(within(rail).getByRole("group", { name: "Today" })).toBeTruthy()
    const options = within(rail).getAllByRole("option")
    expect(options).toHaveLength(2)
    expect(options[0].getAttribute("aria-selected")).toBe("true")
    expect(options[0].textContent).toContain("Maya Chen and Release Captain for Sam Rivera")
    expect(options[1].textContent).toContain("Sent to Acme")
    expect(options[1].textContent).toContain("pinned")
  })

  it("shows the chosen version read-only in the doc's type, and another when ↓ is pressed", async () => {
    sheet()
    const preview = await waitFor(() => {
      const el = document.querySelector<HTMLElement>(".history-preview")!
      expect(el.textContent).toContain("We ship on Friday")
      return el
    })
    expect(preview.closest(".doc-editor")).toBeTruthy()
    expect(preview.getAttribute("contenteditable")).toBeNull()
    const [first] = screen.getAllByRole("option")
    fireEvent.keyDown(first, { key: "ArrowDown" })
    await waitFor(() => expect(document.querySelector(".history-preview")!.textContent).toContain("We ship on Thursday"))
    expect(screen.getAllByRole("option")[1].getAttribute("aria-selected")).toBe("true")
  })

  it("marks what changed since the version before, in words", async () => {
    sheet()
    await screen.findByText("We ship on Friday")
    fireEvent.click(screen.getByRole("switch", { name: "Show changes" }))
    await waitFor(() => expect(document.querySelector("del.history-del")?.textContent).toBe("Thursday"))
    expect(document.querySelector("ins.history-ins")?.textContent).toBe("Friday")
    await waitFor(() => expect(document.querySelector("[data-diff-summary]")!.textContent).toBe("1 word added and 1 removed since the version before"))
    // Remembered for the next time the sheet opens.
    expect(localStorage.getItem("oc.history.showChanges")).toBe("1")
  })

  it("says the version before couldn't be read, with Try again, and never 'Comparing…' for ever", async () => {
    answers.set(versionBodyKey(DOC, "v1"), new Error("Network Error"))
    sheet()
    await screen.findByText("We ship on Friday")
    fireEvent.click(screen.getByRole("switch", { name: "Show changes" }))
    await waitFor(() => expect(document.querySelector("[data-diff-summary]")!.textContent).toContain("Couldn't read the version before."))
    // The version itself still reads, plain.
    expect(document.querySelector(".history-preview")!.textContent).toContain("We ship on Friday")
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(mutate).toHaveBeenCalled()
  })

  it("says the oldest version has nothing before it", async () => {
    sheet()
    await screen.findByText("We ship on Friday")
    fireEvent.click(screen.getByRole("switch", { name: "Show changes" }))
    fireEvent.click(screen.getAllByRole("option")[1])
    await waitFor(() => expect(document.querySelector("[data-diff-summary]")!.textContent).toBe("This is the oldest version kept, so nothing comes before it"))
  })

  it("asks before a restore, and restores live through the versions API", async () => {
    const closed = vi.fn()
    render(
      <TooltipProvider>
        <HistorySheet docId={DOC} onClose={closed} />
      </TooltipProvider>,
    )
    await screen.findByText("We ship on Friday")
    fireEvent.click(document.querySelector("[data-restore-version]")!)
    const ask = await screen.findByRole("alertdialog")
    expect(ask.textContent).toContain("for everyone, at once")
    expect(post).not.toHaveBeenCalled()
    post.mockResolvedValue({ data: { msg: "Restored" } })
    await act(async () => {
      fireEvent.click(within(ask).getByRole("button", { name: "Restore version" }))
    })
    expect(post).toHaveBeenCalledWith("/doc/versions/v2/restore", { doc_uuid: DOC }, { suppressErrorToast: true })
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/^Restored the version from today, /) }))
    await waitFor(() => expect(closed).toHaveBeenCalled())
  })

  it("says inside the question why a restore failed, and keeps the sheet", async () => {
    sheet()
    await screen.findByText("We ship on Friday")
    fireEvent.click(document.querySelector("[data-restore-version]")!)
    const ask = await screen.findByRole("alertdialog")
    post.mockRejectedValue({ response: { status: 503, data: { msg: "The doc can't be restored just now. Try again in a moment." } } })
    await act(async () => {
      fireEvent.click(within(ask).getByRole("button", { name: "Restore version" }))
    })
    expect(screen.getByRole("alertdialog").textContent).toContain("The doc can't be restored just now. Try again in a moment.")
  })

  it("names a version in place, and pins one", async () => {
    sheet()
    await screen.findByText("We ship on Friday")
    fireEvent.click(screen.getByRole("button", { name: "Name" }))
    const field = screen.getByRole("textbox", { name: "The version's name" })
    fireEvent.change(field, { target: { value: "Before the review" } })
    post.mockResolvedValue({ data: { msg: "Success" } })
    await act(async () => {
      fireEvent.submit(field.closest("form")!)
    })
    expect(post).toHaveBeenCalledWith("/doc/versions/v2/name", { doc_uuid: DOC, name: "Before the review", pinned: false }, { suppressErrorToast: true })
    expect(mutate).toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pin" }))
    })
    expect(post).toHaveBeenLastCalledWith("/doc/versions/v2/name", { doc_uuid: DOC, name: "", pinned: true }, { suppressErrorToast: true })
  })

  it("says why a pin was refused", async () => {
    sheet()
    await screen.findByText("We ship on Friday")
    post.mockRejectedValue({ response: { status: 409, data: { msg: "This doc keeps as many named and pinned versions as it has room for. Unpin one first." } } })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pin" }))
    })
    expect(screen.getByRole("alert").textContent).toBe("This doc keeps as many named and pinned versions as it has room for. Unpin one first.")
  })

  it("says a history that failed to load failed, never that there are no versions", async () => {
    answers.set(versionsKey(DOC), new Error("Network Error"))
    sheet()
    expect(await screen.findByText("Couldn't load this doc's history")).toBeTruthy()
    expect(screen.queryByText("No versions yet")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(mutate).toHaveBeenCalled()
  })

  it("says a doc with no versions has none, and how they come", async () => {
    answer([], {})
    sheet()
    expect(await screen.findByRole("heading", { name: "No versions yet" })).toBeTruthy()
  })

  it("keeps the doc as it is now, with a name", async () => {
    sheet()
    await screen.findByText("We ship on Friday")
    fireEvent.click(screen.getByRole("button", { name: "Save version" }))
    const name = await screen.findByPlaceholderText("Name it, if you like")
    fireEvent.change(name, { target: { value: "Signed off" } })
    post.mockResolvedValue({ data: { data: { ...V2, id: "v3", name: "Signed off" } } })
    await act(async () => {
      fireEvent.submit(name.closest("form")!)
    })
    expect(post).toHaveBeenCalledWith("/doc/versions", { doc_uuid: DOC, name: "Signed off", pinned: false }, { suppressErrorToast: true })
    expect(toast).toHaveBeenCalledWith({ title: 'Saved "Signed off"' })
  })

  it("is a sheet on a phone: the list, then a version with Restore at its foot", async () => {
    media.isMobile = true
    sheet()
    const rail = await screen.findByRole("listbox", { name: "Versions" })
    fireEvent.click(within(rail).getAllByRole("option")[1])
    await screen.findByText("We ship on Thursday")
    expect(screen.getByRole("button", { name: "Versions" })).toBeTruthy()
    expect(document.querySelector("[data-restore-version]")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Versions" }))
    expect(await screen.findByRole("listbox", { name: "Versions" })).toBeTruthy()
  })
})
