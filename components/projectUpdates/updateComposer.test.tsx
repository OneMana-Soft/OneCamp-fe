import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
vi.mock("react-redux", () => ({
  useSelector: (pick: (s: unknown) => unknown) =>
    pick({ users: { userSidebar: { userChannels: [{ ch_uuid: "c-eng", ch_name: "engineering", ch_is_member: true }] } } }),
}))

const { UpdateComposer } = await import("@/components/projectUpdates/UpdateComposer")

afterEach(() => {
  cleanup()
  toast.mockReset()
})

const DRAFT = { text: "Since Mon: 2 done.\n\nDone:\n- Import", health: "at_risk" as const, since: "2026-09-30T00:00:00Z" }

function setup(over: Partial<Parameters<typeof UpdateComposer>[0]> = {}) {
  const props = {
    hasAI: true,
    draft: vi.fn().mockResolvedValue(DRAFT),
    aiDraft: vi.fn().mockResolvedValue({ ...DRAFT, text: "We moved fast.\n\n" + DRAFT.text, ai: true }),
    post: vi.fn().mockResolvedValue({ update: { id: "u1" }, channel: "engineering" }),
    edit: vi.fn().mockResolvedValue(undefined),
    onDone: vi.fn(),
    ...over,
  }
  render(<UpdateComposer {...props} />)
  return props
}

describe("writing an update", () => {
  it("opens on the draft, with the suggested health chosen", async () => {
    setup()
    await waitFor(() => expect((screen.getByLabelText(/Drafted from the project's tasks/) as HTMLTextAreaElement).value).toBe(DRAFT.text))
    expect(screen.getByRole("radio", { name: /At risk/ }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("radio", { name: /At risk/ }).textContent).toContain("suggested")
  })

  it("puts an AI summary on top, and takes it back", async () => {
    setup()
    // The AI button waits for the draft.
    await waitFor(() => expect((screen.getByRole("button", { name: /Add an AI summary/ }) as HTMLButtonElement).disabled).toBe(false))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Add an AI summary/ })))
    const area = screen.getByRole("textbox") as HTMLTextAreaElement
    expect(area.value.startsWith("We moved fast.")).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: /Undo the AI summary/ }))
    expect(area.value).toBe(DRAFT.text)
  })

  it("posts the health, the text, the client choice and the channel", async () => {
    const p = setup()
    await waitFor(() => expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(DRAFT.text))
    fireEvent.click(screen.getByRole("radio", { name: /Off track/ }))
    fireEvent.click(screen.getByRole("checkbox"))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Post update" })))
    expect(p.post).toHaveBeenCalledWith({ health: "off_track", body: DRAFT.text, shared_with_client: true, channel_uuid: undefined })
    expect(p.onDone).toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Update posted" }))
  })

  it("edits an update without drafting over it", async () => {
    const editing = { id: "u9", body: "Old note", health: "done", shared_with_client: false } as never
    const p = setup({ editing })
    expect(p.draft).not.toHaveBeenCalled()
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Old note")
    expect(screen.queryByRole("button", { name: /Add an AI summary/ })).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    expect(p.edit).toHaveBeenCalledWith("u9", { health: "done", body: "Old note", shared_with_client: false })
  })
})
