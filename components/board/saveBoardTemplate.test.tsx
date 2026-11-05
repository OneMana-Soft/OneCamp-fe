import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { boardScene } from "@/lib/testing/boardScene"
import { boardTemplatePayload } from "@/lib/board/teamTemplates"
import { privateViews } from "@/lib/board/privateMode"

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

  it("sends the board as it may leave this tab: a note held in private mode stays out, words and all (miro-25)", async () => {
    const s = boardScene([note("open", 0), { ...note("held", 200), customData: { kind: "note", colour: "yellow", secret: "Secret plan" } }])
    const veil = (e: { id: string }) => (e.id === "held" ? { ...e, locked: true, customData: { privateBy: "u-sam", privateName: "Sam" } } : e)
    privateViews.set(s.api, { holds: () => false, handle: { current: { outward: (scene: { id: string }[]) => scene.map(veil) } } })
    render(<SaveBoardTemplate api={s.api} title="Retro" onClose={vi.fn()} />)
    // The count says why the held note is missing (DESIGN-BUILD-108's F2), as Make tasks does.
    expect(document.querySelector("[data-template-contents]")!.textContent).toBe("1 thing from the board. 1 private note stays out until the round ends.")
    fireEvent.click(screen.getByRole("button", { name: "Save template" }))
    await waitFor(() => expect(h.published).toHaveLength(1))
    const sent = h.published[0] as { payload: { elements: { id: string }[] } }
    expect(sent.payload.elements.map((e) => e.id)).toEqual(["open"])
    expect(JSON.stringify(sent)).not.toContain("Secret plan")
  })

  it("a board whose only notes are held has nothing to save yet, and says why (miro-25)", () => {
    const words = { id: "held-words", type: "text", x: 10, y: 10, width: 100, height: 20, version: 1, containerId: "held", text: "Secret plan" }
    const s = boardScene([{ ...note("held", 0), boundElements: [{ id: "held-words", type: "text" }] }, words])
    // The real veil marks the note and its words: one note, however many elements it is.
    const veil = (e: { id: string; customData?: object }) => ({ ...e, locked: true, customData: { ...e.customData, privateBy: "u-sam", privateName: "Sam" } })
    privateViews.set(s.api, { holds: () => false, handle: { current: { outward: (scene: { id: string }[]) => scene.map(veil) } } })
    render(<SaveBoardTemplate api={s.api} title="Retro" onClose={vi.fn()} />)
    expect(document.querySelector("[data-template-contents]")!.textContent).toBe("There's nothing on the board to save yet. 1 private note stays out until the round ends.")
    expect((screen.getByRole("button", { name: "Save template" }) as HTMLButtonElement).disabled).toBe(true)
  })
})
