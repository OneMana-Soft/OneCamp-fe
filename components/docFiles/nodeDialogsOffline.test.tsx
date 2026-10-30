import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import type { NodeDialog } from "./NodeDialogs"

// Docs & Files' dialogs are a chunk of their own, and a file's preview
// another (useNodeDialogs, through lib/lazy/lazyPart). When a chunk can't
// come (offline, a dropped connection), opening says so and closes, the
// surface carries on, and the next open tries again. With React.lazy the
// failure was thrown to the app's error page, and React kept it for the visit.

const hoisted = vi.hoisted(() => ({ dialogsFail: true, previewFail: true }))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ toast: (t: unknown) => toast(t) }))
vi.mock("./NodeDialogs", () => {
  if (hoisted.dialogsFail) throw new Error("Loading chunk 412 failed")
  return { default: ({ dialog }: { dialog: NodeDialog }) => <div role="dialog" aria-label={dialog.kind} /> }
})
vi.mock("./FilePreview", () => {
  if (hoisted.previewFail) throw new Error("Loading chunk 413 failed")
  return { default: ({ file }: { file: { title: string } }) => <div role="dialog" aria-label={file.title} /> }
})

import { useNodeDialogs } from "./useNodeDialogs"

function Surface() {
  const dialogs = useNodeDialogs()
  return (
    <main>
      <h1>Q4 launch</h1>
      <button type="button" onClick={() => dialogs.open({ kind: "folder", place: { parentId: "p-1" } })}>
        New folder
      </button>
      <button type="button" onClick={() => dialogs.open({ kind: "preview", file: { id: "f-1", title: "brief.pdf", canEdit: false } })}>
        brief.pdf
      </button>
      {dialogs.element}
    </main>
  )
}

const said = (title: string) => ({ title, description: "Check your connection, then try again.", variant: "destructive" })

afterEach(() => {
  cleanup()
  toast.mockClear()
  vi.restoreAllMocks()
})

describe("Docs & Files' dialogs when their code can't come", () => {
  it("says a dialog couldn't open, and the next open tries again", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    render(<Surface />)
    fireEvent.click(screen.getByRole("button", { name: "New folder" }))
    await act(async () => {})
    expect(toast).toHaveBeenCalledWith(said("Couldn't open that"))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("heading", { name: "Q4 launch" })).toBeTruthy()

    hoisted.dialogsFail = false
    fireEvent.click(screen.getByRole("button", { name: "New folder" }))
    expect(await screen.findByRole("dialog", { name: "folder" })).toBeTruthy()
    expect(toast).toHaveBeenCalledTimes(1)
  })

  it("says a file couldn't open, and the next open tries again", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    render(<Surface />)
    fireEvent.click(screen.getByRole("button", { name: "brief.pdf" }))
    await act(async () => {})
    expect(toast).toHaveBeenCalledWith(said("Couldn't open the file"))
    expect(screen.queryByRole("dialog")).toBeNull()

    hoisted.previewFail = false
    fireEvent.click(screen.getByRole("button", { name: "brief.pdf" }))
    expect(await screen.findByRole("dialog", { name: "brief.pdf" })).toBeTruthy()
    expect(toast).toHaveBeenCalledTimes(1)
  })
})
