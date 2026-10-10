import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(), isSubmitting: false }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn(), useSelector: () => undefined }))

import CreateDocDialog from "./createDocDialog"
import UpdateDocTitleDialog from "./updateDocTitleDialog"

afterEach(cleanup)

// A doc's dialogs speak in sentence case, name their fields, and say what they
// do: renaming a doc said "Create Document" over "Update Title".
describe("a doc's dialogs", () => {
  it("make a new doc in sentence case, with the privacy switch named and explained", () => {
    render(<CreateDocDialog dialogOpenState setOpenState={() => {}} />)
    expect(screen.getByRole("heading", { name: "New doc" })).toBeTruthy()
    expect(screen.getByLabelText("Title")).toBeTruthy()
    expect(screen.getByRole("switch", { name: "Private" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Create doc" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Create Document|Document Title|Private Document/)
  })

  it("rename a doc as a rename", () => {
    render(<UpdateDocTitleDialog dialogOpenState setOpenState={() => {}} docId="d" currentDocTitle="Q4 launch plan" />)
    expect(screen.getByRole("heading", { name: "Rename doc" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Create Document|Update Title/)
  })
})
