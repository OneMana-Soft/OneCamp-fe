// Presenter notes (miro-28 2a): an editor writes a frame's notes from its row in the Frames panel (a popover on a
// computer, a drawer on a phone); the presenter sees the slide's notes while presenting (the outline's foot on a
// computer; on a phone a drawer from Notes in the Presenting pill, so the slide bar keeps the slide's name), and the
// audience never does: followers, view-only members and share-link guests make no notes request at all. A stale write
// says "Someone else changed these notes" and keeps the person's text, its two choices then the only actions. On a phone
// a drawer's actions sit in its pinned footer.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as React from "react"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import * as Y from "yjs"
import { boardScene, type TestElement } from "@/lib/testing/boardScene"

// The board's one read of its notes, as SWR would hold it, and every URL asked for ("" asks nothing).
const net = vi.hoisted(() => ({
  urls: [] as string[],
  list: [] as { frame_id: string; body: string; version: number }[],
  failed: false,
  offline: false,
  retried: 0,
  post: vi.fn(),
}))
vi.mock("@/hooks/useFetch", async () => {
  const React = await import("react")
  return {
    useFetch: (url: string) => {
      net.urls.push(url)
      const [data, setData] = React.useState<{ data: typeof net.list } | undefined>(() => (url && !net.failed ? { data: net.list } : undefined))
      const mutate = (next?: unknown) => {
        if (typeof next === "function") setData((d) => (next as (d: unknown) => typeof data)(d))
        else net.retried++
      }
      return { data, isLoading: false, isError: url && net.failed ? new Error("down") : undefined, mutate }
    },
  }
})
vi.mock("@/lib/connectivity", () => ({ isAppOffline: () => net.offline, subscribeConnectivity: () => () => {} }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: net.post, isSubmitting: false }) }))
let mobile = false
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: mobile, isDesktop: !mobile }) }))

import FramesPanel from "./framesPanel"
import BoardSlides from "./boardSlides"
import WithFrameNotes from "./frameNotesReads"
import { frameElement } from "./boardOps"

const NOTES_URL = "/board/getFrameNotes/b1"
const answered = (status: number, data: unknown) => Object.assign(new Error("Request failed"), { isAxiosError: true, response: { status, data } })

function scene() {
  const f = (id: string, x: number, name: string) => frameElement({ id, x, y: 0, width: 800, height: 450, name }) as TestElement
  return boardScene([f("f1", 0, "Goals"), f("f2", 1000, "Ideas")], { zoom: { value: 1 }, scrollX: 0, scrollY: 0, width: 1280, height: 800 })
}
const provider = () => ({ document: new Y.Doc() }) as never as import("@hocuspocus/provider").HocuspocusProvider

beforeEach(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: mobile, media: q, addEventListener: () => {}, removeEventListener: () => {} }))
  net.urls = []
  net.list = [{ frame_id: "f2", body: "Open with the numbers", version: 3 }]
  net.failed = false
  net.offline = false
  net.retried = 0
  net.post.mockReset()
})
afterEach(() => {
  cleanup()
  mobile = false
})

// Each URL asked for once, however often the reader renders.
const asked = () => [...new Set(net.urls.filter((u) => u.includes("getFrameNotes")))]

function panel(editable = true) {
  render(<FramesPanel api={scene().api} provider={provider()} boardId="b1" editable={editable} frameNotes={WithFrameNotes} onClose={vi.fn()} />)
}

