import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const makeRequest = vi.hoisted(() => vi.fn())
const toastSpy = vi.hoisted(() => vi.fn())
// The kinds of event the server lists, or none when that request fails.
const catalogue = vi.hoisted(() => ({ types: ["post.created", "task.created"] as string[] | undefined }))

vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) =>
    url.includes("event")
      ? { data: catalogue.types && { event_types: catalogue.types }, isLoading: false }
      : { data: { channels_list: [] }, isLoading: false },
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

// The incoming channel's help offered dm_id and group_chat_id, which were
// written as the admin who made the webhook; the server refuses both now.
const expectChannelsOnly = () => {
  const help = screen.getByText(/Used when a message doesn/).textContent ?? ""
  expect(help).toMatch(/channel_id/)
  expect(help).toMatch(/to message people, use an app/)
  expect(help).not.toMatch(/dm_id|group_chat_id/)
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

  it("says an incoming webhook posts only in channels", () => {
    render(<WebhookCreateDialog open onOpenChange={() => {}} onSuccess={() => {}} />)
    expectChannelsOnly()
  })

  // CR-29's MF1 (24 Oct 2026): the channel select kept an id of its own in its Field, so the label named nothing:
  // an unnamed combobox, and an untitled sheet on a phone.
  it("names its channel select by its label", () => {
    render(<WebhookCreateDialog open onOpenChange={() => {}} onSuccess={() => {}} />)
    expect(screen.getByRole("combobox", { name: "Channel to post in" })).toBeTruthy()
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
    fireEvent.click(screen.getByRole("checkbox", { name: "post.created" }))
    fireEvent.click(screen.getByRole("button", { name: "Create webhook" }))
    const url = screen.getByLabelText(/^Address to send to/)
    await waitFor(() => expect(url.getAttribute("aria-invalid")).toBe("true"))
    expect(screen.getByText(/starts with https:\/\//)).toBeTruthy()
    expect(toastSpy).not.toHaveBeenCalled()
  })

  // An outgoing webhook is sent only the events ticked. With none it was made
  // anyway, said "it is sent every event", and was sent nothing (V-112).
  it("keeps Create waiting until an outgoing webhook has an event ticked, and says why", async () => {
    render(<WebhookCreateDialog open onOpenChange={() => {}} onSuccess={() => {}} />)
    const create = screen.getByRole("button", { name: "Create webhook" })
    // An incoming webhook is sent no events: nothing to wait for.
    expect(create.getAttribute("aria-disabled")).toBeNull()
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "CRM sync" } })
    await chooseOutgoing()
    fireEvent.change(screen.getByLabelText(/^Address to send to/), { target: { value: "https://crm.example.com" } })
    const why = "Choose at least one event to send: a webhook with none is sent nothing."
    expect(create.getAttribute("aria-disabled")).toBe("true")
    expect(create.getAttribute("data-disabled-reason")).toBe(why)
    expect(screen.getByText(why)).toBeTruthy()
    expect(screen.queryByText(/every event/)).toBeNull()
    fireEvent.click(create)
    expect(makeRequest).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("checkbox", { name: "post.created" }))
    expect(create.getAttribute("aria-disabled")).toBeNull()
    fireEvent.click(create)
    await waitFor(() => expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ events: ["post.created"] }) })))
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

