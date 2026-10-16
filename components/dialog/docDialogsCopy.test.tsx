import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"

const { makeRequest, push, createDoc } = vi.hoisted(() => ({ makeRequest: vi.fn(), push: vi.fn(), createDoc: vi.fn() }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))
// A new doc is made through the doc graph's create (A3, docs programme B5).
vi.mock("@/services/docGraphService", () => ({ createDoc: (req: unknown) => createDoc(req) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn(), useSelector: () => undefined }))

import CreateDocDialog from "./createDocDialog"
import UpdateDocTitleDialog from "./updateDocTitleDialog"

afterEach(cleanup)

// A doc's dialogs speak in sentence case, name their fields, and say what they
// do: renaming a doc said "Create Document" over "Update Title".
describe("a doc's dialogs", () => {
  it("make a new doc with no dialog: a private doc with no stored title, opened with its title ready", async () => {
    createDoc.mockResolvedValueOnce({ doc_uuid: "d1", doc_title: "" })
    const close = vi.fn()
    render(<CreateDocDialog dialogOpenState setOpenState={close} />)
    expect(screen.queryByRole("dialog")).toBeNull()
    await waitFor(() => expect(close).toHaveBeenCalledWith(false))
    // "Untitled" is only the placeholder, never a stored title (D-6).
    expect(createDoc.mock.calls[0][0]).toEqual({ doc_title: "", space: "private", doc_private: true })
    expect(push).toHaveBeenCalledWith("/app/doc/d1?new=1")
  })

  it("rename a doc as a rename", () => {
    render(<UpdateDocTitleDialog dialogOpenState setOpenState={() => {}} docId="d" currentDocTitle="Q4 launch plan" />)
    expect(screen.getByRole("heading", { name: "Rename doc" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Create Document|Update Title/)
  })
})
