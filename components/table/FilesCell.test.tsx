import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import * as React from "react"

const { upload, dispatch } = vi.hoisted(() => ({ upload: vi.fn(), dispatch: vi.fn() }))
vi.mock("@/lib/upload", () => ({ uploadAttachment: (...a: unknown[]) => upload(...a) }))
vi.mock("react-redux", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-redux")>()),
  useDispatch: () => dispatch,
}))

import { FilesCell, filesOf } from "@/components/table/FilesCell"
import { Cell } from "@/components/table/gridCells"
import type { CellContext } from "@/components/table/cellFaces"
import { listText } from "@/lib/tables/cellFormat"
import { fieldKind } from "@/lib/fieldTypes/registry"
import type { TableField } from "@/services/tableService"

const brief = { id: "11111111-1111-4111-8111-111111111111", name: "Brief.pdf", size: 2048, mime: "application/pdf" }
const logo = { id: "22222222-2222-4222-8222-222222222222", name: "Logo.png", mime: "image/png" }
const plan = { id: "44444444-4444-4444-8444-444444444444", name: "Stand plan, final for the venue.pdf", size: 9000, mime: "application/pdf" }

afterEach(() => {
  cleanup()
  upload.mockReset()
  dispatch.mockReset()
  vi.restoreAllMocks()
})

describe("a files cell", () => {
  it("shows each file once, by name, and reads nothing else as a file", () => {
    expect(filesOf([brief, brief, { name: "no id" }, "x", logo]).map((f) => f.name)).toEqual(["Brief.pdf", "Logo.png"])
    render(<FilesCell value={[brief, logo]} tableId="t1" onCommit={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Brief.pdf" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Logo.png" })).toBeTruthy()
  })

  it("keeps a name's type whole when it cuts the name", () => {
    render(<FilesCell value={[logo, plan]} tableId="t1" onCommit={vi.fn()} />)
    // The head is what truncates; the type is its own part, never cut, and a
    // long name's tail keeps its last word whole (lib/utils/file/fileTypeHue).
    expect(screen.getByRole("button", { name: "Logo.png" }).lastElementChild?.textContent).toBe(".png")
    expect(screen.getByRole("button", { name: plan.name }).lastElementChild?.textContent).toBe(" venue.pdf")
  })

  it("opens a file in the app's attachment viewer, with the cell's other files beside it", () => {
    render(<FilesCell value={[brief, logo]} tableId="t1" onCommit={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Logo.png" }))
    expect(dispatch).toHaveBeenCalledTimes(1)
    const { payload } = dispatch.mock.calls[0][0] as {
      payload: { key: string; data: { media: { attachment_uuid: string; attachment_type: string }; allMedia: { attachment_uuid: string }[]; mediaGetUrl: string } }
    }
    expect(payload.key).toBe("attachmentLightbox")
    expect(payload.data.media).toMatchObject({ attachment_uuid: logo.id, attachment_type: "image" })
    expect(payload.data.allMedia.map((m) => m.attachment_uuid)).toEqual([brief.id, logo.id])
    // The viewer asks for each file's address here, with its id after it.
    expect(payload.data.mediaGetUrl).toBe("/tables/t1/files")
  })

  it("counts the files past those it shows, and lists them all from the count", async () => {
    render(<FilesCell value={[brief, logo, plan]} tableId="t1" room={{ max: 1, wrap: true }} onCommit={vi.fn()} />)
    expect(screen.queryByRole("button", { name: "Logo.png" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "All 3 files" }))
    await waitFor(() => expect(document.querySelector("[data-files-list]")).not.toBeNull())
    const list = document.querySelector("[data-files-list]") as HTMLElement
    expect(Array.from(list.querySelectorAll("li")).map((li) => li.querySelector("button")?.getAttribute("aria-label"))).toEqual([brief.name, logo.name, plan.name])
  })

  it("stores a picked file as the table's, and adds it after the ones there", async () => {
    upload.mockResolvedValue("33333333-3333-4333-8333-333333333333")
    const commit = vi.fn().mockResolvedValue(true)
    const { container } = render(<FilesCell value={[brief]} tableId="t1" onCommit={commit} />)
    const file = new File(["hello"], "Notes.txt", { type: "text/plain" })
    fireEvent.change(container.querySelector("[data-file-input]") as HTMLInputElement, { target: { files: [file] } })
    await waitFor(() => expect(commit).toHaveBeenCalled())
    expect(upload.mock.calls[0][0]).toEqual({ key: "table", value: "t1" })
    expect(commit).toHaveBeenCalledWith([brief, { id: "33333333-3333-4333-8333-333333333333", name: "Notes.txt", size: 5, mime: "text/plain" }])
  })

  it("takes a file off the cell", () => {
    const commit = vi.fn().mockResolvedValue(true)
    render(<FilesCell value={[brief, logo]} tableId="t1" onCommit={commit} />)
    fireEvent.click(screen.getByRole("button", { name: "Remove Brief.pdf" }))
    expect(commit).toHaveBeenCalledWith([{ ...logo, size: undefined }])
  })

  it("can't be changed by a reader who may only read", () => {
    render(<FilesCell value={[brief]} tableId="t1" readOnly onCommit={vi.fn()} />)
    expect(screen.queryByRole("button", { name: "Add files" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Remove Brief.pdf" })).toBeNull()
  })
})

describe("the files kind", () => {
  it("is a kind the grid draws as files, and its names are its text", async () => {
    expect(fieldKind("attachment").label).toBe("Files")
    expect(listText([brief, logo])).toBe("Brief.pdf, Logo.png")
    const field: TableField = { id: "f", table_id: "t1", name: "Files", type: "attachment", config: "{}", position: 0 }
    const ctx: CellContext = { options: new Map() as unknown as CellContext["options"], rowHeight: "medium", tableId: "t1" }
    render(<Cell field={field} value={[brief]} cellId="0:0" ctx={ctx} onCommit={vi.fn()} onLink={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole("button", { name: "Brief.pdf" })).toBeTruthy())
  })
})
