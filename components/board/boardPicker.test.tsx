// Present a board (calls package B): the picker lists only the boards you may
// edit, since the server presents no other (board_not_editable), searches
// them, asks the call for a new one (the server shares it with the call's
// conversation), and says when there are none or they couldn't load.
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"

let fetched: { data?: unknown; isLoading?: boolean; isError?: boolean; mutate: () => void } = { mutate: () => {} }
const urls: string[] = []
vi.mock("@/hooks/useFetch", () => ({ useFetch: (url: string) => (urls.push(url), fetched) }))
vi.mock("@/hooks/useDebounce", () => ({ useDebounce: <T,>(v: T) => v }))

const { default: BoardPicker } = await import("./boardPicker")

// Each row says when its board was edited, against this clock.
pinTestClock()

const listed = (...titles: string[]) => ({
  msg: "Success",
  data: { boards: titles.map((t, i) => ({ board_uuid: `b${i}`, board_title: t, board_updated_at: "2026-10-27T09:00:00Z" })), count: titles.length },
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  urls.length = 0
})

describe("Present a board", () => {
  it("lists only the boards you may edit, as the server orders them, and presents the one picked", () => {
    fetched = { data: listed("Launch plan", "Retro"), mutate: vi.fn() }
    const onPick = vi.fn()
    const onClose = vi.fn()
    render(<BoardPicker onPick={onPick} onNew={vi.fn()} onClose={onClose} />)
    expect(urls.at(-1)).toMatch(/[?&]editable=1(&|$)/)
    const rows = screen.getAllByRole("button", { name: /Launch plan|Retro/ })
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining("Launch plan"), expect.stringContaining("Retro")])
    fireEvent.click(rows[1])
    expect(onPick).toHaveBeenCalledWith("b1")
    expect(onClose).toHaveBeenCalled()
  })

  it("searches them by name", () => {
    fetched = { data: listed(), mutate: vi.fn() }
    render(<BoardPicker onPick={vi.fn()} onNew={vi.fn()} onClose={vi.fn()} />)
    fireEvent.change(screen.getByRole("searchbox", { name: "Search boards you can edit" }), { target: { value: "road map" } })
    expect(urls.at(-1)).toMatch(/[?&]editable=1(&|$)/)
    expect(urls.at(-1)).toContain("search=road%20map")
  })

  it("asks the call for a new board, and closes", () => {
    fetched = { data: listed("Retro"), mutate: vi.fn() }
    const onPick = vi.fn()
    const onNew = vi.fn()
    const onClose = vi.fn()
    render(<BoardPicker onPick={onPick} onNew={onNew} onClose={onClose} />)
    fireEvent.click(screen.getByRole("button", { name: "New board" }))
    expect(onNew).toHaveBeenCalledTimes(1)
    expect(onPick).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it("says when you have no board to edit, and offers a new one", () => {
    fetched = { data: listed(), mutate: vi.fn() }
    render(<BoardPicker onPick={vi.fn()} onNew={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText("No boards you can edit yet")).toBeTruthy()
    expect(screen.getByRole("button", { name: "New board" })).toBeTruthy()
  })

  it("says when the list couldn't load, and asks again", () => {
    const mutate = vi.fn()
    fetched = { isError: true, mutate }
    render(<BoardPicker onPick={vi.fn()} onNew={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(mutate).toHaveBeenCalled()
  })
})
