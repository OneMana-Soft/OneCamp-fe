import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import type { AttachmentMediaReq } from "@/types/attachment"

const file = (name: string, type: AttachmentMediaReq["attachment_type"] = "document", size = 1024, at = "2026-10-09T10:00:00Z"): AttachmentMediaReq => ({
  attachment_uuid: `u-${name}`,
  attachment_file_name: name,
  attachment_type: type,
  attachment_size: size,
  attachment_created_at: at,
})

type Upload = { key: string; fileName: string; progress: number; attachmentType: AttachmentMediaReq["attachment_type"]; size?: number; failed?: boolean; file?: File }
let fetched: { data?: { data: { project_attachments: AttachmentMediaReq[]; project_is_admin: boolean } }; isLoading?: boolean; isError?: unknown } = {}
let uploads: Upload[] = []
const confirm = vi.fn()
const { upload } = vi.hoisted(() => ({ upload: vi.fn() }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ ...fetched, mutate: vi.fn() }),
  useMediaFetch: () => ({ data: undefined }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(() => Promise.resolve()) }) }))
vi.mock("@/hooks/useUploadFile", () => ({ useUploadFile: () => ({ makeRequestToUploadToProject: upload }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
vi.mock("@/services/entityLinkService", () => ({ useEntityLinks: () => ({ docs: [], boards: [], forbidden: false, isLoading: false, hasLink: () => false, addLink: vi.fn(), removeLink: vi.fn(), mutating: false }) }))
vi.mock("react-redux", () => ({
  useDispatch: () => vi.fn(),
  useSelector: (pick: (s: unknown) => unknown) =>
    pick({ projectAttachment: { projectAttachmentInputState: uploads.length ? { p1: { filesPreview: uploads, filesUploaded: [] } } : {} } }),
}))

import { ProjectAttachments } from "./ProjectAttachments"
import { ProjectAttachmentList } from "./projectAttachmentList"
import { fileSize, middleTruncate } from "./fileCard"
import { shownFiles } from "./projectFiles"

afterEach(() => {
  cleanup()
  fetched = {}
  uploads = []
  confirm.mockReset()
  upload.mockReset()
  localStorage.clear()
  vi.restoreAllMocks()
})

const loaded = (files: AttachmentMediaReq[], admin = true) => {
  fetched = { data: { data: { project_attachments: files, project_is_admin: admin } }, isLoading: false }
}

for (const [where, Files] of [
  ["on a desktop", () => <ProjectAttachments projectId="p1" projectName="Q4 launch" />],
  ["on a phone", () => <ProjectAttachmentList projectId="p1" searchQuery="" />],
] as const) {
  describe(`a project's files ${where}`, () => {
    it("with none yet, invites a drop, and for an admin offers Upload", () => {
      loaded([])
      const pick = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {})
      render(<Files />)
      expect(screen.getByRole("heading", { name: "Drop files here" })).toBeTruthy()
      fireEvent.click(within(document.querySelector("[data-files-empty]") as HTMLElement).getByRole("button", { name: "Upload" }))
      expect(pick).toHaveBeenCalledOnce()
    })

    it("with none yet, tells someone who cannot add files where they will show", () => {
      loaded([], false)
      render(<Files />)
      expect(screen.getByText("Files added to this project show here.")).toBeTruthy()
      expect(screen.queryByRole("button", { name: /Upload/ })).toBeNull()
    })

    it("loads in the files' shape, not as an empty project", () => {
      fetched = { isLoading: true }
      render(<Files />)
      expect(screen.getByRole("status", { name: "Loading files" })).toBeTruthy()
      expect(screen.queryByText("Drop files here")).toBeNull()
    })

    it("shows an upload with a ring, and a failure on its card with Retry", () => {
      loaded([])
      uploads = [
        { key: "k1", fileName: "deck.pdf", progress: 42, attachmentType: "document", size: 2_516_582 },
        { key: "k2", fileName: "logo.png", progress: 10, attachmentType: "image", failed: true, file: new File(["x"], "logo.png") },
      ]
      render(<Files />)
      expect(screen.getByRole("progressbar", { name: "Uploading deck.pdf" }).getAttribute("aria-valuenow")).toBe("42")
      expect(screen.getByText(/^Uploading · 1 of 2.4 MB$/)).toBeTruthy()
      const failed = document.querySelector("[data-failed]") as HTMLElement
      expect(within(failed).getByText("Upload failed")).toBeTruthy()
      fireEvent.click(within(failed).getByRole("button", { name: /Retry/ }))
      expect(upload).toHaveBeenCalledOnce()
    })
  })
}

describe("the desktop Files tab", () => {
  it("shows each card's size and date, with no border, and Download by keyboard", () => {
    loaded([file("Launch-brief-v3.pdf", "document", 2_516_582)])
    render(<ProjectAttachments projectId="p1" />)
    const card = document.querySelector("[data-file-card]") as HTMLElement
    expect(card.textContent).toMatch(/2\.4 MB · 9 Oct/)
    expect(card.className).not.toMatch(/(^|\s)border(\s|$)/)
    expect(within(card).getByRole("button", { name: "Download Launch-brief-v3.pdf" }).tabIndex).not.toBe(-1)
  })

  it("filters by type and switches to a list that shows sizes", () => {
    loaded([file("brief.pdf"), file("logo.png", "image", 880_640)])
    render(<ProjectAttachments projectId="p1" />)
    expect(document.querySelectorAll("[data-file-card]")).toHaveLength(2)
    fireEvent.click(screen.getByRole("radio", { name: "List" }))
    const sizes = [...document.querySelectorAll("[data-file-size]")].map((s) => s.textContent)
    expect(sizes).toContain("860 KB")
  })

  it("shows the drop overlay when files are dragged over it, and uploads what is dropped", async () => {
    loaded([file("brief.pdf")])
    render(<ProjectAttachments projectId="p1" projectName="Q4 launch" />)
    const tab = document.querySelector("[data-files-tab]") as HTMLElement
    fireEvent.dragEnter(tab, { dataTransfer: { types: ["Files"], files: [] } })
    expect(screen.getByText("Drop to upload to Q4 launch")).toBeTruthy()
    const dropped = new File(["x"], "a.txt")
    await act(async () => fireEvent.drop(tab, { dataTransfer: { types: ["Files"], files: [dropped] } }))
    expect(upload).toHaveBeenCalledWith([dropped], "p1")
    expect(screen.queryByText("Drop to upload to Q4 launch")).toBeNull()
  })

  it("asks before deleting a file, since it goes for everyone", () => {
    loaded([file("brief.pdf")])
    render(<ProjectAttachments projectId="p1" />)
    const card = document.querySelector("[data-file-card]") as HTMLElement
    fireEvent.keyDown(within(card).getByRole("button", { name: "Attachment options" }), { key: "Enter" })
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete/ }))
    expect(confirm).toHaveBeenCalledOnce()
    expect(confirm.mock.calls[0][0]).toMatchObject({ title: "Delete the file “brief.pdf”?", destructive: true })
  })

  it("is labelled Files, on a computer and on a phone", () => {
    expect(readFileSync("components/project/projectTaskDesktop.tsx", "utf8")).toMatch(/value: "attachments", label: "Files"/)
    expect(readFileSync("components/project/projectListTabs.tsx", "utf8")).toMatch(/value: "attachment", label: "Files"/)
  })
})

