import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { boardScene } from "@/lib/testing/boardScene"
import { boardTemplatePayload } from "@/lib/board/teamTemplates"

// Saving a board as a template (whiteboard W-1b): its size is checked against
// what a template holds before anything is sent, and the board's name and
// what is on it are what is sent.

const h = vi.hoisted(() => ({ max: 1 << 20, published: [] as unknown[] }))
vi.mock("@/lib/board/teamTemplates", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/board/teamTemplates")>()
  return {
    ...real,
    get BOARD_TEMPLATE_MAX_BYTES() {
      return h.max
    },
  }
})
vi.mock("@/services/marketplaceService", () => ({
  boardTemplatesKey: "/marketplace/templates?kind=board",
  publishTemplate: async (input: unknown) => {
    h.published.push(input)
    return { id: "t-1" }
  },
}))
vi.mock("@/lib/swrMutate", () => ({ appMutate: vi.fn() }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

const { default: SaveBoardTemplate } = await import("./saveBoardTemplate")

const note = (id: string, x: number) => ({ id, type: "rectangle", x, y: 0, width: 180, height: 180, version: 1, customData: { kind: "note", colour: "yellow" } })

afterEach(() => {
  cleanup()
  h.max = 1 << 20
  h.published.length = 0
})

describe("saving a board as a template", () => {
  it("weighs the board with its name exactly as the server will", () => {
    const s = boardScene([note("a", 0), note("b", 200)])
    const exact = boardTemplatePayload("Retro", s.elements() as never).bytes
    h.max = exact
    render(<SaveBoardTemplate api={s.api} title="Retro" onClose={vi.fn()} />)
    expect(screen.queryByRole("alert")).toBeNull()
    expect((screen.getByRole("button", { name: "Save template" }) as HTMLButtonElement).disabled).toBe(false)
    // One letter more is one byte past it.
    fireEvent.change(screen.getByRole("textbox", { name: "Template name" }), { target: { value: "Retros" } })
    expect(screen.getByRole("alert").textContent).toMatch(/^This board comes to \d+ KB, and a template holds \d+ KB\./)
    expect((screen.getByRole("button", { name: "Save template" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("sends nothing for a board with nothing on it", () => {
    const s = boardScene([])
    render(<SaveBoardTemplate api={s.api} title="Empty" onClose={vi.fn()} />)
    expect(screen.getByText("There's nothing on the board to save yet.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Save template" }))
    expect(h.published).toEqual([])
  })
})