// zoom-15: a call's beginning and end reach a webhook only from the calls in
// channels and meetings its maker can open, as ids, times and counts; a DM's
// or a group chat's call never does.
describe("the call events", () => {
  it("say who they reach, beside them", async () => {
    const { WebhookEventChoice } = await import("@/components/admin/WebhookCreateDialog")
    render(<WebhookEventChoice events={["post.created", "call.started", "call.ended"]} chosen={[]} onChange={() => {}} idPrefix="t" />)
    expect(screen.getByRole("group", { name: "call" }).getAttribute("aria-describedby")).toBe("t-n-call")
    expect(document.getElementById("t-n-call")?.textContent).toBe(
      "Sent only for calls in channels and meetings whoever sets up the webhook can open. Ids, times and how many joined, never a name or anything said. A call in a DM or a group chat is never sent.",
    )
  })

  it("stay ticked on a webhook that has them when the server's list doesn't load", async () => {
    catalogue.types = undefined
    onTestFinished(() => {
      catalogue.types = ["post.created", "task.created"]
    })
    const webhook = { id: "w3", name: "Call log", type: "outgoing" as const, target_url: "https://calls.example.com", bot_name: "Bot", events: '["call.started","call.ended"]', is_active: true }
    render(<WebhookEditDialog open onOpenChange={() => {}} onSuccess={() => {}} webhook={webhook} />)
    for (const name of ["call.started", "call.ended"]) {
      const box = await screen.findByRole("checkbox", { name })
      await waitFor(() => expect(box.getAttribute("aria-checked")).toBe("true"))
    }
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

  it("says an incoming webhook posts only in channels", () => {
    render(<WebhookEditDialog open onOpenChange={() => {}} onSuccess={() => {}} webhook={{ id: "w3", name: "Deploys", type: "incoming", bot_name: "Deploys", is_active: true }} />)
    expectChannelsOnly()
  })

  it("names an incoming webhook's channel select by its label", () => {
    render(<WebhookEditDialog open onOpenChange={() => {}} onSuccess={() => {}} webhook={{ id: "w3", name: "Deploys", type: "incoming", bot_name: "Deploys", is_active: true }} />)
    expect(screen.getByRole("combobox", { name: "Channel to post in" })).toBeTruthy()
  })

  // One kept from before V-112 can have no events: it is sent nothing, so Save
  // waits for a tick, as the server does.
  it("keeps Save waiting while an outgoing webhook has no event ticked", async () => {
    render(<WebhookEditDialog open onOpenChange={() => {}} onSuccess={() => {}} webhook={{ ...webhook, events: undefined }} />)
    const save = screen.getByRole("button", { name: "Save changes" })
    await waitFor(() => expect(save.getAttribute("aria-disabled")).toBe("true"))
    expect(save.getAttribute("data-disabled-reason")).toBe("Choose at least one event to send: a webhook with none is sent nothing.")
    fireEvent.click(save)
    expect(makeRequest).not.toHaveBeenCalled()

    fireEvent.click(await screen.findByRole("checkbox", { name: "post.created" }))
    expect(save.getAttribute("aria-disabled")).toBeNull()
    fireEvent.click(save)
    await waitFor(() => expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ events: ["post.created"] }) })))
  })

  it("saves an incoming webhook, which is sent no events", async () => {
    render(<WebhookEditDialog open onOpenChange={() => {}} onSuccess={() => {}} webhook={{ id: "w3", name: "Deploys", type: "incoming", bot_name: "Deploys", is_active: true }} />)
    const save = screen.getByRole("button", { name: "Save changes" })
    expect(save.getAttribute("aria-disabled")).toBeNull()
    fireEvent.click(save)
    await waitFor(() => expect(makeRequest).toHaveBeenCalled())
  })

  // Save sent the scope the dialog showed, and it showed the whole workspace
  // when it wasn't told the webhook's own: one set up for a channel or a
  // project was widened by any save (V-113). The server keeps a webhook's
  // scope when a change names none.
  it("keeps the webhook's own scope unless the admin changes it", async () => {
    const PROJECT = "4b0c8f2e-6d1a-4c55-9e0b-2f3a1c7d8e90"
    const OTHER = "9a1d2c3b-4e5f-4a6b-8c7d-0e1f2a3b4c5d"
    // What the server keeps: the scope a change names, or the one it had.
    const after = (had: { scope_type: string; scope_entity_id?: string }) => {
      const sent = makeRequest.mock.calls[0][0].payload
      return "scope_type" in sent ? { scope_type: sent.scope_type, scope_entity_id: sent.scope_entity_id } : had
    }
    const project = { scope_type: "project", scope_entity_id: PROJECT }
    // Told its scope, and not told it (as the list opened it): renaming keeps it.
    for (const [opened, had] of [[{ ...webhook, ...project }, project], [webhook, { scope_type: "channel", scope_entity_id: "c1" }]] as const) {
      makeRequest.mockClear()
      render(<WebhookEditDialog open onOpenChange={() => {}} onSuccess={() => {}} webhook={opened} />)
      fireEvent.change(await screen.findByLabelText(/^Name/), { target: { value: "CRM sync, renamed" } })
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }))
      await waitFor(() => expect(makeRequest).toHaveBeenCalled())
      expect(after(had)).toEqual(had)
      cleanup()
    }

    // A scope the admin chooses is sent.
    makeRequest.mockClear()
    render(<WebhookEditDialog open onOpenChange={() => {}} onSuccess={() => {}} webhook={{ ...webhook, ...project }} />)
    fireEvent.change(await screen.findByLabelText("Project ID"), { target: { value: OTHER } })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(makeRequest).toHaveBeenCalled())
    expect(after(project)).toEqual({ scope_type: "project", scope_entity_id: OTHER })
  })
})
