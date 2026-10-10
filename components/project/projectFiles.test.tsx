import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import type { AttachmentMediaReq } from "@/types/attachment"

const file = (name: string, type: AttachmentMediaReq["attachment_type"] = "document"): AttachmentMediaReq => ({
  attachment_uuid: `u-${name}`,
  attachment_file_name: name,
  attachment_type: type,
  attachment_size: 1,
  attachment_created_at: "",
})

let fetched: { data?: { data: { project_attachments: AttachmentMediaReq[]; project_is_admin: boolean } }; isLoading?: boolean; isError?: unknown } = {}
let uploads: { key: string; fileName: string; progress: number; attachmentType: AttachmentMediaReq["attachment_type"] }[] = []
const confirm = vi.fn()
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ ...fetched, mutate: vi.fn() }),
  useMediaFetch: () => ({ data: undefined }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(() => Promise.resolve()) }) }))
vi.mock("@/hooks/useUploadFile", () => ({ useUploadFile: () => ({ makeRequestToUploadToProject: vi.fn() }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false }) }))
vi.mock("react-redux", () => ({
  useDispatch: () => vi.fn(),
  useSelector: (pick: (s: unknown) => unknown) =>
    pick({ projectAttachment: { projectAttachmentInputState: uploads.length ? { p1: { filesPreview: uploads, filesUploaded: [] } } : {} } }),
}))

import { ProjectAttachments } from "./ProjectAttachments"
import { ProjectAttachmentList } from "./projectAttachmentList"

afterEach(() => {
  cleanup()
  fetched = {}
  uploads = []
  confirm.mockReset()
  vi.restoreAllMocks()
})

const loaded = (files: AttachmentMediaReq[], admin = true) => {
  fetched = { data: { data: { project_attachments: files, project_is_admin: admin } }, isLoading: false }
}

function spotHue() {
  const svg = document.querySelector("[data-empty-illustration] svg")
  return /hue-(\w+)/.exec(svg?.getAttribute("class") || "")?.[1]
}

for (const [where, Files] of [
  ["on a desktop", (p: { q?: string }) => <ProjectAttachments projectId="p1" key={p.q} />],
  ["on a phone", (p: { q?: string }) => <ProjectAttachmentList projectId="p1" searchQuery={p.q ?? ""} />],
] as const) {
  describe(`a project's files ${where}`, () => {
    it("with none yet, draws a tray, and for an admin one button that picks files", () => {
      loaded([])
      const pick = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {})
      render(<Files />)
      expect(screen.getByRole("heading", { name: "No attachments yet" })).toBeTruthy()
      expect(spotHue()).toBe("moss")
      fireEvent.click(screen.getByRole("button", { name: "Add files" }))
      expect(pick).toHaveBeenCalledOnce()
    })

    it("with none yet, tells someone who cannot add files where they will show", () => {
      loaded([], false)
      render(<Files />)
      expect(screen.getByText("Files added to this project show here.")).toBeTruthy()
      expect(screen.queryByRole("button", { name: "Add files" })).toBeNull()
    })

    it("loads as tiles, not as an empty project", () => {
      fetched = { isLoading: true }
      render(<Files />)
      expect(screen.getByRole("status", { name: "Loading attachments" })).toBeTruthy()
      expect(screen.queryByText("No attachments yet")).toBeNull()
    })

    it("lists the files, each opening from its name, then a tile that adds more", () => {
      loaded([file("brief.pdf"), file("logo.png", "image")])
      render(<Files />)
      expect(screen.getByRole("button", { name: "brief.pdf" })).toBeTruthy()
      expect(screen.getByRole("button", { name: "Add files" })).toBeTruthy()
      expect(screen.queryByText("No attachments yet")).toBeNull()
    })

    it("shows a file on its way up as a bar that fills, not as 'uploading: 42%'", () => {
      loaded([])
      uploads = [{ key: "k1", fileName: "deck.pdf", progress: 42, attachmentType: "document" }]
      render(<Files />)
      const bar = screen.getByRole("progressbar", { name: "Uploading deck.pdf" })
      expect(bar.getAttribute("aria-valuenow")).toBe("42")
      expect(screen.getByText("Uploading… 42%")).toBeTruthy()
      expect(screen.queryByText("No attachments yet")).toBeNull()
    })
  })
}

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
    expect(screen.getByRole("heading", { name: "No attachments match “invoice”." })).toBeTruthy()
    expect(spotHue()).toBe("lake")
  })
})

describe("deleting a project's file", () => {
  it("asks first, since it goes for everyone", () => {
    loaded([file("brief.pdf")])
    render(<ProjectAttachments projectId="p1" />)
    const chip = screen.getByRole("button", { name: "brief.pdf" }).closest("div.group") as HTMLElement
    fireEvent.keyDown(within(chip).getByRole("button", { name: "Attachment options" }), { key: "Enter" })
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete/ }))
    expect(confirm).toHaveBeenCalledOnce()
    expect(confirm.mock.calls[0][0]).toMatchObject({ title: "Delete the file “brief.pdf”?", destructive: true })
  })
})
