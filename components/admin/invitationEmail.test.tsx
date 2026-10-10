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

  // Its parts are plain 14px headings, as the task panel names its sections;
  // they carried 24px tiles beside them, which no other admin heading has.
  it("labels its fields in sentence case, under plain headings", () => {
    state.config = ready()
    render(<EmailSettingsCard />)
    expect(screen.getByLabelText("Sender address")).toBeTruthy()
    expect(screen.getByLabelText("Template (HTML)")).toBeTruthy()
    expect(screen.queryByText(/Email Subject|Message Template|Live Preview|Reset to Default/)).toBeNull()
    const headings = screen.getAllByRole("heading", { level: 3 })
    expect(headings.map((h) => h.textContent)).toEqual(expect.arrayContaining(["Logo", "Message", "Preview"]))
    headings.forEach((h) => expect(h.querySelector("[class*='hue-'], svg")).toBeNull())
    expect(document.querySelector(".text-primary svg, svg.text-primary")).toBeNull()
  })

  // From, Subject and To started at 1059, 1048 and 1059px, and "Subject" ran
  // into its value: the labels had no column of their own.
  it("lines the preview's values up in one column beside their labels", () => {
    state.config = ready()
    render(<EmailSettingsCard />)
    const from = screen.getByText("From")
    expect(from.tagName).toBe("DT")
    const list = from.closest("dl") as HTMLElement
    expect(list.className).toContain("grid-cols-[4.5rem_minmax(0,1fr)]")
    expect(Array.from(list.querySelectorAll("dt")).map((d) => d.textContent)).toEqual(["From", "Subject", "To"])
    expect(list.querySelectorAll("dd")).toHaveLength(3)
  })

  // The body lost the email's own formatting (its heading and its link drew as
  // plain lines, under the app's reset styles); in a frame of its own it reads
  // as a mail client shows it, and nothing in it can run.
  it("shows the body as a mail client would, in a sandboxed frame", () => {
    state.config = { ...ready(), data: { data: { ...saved, invitation_email_template: "<h2>Hello</h2><p>{{inviter_name}} invited you.</p><script>alert(1)</script>" } } }
    render(<EmailSettingsCard />)
    const frame = screen.getByTitle("The invitation email, as it is sent") as HTMLIFrameElement
    expect(frame.tagName).toBe("IFRAME")
    expect(frame.getAttribute("sandbox")).toBe("")
    const doc = frame.getAttribute("srcdoc") ?? ""
    expect(doc).toContain("<h2>Hello</h2>")
    expect(doc).toContain("Priya Raman invited you.")
    expect(doc).not.toContain("<script")
  })

  // The drop zone was a dashed box inside a bordered box.
  it("offers the logo in one box", () => {
    state.config = ready()
    render(<EmailSettingsCard />)
    const section = screen.getByRole("heading", { level: 3, name: "Logo" }).closest("section") as HTMLElement
    const boxes = Array.from(section.querySelectorAll("*")).filter(
      (el) => el.tagName !== "BUTTON" && /(^|\s)border(-2)?(\s|$)/.test(el.getAttribute("class") ?? ""),
    )
    expect(boxes).toHaveLength(1)
    expect(boxes[0].className).toContain("border-dashed")
  })

  // The sender address's field takes the row's width when the row is too
  // narrow to hold it beside its words, and the list keeps one field height.
  it("gives the sender's field the row's width when it goes under its words", () => {
    state.config = ready()
    render(<EmailSettingsCard />)
    const sender = screen.getByLabelText("Sender address")
    expect(sender.className).toContain("w-full")
    expect(sender.className).toContain("@xl:w-64")
    expect(sender.className).not.toMatch(/(^|\s)h-8(\s|$)/)
    expect(screen.getByLabelText("Subject").className).not.toMatch(/(^|\s)h-8(\s|$)/)
  })

  it("previews a plain email, without a fake window's dots or a heavy shadow", () => {
    state.config = ready()
    const { container } = render(<EmailSettingsCard />)
    expect(container.querySelector("[class*='#ff5f56'], [class*='#27c93f']")).toBeNull()
    expect(container.querySelector(".shadow-xl")).toBeNull()
    expect(screen.getByText("noreply@kestrel.studio")).toBeTruthy()
  })
})
