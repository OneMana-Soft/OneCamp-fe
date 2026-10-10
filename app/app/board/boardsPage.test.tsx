import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { hueFor } from "@/lib/campHue"

const boards = [{ board_uuid: "b0a10000-0000-4000-8000-000000000001", board_title: "Launch retro", board_private: false, board_updated_at: "" }]
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: { data: { boards } }, isLoading: false, isError: undefined, mutate: vi.fn() }) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(), isSubmitting: false }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/hooks/useRelativeTime", () => ({ useRelativeTime: () => "" }))

import BoardsPage from "./page"

afterEach(cleanup)

describe("the boards list", () => {
  it("opens with its title and one action, without a marketing line", () => {
    render(<BoardsPage />)
    expect(screen.getByRole("heading", { level: 1, name: "Boards" })).toBeTruthy()
    expect(screen.queryByText(/Infinite collaborative canvas/)).toBeNull()
    expect(screen.getByRole("button", { name: /New board/ })).toBeTruthy()
  })

  it("lists each board as a link, a board with no picture in its own hue", () => {
    render(<BoardsPage />)
    const link = screen.getByRole("link", { name: /Launch retro/ })
    expect(link.getAttribute("href")).toMatch(/b0a10000-0000-4000-8000-000000000001$/)
    expect(link.innerHTML).toContain(`hue-${hueFor("b0a10000-0000-4000-8000-000000000001")}`)
    expect(link.className).toMatch(/hover-lift/)
  })
})
