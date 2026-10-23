import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const makeRequest = vi.hoisted(() => vi.fn())
const toastSpy = vi.hoisted(() => vi.fn())

vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) =>
    url.includes("event") ? { data: { event_types: ["post.created", "task.created"] }, isLoading: false } : { data: { channels_list: [] }, isLoading: false },
}))
vi.mock("@/components/admin/useEveryChannel", () => ({
  useEveryChannel: () => ({ channels: [], isLoading: false, isError: false }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: toastSpy }))

import WebhookCreateDialog from "@/components/admin/WebhookCreateDialog"
import WebhookEditDialog from "@/components/admin/WebhookEditDialog"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const chooseOutgoing = async () => {
  // The type picker is a Radix select; its trigger is named by its label.
  fireEvent.click(screen.getByRole("radio", { name: /Outgoing/ }))
  await screen.findByRole("checkbox", { name: "post.created" })
}

describe("new webhook", () => {
  // The kind was a hand-made radio pair that marked the choice with the page
  // colour alone (1.03:1 against its well); it is the app's segmented control.
  it("picks its kind with the app's segmented control", () => {
    render(<WebhookCreateDialog open onOpenChange={() => {}} onSuccess={() => {}} />)
    const group = screen.getByRole("radiogroup", { name: "Kind" })
    const incoming = screen.getByRole("radio", { name: "Incoming" })
    expect(group.contains(incoming)).toBe(true)
    expect(incoming.getAttribute("data-state")).toBe("checked")
    // The house segmented control: a tab of the interaction layer in its well,
    // which raises the chosen one (app/interaction.css, [data-segmented]).
    expect(incoming.closest("[data-segmented]")).not.toBeNull()
    expect(incoming.getAttribute("data-interactive")).toBe("tab")
    expect(incoming.className).not.toMatch(/(^|\s)bg-background(\s|$)/)
  })

  it("is titled in sentence case", () => {
    render(<WebhookCreateDialog open onOpenChange={() => {}} onSuccess={() => {}} />)
    expect(screen.getByRole("heading", { name: "New webhook" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Create webhook" })).toBeTruthy()
  })

  // Each event was a <span> with an onClick: not focusable, no role, no
  // pressed state, so a keyboard could not choose one.
  it("lets a keyboard choose events, as checkboxes", async () => {
    render(<WebhookCreateDialog open onOpenChange={() => {}} onSuccess={() => {}} />)
    await chooseOutgoing()
    const box = screen.getByRole("checkbox", { name: "post.created" })
    box.focus()
    expect(document.activeElement).toBe(box)
    fireEvent.click(box)
    expect(box.getAttribute("aria-checked")).toBe("true")
    expect(screen.getByText("1 event chosen.")).toBeTruthy()
  })

  // A missing name was a red "Validation Error" toast in the corner, tied to
  // no field.
  it("says a missing name under the name, and puts the cursor there", async () => {
    render(<WebhookCreateDialog open onOpenChange={() => {}} onSuccess={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Create webhook" }))
    const name = screen.getByLabelText(/^Name/)
    await waitFor(() => expect(name.getAttribute("aria-invalid")).toBe("true"))
    expect(screen.getByText("Give the webhook a name.")).toBeTruthy()
    expect(document.activeElement).toBe(name)
    expect(toastSpy).not.toHaveBeenCalled()
    expect(makeRequest).not.toHaveBeenCalled()
  })

  it("says an address that isn't https under the address", async () => {
    render(<WebhookCreateDialog open onOpenChange={() => {}} onSuccess={() => {}} />)
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "CRM sync" } })
    await chooseOutgoing()
    fireEvent.change(screen.getByLabelText(/^Address to send to/), { target: { value: "http://crm.example.com" } })
    fireEvent.click(screen.getByRole("button", { name: "Create webhook" }))
    const url = screen.getByLabelText(/^Address to send to/)
    await waitFor(() => expect(url.getAttribute("aria-invalid")).toBe("true"))
    expect(screen.getByText(/starts with https:\/\//)).toBeTruthy()
    expect(toastSpy).not.toHaveBeenCalled()
  })
})

// An incoming webhook's token is kept only as its hash (audit A1): the answer
// that makes it is the one place it can be read, so the dialog shows it there.
describe("a new incoming webhook", () => {
  it("shows its address once, with Copy, and closes on Done", async () => {
    const base = process.env.NEXT_PUBLIC_BACKEND_URL
    process.env.NEXT_PUBLIC_BACKEND_URL = "https://api.example.com/"
    onTestFinished(() => void (process.env.NEXT_PUBLIC_BACKEND_URL = base))
    const onSuccess = vi.fn()
    const onOpenChange = vi.fn()
    makeRequest.mockResolvedValueOnce({ webhook: { id: "w9", name: "Alerts", type: "incoming", token: "tok777" } })
    render(<WebhookCreateDialog open onOpenChange={onOpenChange} onSuccess={onSuccess} />)
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Alerts" } })
    fireEvent.click(screen.getByRole("button", { name: "Create webhook" }))
    await waitFor(() => expect(screen.getByRole("dialog").textContent).toContain("https://api.example.com/webhook/incoming/tok777"))
    expect(screen.getByRole("button", { name: "Copy address" })).toBeTruthy()
    expect(onSuccess).toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

// Docs programme C4: a doc's events reach a webhook only when whoever set it up
// can open the doc, and the picker says so beside them.
describe("the doc events", () => {
  it("say who they reach, beside them and nowhere else", async () => {
    const { WebhookEventChoice, FALLBACK_EVENT_TYPES } = await import("@/components/admin/WebhookCreateDialog")
    expect(FALLBACK_EVENT_TYPES).toEqual(expect.arrayContaining(["doc.created", "doc.updated", "doc.deleted", "doc.shared", "doc.comment.created"]))
    render(<WebhookEventChoice events={["post.created", "doc.created", "doc.updated"]} chosen={[]} onChange={() => {}} idPrefix="t" />)
    const docs = screen.getByRole("group", { name: "doc" })
    expect(docs.getAttribute("aria-describedby")).toBe("t-n-doc")
    expect(document.getElementById("t-n-doc")?.textContent).toMatch(/^Sent only for docs whoever sets up the webhook can open\. A private doc's title is never sent/)
    expect(screen.getByRole("group", { name: "post" }).getAttribute("aria-describedby")).toBeNull()
  })
})

describe("edit webhook", () => {
  const webhook = { id: "w2", name: "CRM sync", type: "outgoing" as const, target_url: "https://crm.example.com", bot_name: "Bot", events: '["task.created"]', is_active: true }

  it("is titled in sentence case and shows the chosen events as ticked boxes", async () => {
    render(<WebhookEditDialog open onOpenChange={() => {}} onSuccess={() => {}} webhook={webhook} />)
    expect(screen.getByRole("heading", { name: "Edit webhook" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy()
    const box = await screen.findByRole("checkbox", { name: "task.created" })
    await waitFor(() => expect(box.getAttribute("aria-checked")).toBe("true"))
  })

  it("says a cleared name under the name instead of a toast", async () => {
    render(<WebhookEditDialog open onOpenChange={() => {}} onSuccess={() => {}} webhook={webhook} />)
    const name = await screen.findByLabelText(/^Name/)
    fireEvent.change(name, { target: { value: "  " } })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(name.getAttribute("aria-invalid")).toBe("true"))
    expect(toastSpy).not.toHaveBeenCalled()
  })

  it("ties the active switch to its label", () => {
    render(<WebhookEditDialog open onOpenChange={() => {}} onSuccess={() => {}} webhook={webhook} />)
    expect(screen.getByRole("switch", { name: "Active" })).toBeTruthy()
  })
})
