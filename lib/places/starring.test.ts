import { beforeEach, describe, expect, it, vi } from "vitest"

const hoisted = vi.hoisted(() => ({
  toasts: [] as { title?: string; description?: string; variant?: string }[],
  addPlace: vi.fn(),
  removePlace: vi.fn(),
}))

vi.mock("@/hooks/use-toast", () => ({
  toast: (t: (typeof hoisted.toasts)[number]) => {
    hoisted.toasts.push(t)
    return { id: String(hoisted.toasts.length), dismiss: vi.fn(), update: vi.fn() }
  },
}))
vi.mock("@/services/docGraphService", () => ({ addPlace: hoisted.addPlace, removePlace: hoisted.removePlace }))

import { star, starOf, unstar } from "./starring"
import { starPlace, unstarPlace } from "@/store/slice/userSlice"

const OWN = { ownErrors: true }
const board = starOf("board", "b1", "Q4 launch", "/app/board/b1")

beforeEach(() => {
  hoisted.toasts.length = 0
  hoisted.addPlace.mockReset()
  hoisted.removePlace.mockReset()
})

// One star for every kind of place (miro-46): a doc's row and page and a
// board's More all star through here, so Starred agrees on what a star does.
describe("starring a place", () => {
  it("names the place as Starred shows it before the server answers", () => {
    expect(board).toEqual({ kind: "star", resource_kind: "board", resource_uuid: "b1", position: "", title: "Q4 launch", icon: undefined, href: "/app/board/b1" })
  })

  it("puts it in Starred at once, then asks the server for that kind of place", async () => {
    hoisted.addPlace.mockResolvedValue({})
    const dispatch = vi.fn()
    expect(await star(dispatch, board, "Couldn't star “Q4 launch”")).toBe(true)
    expect(dispatch.mock.calls).toEqual([[starPlace({ place: board })]])
    expect(hoisted.addPlace).toHaveBeenCalledWith("star", "board", "b1", undefined, OWN)
    expect(hoisted.toasts).toEqual([])
  })

  it("takes the star back when the server refuses it, and says why once", async () => {
    hoisted.addPlace.mockRejectedValue({ response: { status: 403, data: { msg: "You can't open that board." } } })
    const dispatch = vi.fn()
    expect(await star(dispatch, board, "Couldn't star “Q4 launch”")).toBe(false)
    expect(dispatch.mock.calls).toEqual([[starPlace({ place: board })], [unstarPlace({ resource_uuid: "b1" })]])
    expect(hoisted.toasts).toEqual([{ variant: "destructive", title: "Couldn't star “Q4 launch”", description: "You can't open that board." }])
  })

  it("takes a star away at once, then on the server", async () => {
    hoisted.removePlace.mockResolvedValue(undefined)
    const dispatch = vi.fn()
    expect(await unstar(dispatch, "b1", board, "Couldn't remove “Q4 launch” from starred")).toBe(true)
    expect(dispatch.mock.calls).toEqual([[unstarPlace({ resource_uuid: "b1" })]])
    expect(hoisted.removePlace).toHaveBeenCalledWith("star", "b1", OWN)
  })

  it("puts the star back where the list had it when the server refuses to take it away", async () => {
    hoisted.removePlace.mockRejectedValue(new Error("down"))
    const dispatch = vi.fn()
    expect(await unstar(dispatch, "b1", board, "Couldn't remove “Q4 launch” from starred")).toBe(false)
    expect(dispatch.mock.calls).toEqual([[unstarPlace({ resource_uuid: "b1" })], [starPlace({ place: board })]])
    expect(hoisted.toasts).toHaveLength(1)
    expect(hoisted.toasts[0]).toMatchObject({ variant: "destructive", title: "Couldn't remove “Q4 launch” from starred" })
  })

  it("leaves the list alone on a refusal when it had no place to put back", async () => {
    hoisted.removePlace.mockRejectedValue(new Error("down"))
    const dispatch = vi.fn()
    expect(await unstar(dispatch, "b1", undefined, "Couldn't remove it from starred")).toBe(false)
    expect(dispatch.mock.calls).toEqual([[unstarPlace({ resource_uuid: "b1" })]])
  })
})
