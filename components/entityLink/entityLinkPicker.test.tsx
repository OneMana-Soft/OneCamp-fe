import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// The entity-link picker (a task's or project's linked docs and boards) finds
// through the workspace search. A search that fails says so with Try again;
// it used to show "Searching…" for good.

const { makeRequest } = vi.hoisted(() => ({ makeRequest: vi.fn() }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))

import { EntityLinkPicker } from "@/components/entityLink/EntityLinkPicker"

afterEach(() => {
  cleanup()
  makeRequest.mockReset()
})

const open = (onPick = vi.fn()) => {
  render(<EntityLinkPicker onPick={onPick} isLinked={(_, id) => id === "b1"} />)
  fireEvent.click(screen.getByRole("button", { name: "Link a doc or board" }))
  return onPick
}
// The search box comes with the search's own chunk, a moment after the picker opens.
const type = async (text: string) => fireEvent.change(await screen.findByPlaceholderText("Search docs and boards…"), { target: { value: text } })

describe("the entity-link picker", () => {
  it("offers the docs and boards the search finds, a linked one as linked", async () => {
    makeRequest.mockResolvedValueOnce({
      page: [
        { type: "doc", doc: { doc_uuid: "d1", doc_title: "Vendor contracts" } },
        { type: "board", board: { board_uuid: "b1", board_title: "Vendor map" } },
        { type: "task", task: { task_uuid: "t1" } },
      ],
    })
    const onPick = open()
    await type("vendor")
    const found = await screen.findByRole("button", { name: "Vendor contracts" })
    expect((screen.getByRole("button", { name: "Vendor map" }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => fireEvent.click(found))
    expect(onPick).toHaveBeenCalledWith("doc", "d1", "Vendor contracts")
  })

  it("says a failed search failed, and asks again on Try again", async () => {
    makeRequest.mockRejectedValueOnce(new Error("Network Error")).mockResolvedValueOnce({ page: [{ type: "doc", doc: { doc_uuid: "d1", doc_title: "Vendor contracts" } }] })
    open()
    await type("vendor")
    const retry = await screen.findByRole("button", { name: "Try again" })
    expect(screen.queryByText("Searching…")).toBeNull()
    expect(screen.queryByText("No docs or boards found")).toBeNull()
    await act(async () => fireEvent.click(retry))
    expect(await screen.findByRole("button", { name: "Vendor contracts" })).toBeTruthy()
  })
})
