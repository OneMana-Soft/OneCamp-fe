import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// The profile's fields card (the page's and the phone dialog's one copy) saves
// a profile whatever made its names, and sends the handle only when it
// changes. It used to refuse "sam_1a2b3" (what a name collision produced) on
// every save, and to resend the handle every time. It is batched: Save in the
// card's footer, disabled until something changed (design v3, admin §1.3).

const { post, fetched, confirm } = vi.hoisted(() => ({
  post: vi.fn(),
  fetched: { data: { data: {} as Record<string, unknown> }, mutate: () => {} },
  confirm: vi.fn(),
}))
const profile = {
  user_uuid: "u1",
  user_name: "sam_1a2b3",
  user_full_name: "sam_1a2b3",
  user_handle: "sam_1a2b3",
  user_profile_object_key: "",
  user_app_lang: "en",
  user_status: "online",
}
fetched.data.data = profile
// The same answer on every render, as SWR gives.
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => fetched }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
vi.mock("@/components/dialog/appLanguageCombobox", () => ({ AppLanguageCombobox: () => null }))
vi.mock("@/lib/axiosInstance", () => ({ default: { get: vi.fn(async () => ({ data: {} })), post }, OWN_ERRORS: { suppressErrorToast: true } }))

import { ProfileFieldsCard } from "./ProfileFieldsCard"

beforeEach(() => {
  post.mockResolvedValue({})
})
afterEach(() => {
  cleanup()
  post.mockReset()
})

/** The profile request's body: the axios call is (url, body, config). */
const sent = () => post.mock.calls.find((c) => String(c[0]).includes("pdate"))?.[1]

function open() {
  const onSaved = vi.fn()
  render(<ProfileFieldsCard onSaved={onSaved} />)
  return onSaved
}

const save = async () => {
  await act(async () => void fireEvent.submit(document.getElementById("profile-fields")!))
}

describe("saving a profile", () => {
  it("saves under names from before the rule, without sending the handle", async () => {
    const onSaved = open()
    await waitFor(() => expect((screen.getByLabelText("Handle") as HTMLInputElement).value).toBe("sam_1a2b3"))
    fireEvent.change(screen.getByLabelText("jobTitle"), { target: { value: "Designer" } })
    await save()
    expect(post).toHaveBeenCalledTimes(1)
    const payload = sent()
    expect(payload.user_name).toBe("sam_1a2b3")
    expect(payload.user_job_title).toBe("Designer")
    expect(payload).not.toHaveProperty("user_handle")
    expect(onSaved).toHaveBeenCalled()
  })

  it("sends a changed handle as it is kept", async () => {
    open()
    await waitFor(() => expect((screen.getByLabelText("Handle") as HTMLInputElement).value).toBe("sam_1a2b3"))
    fireEvent.change(screen.getByLabelText("Handle"), { target: { value: "@Sam.Rivera" } })
    await save()
    expect(sent().user_handle).toBe("sam.rivera")
  })

  it("stays open when the server refuses, so it can be fixed", async () => {
    post.mockRejectedValue(new Error("409"))
    const onSaved = open()
    await waitFor(() => expect((screen.getByLabelText("Handle") as HTMLInputElement).value).toBe("sam_1a2b3"))
    fireEvent.change(screen.getByLabelText("Handle"), { target: { value: "taken" } })
    await save()
    expect(post).toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  // A refusal is said where it can be fixed. The server answers a handle
  // someone else has with 409 and "@x is taken. Try another."; it used to
  // reach only a toast, which went while the person was still reading.
  it("says a taken handle under the handle field", async () => {
    post.mockRejectedValue({ response: { status: 409, data: { msg: "@taken is taken. Try another." } } })
    open()
    await waitFor(() => expect((screen.getByLabelText("Handle") as HTMLInputElement).value).toBe("sam_1a2b3"))
    fireEvent.change(screen.getByLabelText("Handle"), { target: { value: "taken" } })
    await save()
    expect(screen.getByLabelText("Handle")).toHaveAccessibleDescription(expect.stringContaining("@taken is taken. Try another."))
    expect(post.mock.calls[0][2]).toEqual({ suppressErrorToast: true })
  })

  it("says any other failure under the fields, in words a person can act on", async () => {
    post.mockRejectedValue({ message: "Network Error" })
    const onSaved = open()
    await waitFor(() => expect((screen.getByLabelText("Handle") as HTMLInputElement).value).toBe("sam_1a2b3"))
    fireEvent.change(screen.getByLabelText("jobTitle"), { target: { value: "Designer" } })
    await save()
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save your profile. The server could not be reached.")
    expect(onSaved).not.toHaveBeenCalled()
  })
})

// Batched: the footer is always there, Save waits for a change, and Reset
// puts the fields back (design v3, admin §1.3, "Saved together").
describe("the card's footer", () => {
  it("holds Save disabled until a field changes, then offers Reset", async () => {
    open()
    await waitFor(() => expect((screen.getByLabelText("Handle") as HTMLInputElement).value).toBe("sam_1a2b3"))
    expect(screen.getByText(/Saved together/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull()
    fireEvent.change(screen.getByLabelText("jobTitle"), { target: { value: "Designer" } })
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled())
    fireEvent.click(screen.getByRole("button", { name: "Reset" }))
    await waitFor(() => expect((screen.getByLabelText("jobTitle") as HTMLInputElement).value).toBe(""))
  })

  it("marks a new handle that passes the rule with a check", async () => {
    open()
    await waitFor(() => expect((screen.getByLabelText("Handle") as HTMLInputElement).value).toBe("sam_1a2b3"))
    fireEvent.change(screen.getByLabelText("Handle"), { target: { value: "sam.rivera" } })
    await waitFor(() => expect(screen.getByLabelText("This handle can be used")).toBeInTheDocument())
  })
})

// The three names are told apart: which one people see on messages, which is
// the whole name, and which one they @mention. The fields used to read "Full
// Name", "Display Name" and "Handle" with nothing to say what each was for.
describe("the name fields", () => {
  it("come display name first, each with a line saying what it is for", async () => {
    open()
    await waitFor(() => expect(screen.getByLabelText("Display name")).toBeInTheDocument())
    expect(screen.getByLabelText("Display name")).toHaveAccessibleDescription("Shown on your messages.")
    expect(screen.getByLabelText("Full name")).toHaveAccessibleDescription(/Your whole name/)
    expect(screen.getByLabelText("Handle")).toHaveAccessibleDescription("How people @mention you.")
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("#profile-fields input[name]")).map((i) => i.name)
    expect(inputs.slice(0, 3)).toEqual(["displayName", "fullName", "handle"])
  })

  // The fields asked for h-10 and the language picker beside them is h-11
  // md:h-9: once a field's own height held from md up, the grid mixed 40px
  // fields with a 36px picker (the bar's one control height per group).
  it("keeps every field of the grid at the input's own height, the language picker's", async () => {
    open()
    await screen.findByLabelText("Display name")
    const inputs = document.querySelectorAll<HTMLInputElement>("#profile-fields input:not([type=file]):not([type=checkbox]):not([aria-hidden=true])")
    expect(inputs.length).toBeGreaterThan(4)
    for (const input of inputs) {
      expect(input.className, input.name).not.toMatch(/(^|\s)h-10(\s|$)/)
      expect(input.className, input.name).toContain("md:h-8")
      expect(input.className, input.name).toMatch(/(^|\s)h-11(\s|$)/)
    }
  })
})