describe("an editor's notes in the Frames panel", () => {
  it("writes a frame's notes from its row, saving the version it read", async () => {
    net.post.mockResolvedValue({ frame_id: "f1", body: "Say hello", version: 1 })
    panel()
    expect(asked()).toEqual([NOTES_URL])
    fireEvent.click(screen.getByRole("button", { name: "Add notes for Goals" }))
    const field = await screen.findByRole("textbox", { name: "Presenter notes" })
    fireEvent.change(field, { target: { value: "Say hello" } })
    fireEvent.click(screen.getByRole("button", { name: "Save notes" }))
    await waitFor(() => expect(net.post).toHaveBeenCalledWith(expect.objectContaining({ apiEndpoint: "/board/saveFrameNote", payload: { board_uuid: "b1", frame_id: "f1", body: "Say hello", version: 0 }, quiet: true })))
    expect(await screen.findByText("Saved")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Notes for Goals" })).toBeTruthy()
  })

  it("opens a frame's notes as they are, and an emptied note saves as its soft delete", async () => {
    net.post.mockResolvedValue({ msg: "ok", data: null })
    panel()
    fireEvent.click(screen.getByRole("button", { name: "Notes for Ideas" }))
    const field = (await screen.findByRole("textbox", { name: "Presenter notes" })) as HTMLTextAreaElement
    expect(field.value).toBe("Open with the numbers")
    fireEvent.change(field, { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "Save notes" }))
    await waitFor(() => expect(net.post).toHaveBeenCalledWith(expect.objectContaining({ payload: { board_uuid: "b1", frame_id: "f2", body: "", version: 3 } })))
    expect(await screen.findByRole("button", { name: "Add notes for Ideas" })).toBeTruthy()
  })

  it("says someone else changed the notes, keeps the person's text, and saves theirs over the newer version on Save mine", async () => {
    net.post.mockRejectedValueOnce(answered(409, { code: "stale_note", msg: "These notes changed", data: { frame_id: "f2", body: "Ann's words", version: 4 } }))
    net.post.mockResolvedValueOnce({ frame_id: "f2", body: "My words", version: 5 })
    panel()
    fireEvent.click(screen.getByRole("button", { name: "Notes for Ideas" }))
    const field = (await screen.findByRole("textbox", { name: "Presenter notes" })) as HTMLTextAreaElement
    fireEvent.change(field, { target: { value: "My words" } })
    fireEvent.click(screen.getByRole("button", { name: "Save notes" }))
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("Someone else changed these notes")
    expect(alert.textContent).toContain("Ann's words")
    expect(field.value).toBe("My words")
    // Its two choices are the only actions while it shows: one primary (Save mine), Save notes steps back.
    expect(screen.queryByRole("button", { name: "Save notes" })).toBeNull()
    expect(screen.getByRole("button", { name: "Use theirs" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Save mine" }))
    await waitFor(() => expect(net.post).toHaveBeenLastCalledWith(expect.objectContaining({ payload: { board_uuid: "b1", frame_id: "f2", body: "My words", version: 4 } })))
  })

  it("takes the other person's notes on Use theirs", async () => {
    net.post.mockRejectedValueOnce(answered(409, { code: "stale_note", data: { frame_id: "f2", body: "Ann's words", version: 4 } }))
    panel()
    fireEvent.click(screen.getByRole("button", { name: "Notes for Ideas" }))
    const field = (await screen.findByRole("textbox", { name: "Presenter notes" })) as HTMLTextAreaElement
    fireEvent.change(field, { target: { value: "My words" } })
    fireEvent.click(screen.getByRole("button", { name: "Save notes" }))
    await screen.findByRole("alert")
    fireEvent.click(screen.getByRole("button", { name: "Use theirs" }))
    expect(field.value).toBe("Ann's words")
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getByRole("button", { name: "Save notes" })).toBeTruthy()
  })

  it("keeps the text when offline or refused, and says which", async () => {
    net.post.mockRejectedValueOnce(Object.assign(new Error("Network Error"), { isAxiosError: true }))
    net.post.mockRejectedValueOnce(answered(403, { msg: "You can only view this board" }))
    panel()
    fireEvent.click(screen.getByRole("button", { name: "Notes for Ideas" }))
    const field = (await screen.findByRole("textbox", { name: "Presenter notes" })) as HTMLTextAreaElement
    fireEvent.change(field, { target: { value: "Kept" } })
    fireEvent.click(screen.getByRole("button", { name: "Save notes" }))
    expect((await screen.findByRole("alert")).textContent).toMatch(/You're offline/)
    fireEvent.click(screen.getByRole("button", { name: "Save notes" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Couldn't save the notes.*You can only view this board/))
    expect(field.value).toBe("Kept")
  })

  it("counts toward the cap near it, and stops at 10,000", async () => {
    panel()
    fireEvent.click(screen.getByRole("button", { name: "Notes for Ideas" }))
    const field = (await screen.findByRole("textbox", { name: "Presenter notes" })) as HTMLTextAreaElement
    expect(field.maxLength).toBe(10_000)
    expect(screen.queryByText(/of 10,000/)).toBeNull()
    fireEvent.change(field, { target: { value: "x".repeat(9_500) } })
    expect(screen.getByText("9,500 of 10,000")).toBeTruthy()
  })

  it("says a failed read with Try again", async () => {
    net.failed = true
    panel()
    fireEvent.click(screen.getByRole("button", { name: /notes for Goals/i }))
    expect(await screen.findByText("Couldn't load the notes")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(net.retried).toBe(1)
  })

  it("reads an answer that isn't a list as no notes, and the rows stay", async () => {
    net.list = {} as never
    panel()
    expect(screen.getByRole("button", { name: /^Move Goals/ })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Add notes for Ideas" }))
    expect(((await screen.findByRole("textbox", { name: "Presenter notes" })) as HTMLTextAreaElement).value).toBe("")
  })

  it("saves over an answer that isn't a list, and the row then has its notes (V-854)", async () => {
    net.list = {} as never
    net.post.mockResolvedValue({ frame_id: "f2", body: "Say hello", version: 1 })
    panel()
    fireEvent.click(screen.getByRole("button", { name: "Add notes for Ideas" }))
    fireEvent.change(await screen.findByRole("textbox", { name: "Presenter notes" }), { target: { value: "Say hello" } })
    fireEvent.click(screen.getByRole("button", { name: "Save notes" }))
    expect(await screen.findByText("Saved")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Notes for Ideas" })).toBeTruthy()
  })

  it("keeps a phone drawer's actions in its pinned footer, the stale pair in Save notes' place (one primary)", async () => {
    mobile = true
    net.post.mockRejectedValueOnce(answered(409, { code: "stale_note", data: { frame_id: "f2", body: "Ann's words", version: 4 } }))
    panel()
    fireEvent.click(screen.getByRole("button", { name: "Notes for Ideas" }))
    const field = (await screen.findByRole("textbox", { name: "Presenter notes" })) as HTMLTextAreaElement
    // The notes' own drawer (the Frames panel is a sheet of its own on a phone).
    const foot = () => field.closest("[data-v3-sheet]")?.querySelector<HTMLElement>("[data-sheet-footer]") as HTMLElement
    const buttons = () => within(foot()).getAllByRole("button").map((b) => b.textContent)
    expect(buttons()).toEqual(["Save notes"])
    fireEvent.change(field, { target: { value: "My words" } })
    fireEvent.click(within(foot()).getByRole("button", { name: "Save notes" }))
    expect((await screen.findByRole("alert")).textContent).toContain("Someone else changed these notes")
    expect(buttons()).toEqual(["Use theirs", "Save mine"])
    expect(field.value).toBe("My words")
  })

  it("is an editor's alone: a view-only member gets no Notes and makes no notes request", () => {
    panel(false)
    expect(screen.queryByRole("button", { name: /notes for/i })).toBeNull()
    expect(asked()).toEqual([])
  })
})

function slides(props: Partial<React.ComponentProps<typeof BoardSlides>> = {}) {
  const s = scene()
  return render(<BoardSlides api={s.api as never} doc={new Y.Doc()} slide="f2" onSlide={vi.fn()} outline onOutline={vi.fn()} board="b1" frameNotes={WithFrameNotes} {...props} />)
}

describe("the presenter's notes while presenting", () => {
  it("shows the slide's notes at the outline's foot on a computer, and the next slide's on Next", () => {
    const { rerender } = slides()
    const notes = screen.getByRole("region", { name: "Notes for this slide" })
    expect(notes.textContent).toContain("Open with the numbers")
    expect(notes.textContent).toMatch(/Followers don't see these/)
    rerender(<BoardSlides api={scene().api as never} doc={new Y.Doc()} slide="f1" onSlide={vi.fn()} outline onOutline={vi.fn()} board="b1" frameNotes={WithFrameNotes} />)
    const empty = screen.getByRole("region", { name: "Notes for this slide" })
    expect(empty.textContent).toContain("No notes for this slide")
    fireEvent.click(within(empty).getByRole("button", { name: "Add notes" }))
    expect(within(empty).getByRole("textbox", { name: "Presenter notes" })).toBeTruthy()
  })

  it("on a phone, keeps the slide bar to the slide (its name has the room) and opens the notes in a drawer, Edit in its pinned footer", async () => {
    mobile = true
    const onNotesOpen = vi.fn()
    const s = scene()
    const at = (notesOpen: boolean) => (
      <BoardSlides api={s.api as never} doc={new Y.Doc()} slide="f2" onSlide={vi.fn()} outline={false} onOutline={vi.fn()} board="b1" frameNotes={WithFrameNotes} notesOpen={notesOpen} onNotesOpen={onNotesOpen} />
    )
    const { rerender } = render(at(false))
    expect(within(screen.getByRole("toolbar", { name: "Slide controls" })).queryByRole("button", { name: /notes/i })).toBeNull()
    // Notes in the Presenting pill (boardFacilitation) opens them.
    rerender(at(true))
    const body = await screen.findByText("Open with the numbers")
    // Named for the slide, and saying only who doesn't see them: the title already says Notes (DB-133 F1).
    expect(screen.getByText("Notes for Ideas")).toBeTruthy()
    const section = screen.getByRole("region", { name: "Notes for this slide" })
    expect(section.textContent).toBe("Followers don't see theseOpen with the numbers")
    const foot = body.closest("[data-v3-sheet]")?.querySelector<HTMLElement>("[data-sheet-footer]") as HTMLElement
    fireEvent.click(within(foot).getByRole("button", { name: "Edit" }))
    expect(screen.getByRole("textbox", { name: "Presenter notes" })).toBeTruthy()
    expect(within(foot).getAllByRole("button").map((b) => b.textContent)).toEqual(["Cancel", "Save notes"])
  })

  it("never asks for notes for a follower, and a guest's slides (no notes given) can't", () => {
    slides({ onSlide: undefined })
    expect(screen.queryByRole("region", { name: "Notes for this slide" })).toBeNull()
    expect(asked()).toEqual([])
    cleanup()
    slides({ onSlide: undefined, board: undefined, frameNotes: undefined })
    expect(asked()).toEqual([])
  })

  it("says offline while the notes wait", () => {
    net.offline = true
    net.failed = true
    slides()
    expect(screen.getByRole("region", { name: "Notes for this slide" }).textContent).toContain("You're offline: the notes load when you're back")
  })
})