describe("searching a project's files on a phone", () => {
  it("shows the matches in the same render the search arrives in", () => {
    loaded([file("brief.pdf"), file("logo.png", "image")])
    render(<ProjectAttachmentList projectId="p1" searchQuery="brief" />)
    expect(screen.getByRole("button", { name: "brief.pdf" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "logo.png" })).toBeNull()
  })

  it("says what was searched when nothing matches", () => {
    loaded([file("brief.pdf")])
    render(<ProjectAttachmentList projectId="p1" searchQuery="invoice" />)
    expect(screen.getByRole("heading", { name: "No files match “invoice”" })).toBeTruthy()
  })
})

describe("the files' words", () => {
  it("sorts by newest, name and size, and filters by type", () => {
    const f = [file("b.pdf", "document", 10, "2026-10-01"), file("a.png", "image", 30, "2026-10-09"), file("c.mp4", "video", 20, "2026-10-05")]
    expect(shownFiles(f, "all", "newest").map((x) => x.attachment_file_name)).toEqual(["a.png", "c.mp4", "b.pdf"])
    expect(shownFiles(f, "all", "name").map((x) => x.attachment_file_name)).toEqual(["a.png", "b.pdf", "c.mp4"])
    expect(shownFiles(f, "all", "size").map((x) => x.attachment_file_name)).toEqual(["a.png", "c.mp4", "b.pdf"])
    expect(shownFiles(f, "image", "newest").map((x) => x.attachment_file_name)).toEqual(["a.png"])
  })

  it("writes sizes short, and keeps a long name's extension", () => {
    expect(fileSize(2_516_582)).toBe("2.4 MB")
    expect(fileSize(880_640)).toBe("860 KB")
    expect(middleTruncate("Launch-brief-final-final-v3.pdf")).toMatch(/…v3\.pdf$/)
  })
})

describe("the desktop Files tab (work.md W26)", () => {
  // Work's rows (W26) met content's cards (F01) at the integration (11 Oct):
  // the Files tab is content's, with cards and a list view; its guards are above.
  it("shows where dropped files go while they are dragged over", () => {
    loaded([file("brief.pdf")])
    render(<ProjectAttachments projectId="p1" />)
    const tab = document.querySelector("[data-files-tab]")!
    fireEvent.dragEnter(tab, { dataTransfer: { types: ["Files"], files: [] } })
    expect(document.querySelector("[data-drop-overlay]")).not.toBeNull()
    fireEvent.dragLeave(tab, { dataTransfer: { types: ["Files"] } })
    expect(document.querySelector("[data-drop-overlay]")).toBeNull()
  })
})
