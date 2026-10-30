import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

// Board templates on the Templates page (the whiteboard's W-1, miro-19 3): a
// kind of their own, each drawn small from the server's drawing of it, and
// Use template makes a new board that lays it on itself when it opens.

const h = vi.hoisted(() => ({ fetched: [] as string[], pushed: [] as string[], installed: [] as string[] }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (to: string) => h.pushed.push(to) }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("@/hooks/useProjectTemplates", () => ({
  useProjectTemplates: () => ({ templates: [], isLoading: false, isError: false, retry: vi.fn() }),
  deleteTemplate: vi.fn(),
}))
const retro = {
  id: "7a6b5c4d-0000-4000-8000-0000000000b1",
  kind: "board",
  name: "Sprint retro",
  description: "What went well, what to change.",
  payload: JSON.stringify({
    title: "Sprint retro",
    count: 3,
    preview: [
      { type: "frame", x: 0, y: 0, w: 400, h: 300 },
      { type: "rectangle", x: 20, y: 40, w: 180, h: 180, fill: "#E1F5F6", note: true },
    ],
  }),
  created_by: "u",
  created_at: "",
  updated_at: "",
  author_name: "Ann Lee",
}
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    h.fetched.push(url)
    return { data: { data: [retro] }, isLoading: false, isError: false, mutate: vi.fn() }
  },
}))
vi.mock("@/services/marketplaceService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/marketplaceService")>()),
  installTemplate: async (id: string) => {
    h.installed.push(id)
    return { kind: "board", entity_id: "b0a4d000-0000-4000-8000-0000000000aa", name: "Sprint retro" }
  },
}))

const { default: TemplatesPage } = await import("./page")

afterEach(() => {
  cleanup()
  h.fetched.length = 0
  h.pushed.length = 0
  h.installed.length = 0
})

describe("board templates in the gallery", () => {
  it("are a kind of their own, each card drawn small from its layout", async () => {
    render(<TemplatesPage />)
    const card = document.querySelector('[data-template-card="board"]')!
    expect(card).toBeTruthy()
    expect(within(card as HTMLElement).getByText("Board")).toBeTruthy()
    // The drawing loads after the cards.
    await vi.waitFor(() => expect(card.querySelector(`[data-template-preview="${retro.id}"] svg rect`)).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Boards" }))
    expect(h.fetched.at(-1)).toBe("/marketplace/templates?kind=board")
  })

  it("open to a drawing of how a board starts, and Use template makes a board that lays it", async () => {
    render(<TemplatesPage />)
    fireEvent.click(screen.getByText("Sprint retro"))
    const dialog = screen.getByRole("dialog")
    expect(await within(dialog).findByText("3 things on it")).toBeTruthy()
    expect(dialog.querySelector(`[data-board-template-preview="${retro.id}"] svg`)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole("button", { name: "Use template" }))
    await vi.waitFor(() => expect(h.pushed).toHaveLength(1))
    expect(h.installed).toEqual([retro.id])
    expect(h.pushed[0]).toBe(`/app/board/b0a4d000-0000-4000-8000-0000000000aa?template=team:${retro.id}`)
  })
})
