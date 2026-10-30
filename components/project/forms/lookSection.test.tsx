import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import type { ProjectForm } from "@/lib/forms/forms"

// Tables B5c-2: the builder's Look. A picture goes up through the app's one upload as the form's ("form", its id or
// "new"), only of a kind every browser draws; what shows is the picked copy, then the saved one by the form's link,
// and for a logo the workspace's until the form has its own.

const upload = vi.hoisted(() => vi.fn())
vi.mock("@/lib/upload", () => ({ postUpload: upload }))
vi.mock("@/services/publicApi", () => ({ backendBase: "https://api.camp.test" }))

import { LookSection, lookShown } from "./LookSection"

const form = (patch: Partial<ProjectForm> = {}): ProjectForm => ({ title: "Vendor sign-up", description: "", fields: [], title_field: "", priority: "medium", active: true, ...patch })
const png = () => new File([new Uint8Array([137, 80, 78, 71])], "cover.png", { type: "image/png" })

beforeEach(() => {
  upload.mockReset()
  URL.createObjectURL = vi.fn(() => "blob:picked")
})
afterEach(cleanup)

describe("what a form wears, drawn", () => {
  it("is the picked copy first, then the saved picture by the form's link, and for a logo the workspace's", () => {
    expect(lookShown(form(), {})).toEqual({ cover: undefined, logo: "https://api.camp.test/public/email/logo" })
    expect(lookShown(form({ token: "tok", cover_id: "c1", logo_id: "l1" }), {})).toEqual({
      cover: "https://api.camp.test/public/form/tok/cover?v=c1",
      logo: "https://api.camp.test/public/form/tok/logo?v=l1",
    })
    expect(lookShown(form({ token: "tok", cover_id: "c2" }), { c2: "blob:new" }).cover).toBe("blob:new")
    // A new form's own picture shows only as picked: it has no link yet.
    expect(lookShown(form({ cover_id: "c3" }), {}).cover).toBeUndefined()
  })
})

describe("the builder's Look", () => {
  const look = (f: ProjectForm, onPicked = vi.fn(), onRemove = vi.fn()) => {
    render(<LookSection form={f} picked={{}} onPicked={onPicked} onRemove={onRemove} />)
    return { onPicked, onRemove }
  }
  const choose = (kind: "cover" | "logo", file: File) => fireEvent.change(screen.getByLabelText(`The form's ${kind} picture`), { target: { files: [file] } })

  it("uploads a picked picture as the form's, and hands back its id and the browser's copy", async () => {
    upload.mockResolvedValue({ data: { object_uuid: "a1b2" } })
    const { onPicked } = look(form({ id: "f1" }))
    choose("cover", png())
    await waitFor(() => expect(onPicked).toHaveBeenCalledWith("cover", "a1b2", "blob:picked"))
    expect(upload.mock.calls[0][1]).toEqual({ src_key: "form", src_value: "f1" })
  })

  it("uploads for a form not made yet as a new form's", async () => {
    upload.mockResolvedValue({ data: { object_uuid: "a1b2" } })
    look(form())
    choose("logo", png())
    await waitFor(() => expect(upload).toHaveBeenCalled())
    expect(upload.mock.calls[0][1]).toEqual({ src_key: "form", src_value: "new" })
  })

  it("refuses a file that isn't a picture every browser draws, in words, and sends nothing", () => {
    const { onPicked } = look(form())
    choose("cover", new File(["<svg/>"], "mark.svg", { type: "image/svg+xml" }))
    expect(screen.getByRole("alert").textContent).toBe("Add a PNG, JPEG, WebP or GIF picture.")
    expect(upload).not.toHaveBeenCalled()
    expect(onPicked).not.toHaveBeenCalled()
  })

  it("says why an upload failed, in the server's words", async () => {
    upload.mockRejectedValue({ isAxiosError: true, response: { status: 413, data: { msg: "File exceeds the 10 MB limit" } } })
    const { onPicked } = look(form())
    choose("cover", png())
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("File exceeds the 10 MB limit"))
    expect(onPicked).not.toHaveBeenCalled()
  })

  it("offers Replace and Remove once the form wears its own, and Add before", () => {
    const { onRemove } = look(form({ token: "tok", cover_id: "c1" }))
    expect(screen.getByRole("button", { name: "Replace cover" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Add a logo" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Remove the cover" }))
    expect(onRemove).toHaveBeenCalledWith("cover")
    expect(screen.queryByRole("button", { name: "Remove the logo" })).toBeNull()
  })

  it("shows the workspace's logo until the form has its own, and says none yet when the workspace has none", () => {
    look(form())
    const tile = document.querySelector('[data-look="logo"]')!
    expect(tile.textContent).toContain("Your workspace's logo, until you add one.")
    const img = tile.querySelector("img")!
    expect(img.getAttribute("src")).toBe("https://api.camp.test/public/email/logo")
    // A workspace that never added a logo: the server has none to give, so the tile is empty and says so.
    fireEvent.error(img)
    expect(tile.querySelector("img")).toBeNull()
    expect(tile.textContent).toContain("None yet: one you add shows over the title.")
    expect(screen.getByRole("button", { name: "Add a logo" })).toBeTruthy()
  })
})
