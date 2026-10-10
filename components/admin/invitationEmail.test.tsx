import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

// The invitation email's settings. A failed read used to show an empty form,
// and saving it would replace the subject and template with nothing; it now
// says so, with Try again. Edits wait in the save bar, and a refetch (SWR asks
// again when the window regains focus) no longer wipes an edit in progress.
// Labels are sentence case, the section icons sit on the workspace group's
// sun tiles, and the preview is a plain email, without a fake window's
// coloured dots.

const state = vi.hoisted(() => ({
  config: { data: undefined as unknown, isLoading: false, isError: undefined as unknown, mutate: vi.fn() },
}))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => state.config,
  useFetchOnlyOnce: () => ({ data: { data: { user_name: "Priya Raman" } } }),
}))
const post = vi.hoisted(() => ({ makeRequest: vi.fn(), isSubmitting: false }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => post }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))
vi.mock("@/lib/axiosInstance", () => ({ default: { post: vi.fn() } }))

const { default: EmailSettingsCard } = await import("./EmailSettingsCard")

const saved = {
  has_logo: false,
  sender_email: "",
  default_sender: "noreply@kestrel.studio",
  invitation_email_subject: "Join Kestrel on OneCamp",
  invitation_email_template: "<p>{{inviter_name}} invited you.</p>",
}
const ready = () => ({ data: { data: saved }, isLoading: false, isError: undefined, mutate: vi.fn() })

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  state.config = { data: undefined, isLoading: false, isError: undefined, mutate: vi.fn() }
})

const saveBar = () => screen.getByRole("region", { name: "Unsaved changes" })

describe("the invitation email", () => {
  it("offers no form to save over when it couldn't be read", () => {
    const mutate = vi.fn()
    state.config = { data: undefined, isLoading: false, isError: new Error("503"), mutate }
    render(<EmailSettingsCard />)
    expect(screen.getByText("Couldn't load the invitation email")).toBeTruthy()
    expect(screen.queryByLabelText("Subject")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(mutate).toHaveBeenCalled()
  })

  it("holds edits in the save bar, saves them, and Discard puts them back", async () => {
    state.config = ready()
    post.makeRequest.mockResolvedValue({})
    render(<EmailSettingsCard />)
    const subject = screen.getByLabelText("Subject") as HTMLInputElement
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull()
    fireEvent.change(subject, { target: { value: "Come and join us" } })
    fireEvent.click(within(saveBar()).getByRole("button", { name: "Discard" }))
    expect(subject.value).toBe("Join Kestrel on OneCamp")
    fireEvent.change(subject, { target: { value: "Come and join us" } })
    await act(async () => void fireEvent.click(within(saveBar()).getByRole("button", { name: "Save" })))
    expect(post.makeRequest).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ invitation_email_subject: "Come and join us" }),
    }))
  })

  it("keeps an edit in progress when the settings are fetched again", () => {
    state.config = ready()
    const { rerender } = render(<EmailSettingsCard />)
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Come and join us" } })
    // The same settings, answered again: a new object, as a refetch gives.
    state.config = { ...ready(), data: { data: { ...saved } } }
    rerender(<EmailSettingsCard />)
    expect((screen.getByLabelText("Subject") as HTMLInputElement).value).toBe("Come and join us")
    expect(saveBar()).toBeTruthy()
  })

  it("labels its fields in sentence case and puts its icons on sun tiles", () => {
    state.config = ready()
    render(<EmailSettingsCard />)
    expect(screen.getByLabelText("Sender address")).toBeTruthy()
    expect(screen.getByLabelText("Template (HTML)")).toBeTruthy()
    expect(screen.queryByText(/Email Subject|Message Template|Live Preview|Reset to Default/)).toBeNull()
    const headings = screen.getAllByRole("heading", { level: 3 })
    expect(headings.some((h) => h.querySelector(".hue-sun svg"))).toBe(true)
    expect(document.querySelector(".text-primary svg, svg.text-primary")).toBeNull()
  })

  it("previews a plain email, without a fake window's dots or a heavy shadow", () => {
    state.config = ready()
    const { container } = render(<EmailSettingsCard />)
    expect(container.querySelector("[class*='#ff5f56'], [class*='#27c93f']")).toBeNull()
    expect(container.querySelector(".shadow-xl")).toBeNull()
    expect(screen.getByText("noreply@kestrel.studio")).toBeTruthy()
  })
})
