import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
vi.mock("react-redux", () => ({
  useSelector: (pick: (s: unknown) => unknown) =>
    pick({ users: { userSidebar: { userChannels: [{ ch_uuid: "c-eng", ch_name: "engineering", ch_is_member: true }] } } }),
}))

const { UpdateComposer } = await import("@/components/projectUpdates/UpdateComposer")
const { useEscapeClosesPanel } = await import("@/hooks/useEscapeClosesPanel")
// Loaded with the file, not inside the test: the updates tab is a large
// module, and loaded in the test it ran the test past its 5 s under a busy
// gate.
const { UpdatePrompt } = await import("@/components/projectUpdates/ProjectUpdates")

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
    await waitFor(() => expect((screen.getByLabelText(/Drafted from the project's tasks/) as HTMLTextAreaElement).value).toBe(`\n\n${DRAFT.text}`))
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
    expect(area.value).toBe(`\n\n${DRAFT.text}`)
  })

  it("starts the cursor on a line of its own above the draft, so typing doesn't run into it (PTC-23)", async () => {
    setup()
    const area = screen.getByRole("textbox") as HTMLTextAreaElement
    await waitFor(() => expect(area.value).toBe(`\n\n${DRAFT.text}`))
    await waitFor(() => expect(document.activeElement).toBe(area))
    expect(area.selectionStart).toBe(0)
    // What is typed there stands apart from the draft.
    const typed = "On track for the launch." + area.value.slice(area.selectionStart)
    expect(typed.split("\n")[0]).toBe("On track for the launch.")
  })

  it("posts the health, the text, the client choice and the channel", async () => {
    const p = setup()
    await waitFor(() => expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(`\n\n${DRAFT.text}`))
    fireEvent.click(screen.getByRole("radio", { name: /Off track/ }))
    fireEvent.click(screen.getByRole("checkbox"))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Post update" })))
    expect(p.post).toHaveBeenCalledWith({ health: "off_track", body: DRAFT.text, shared_with_client: true, channel_uuid: undefined })
    expect(p.onDone).toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Update posted" }))
  })

  it("closes on Escape, and only the composer: a panel open beside it stays", async () => {
    const closePanel = vi.fn()
    function PanelBeside() {
      useEscapeClosesPanel(true, closePanel)
      return null
    }
    render(<PanelBeside />)
    const p = setup()
    await waitFor(() => expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(`\n\n${DRAFT.text}`))
    // From a health choice, a button: nothing to leave, so it is the composer's Escape.
    const pill = screen.getByRole("radio", { name: /On track/ })
    pill.focus()
    fireEvent.keyDown(pill, { key: "Escape" })
    expect(p.onDone).toHaveBeenCalled()
    expect(closePanel).not.toHaveBeenCalled()
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

describe("the prompt card at the top of the updates (work.md W27)", () => {
  it("offers three health chips that say which is pressed, and opens the composer with it", () => {
    const onOpen = vi.fn()
    render(<UpdatePrompt projectName="Q4 launch" onOpen={onOpen} />)
    expect(screen.getByText("How is Q4 launch going?")).toBeInTheDocument()
    const chips = ["On track", "At risk", "Off track"].map((n) => screen.getByRole("button", { name: n }))
    for (const c of chips) expect(c).toHaveAttribute("aria-pressed", "false")
    fireEvent.click(chips[1])
    expect(onOpen).toHaveBeenCalledWith("at_risk")
    expect(chips[1]).toHaveAttribute("aria-pressed", "true")
    fireEvent.click(screen.getByRole("button", { name: /Draft from tasks/ }))
    expect(onOpen).toHaveBeenLastCalledWith("at_risk")
  })
})
