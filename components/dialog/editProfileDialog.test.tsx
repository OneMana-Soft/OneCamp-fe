import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// The profile editor saves a profile whatever made its names, and sends the
// handle only when it changes. It used to refuse "sam_1a2b3" (what a name
// collision produced) on every save, and to resend the handle every time.

const { post, fetched, confirm, upload } = vi.hoisted(() => ({
  post: vi.fn(),
  fetched: { data: { data: {} as Record<string, unknown> }, mutate: () => {} },
  confirm: vi.fn(),
  upload: vi.fn(),
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
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: "" }) }))
vi.mock("@/hooks/useUploadFile", () => ({ useUploadFile: () => ({ makeRequestToUploadToPublic: upload, isSubmitting: false }) }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light", setTheme: vi.fn() }) }))
vi.mock("@/components/activeTheme/ColorThemePicker", () => ({ ColorThemePicker: () => null }))
vi.mock("@/components/profile/ChangePasswordSection", () => ({ ChangePasswordSection: () => null }))
vi.mock("@/components/profile/TwoFactorSection", () => ({ TwoFactorSection: () => null }))
vi.mock("@/components/profile/PasskeySection", () => ({ PasskeySection: () => null }))
vi.mock("@/components/dialog/appLanguageCombobox", () => ({ AppLanguageCombobox: () => null }))
vi.mock("@/lib/axiosInstance", () => ({ default: { get: vi.fn(async () => ({ data: {} })), post }, OWN_ERRORS: { suppressErrorToast: true } }))

import EditProfileDialog from "./editProfileDailog"

beforeEach(() => {
  post.mockResolvedValue({})
})
afterEach(() => {
  cleanup()
  post.mockReset()
  confirm.mockReset()
  upload.mockReset()
})

/** The profile request's body: the axios call is (url, body, config). */
const sent = () => post.mock.calls.find((c) => String(c[0]).includes("pdate"))?.[1]

function open() {
  const setOpenState = vi.fn()
  render(<EditProfileDialog dialogOpenState setOpenState={setOpenState} />)
  return setOpenState
}

const save = async () => {
  await act(async () => void fireEvent.submit(document.getElementById("profile-edit-form")!))
}

describe("saving a profile", () => {
  it("saves under names from before the rule, without sending the handle", async () => {
    const setOpenState = open()
    await waitFor(() => expect((screen.getByLabelText("Handle") as HTMLInputElement).value).toBe("sam_1a2b3"))
    fireEvent.change(screen.getByLabelText("jobTitle"), { target: { value: "Designer" } })
    await save()
    expect(post).toHaveBeenCalledTimes(1)
    const payload = sent()
    expect(payload.user_name).toBe("sam_1a2b3")
    expect(payload.user_job_title).toBe("Designer")
    expect(payload).not.toHaveProperty("user_handle")
    expect(setOpenState).toHaveBeenCalledWith(false)
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
    const setOpenState = open()
    await waitFor(() => expect((screen.getByLabelText("Handle") as HTMLInputElement).value).toBe("sam_1a2b3"))
    fireEvent.change(screen.getByLabelText("Handle"), { target: { value: "taken" } })
    await save()
    expect(post).toHaveBeenCalled()
    expect(setOpenState).not.toHaveBeenCalledWith(false)
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
    const setOpenState = open()
    await waitFor(() => expect((screen.getByLabelText("Handle") as HTMLInputElement).value).toBe("sam_1a2b3"))
    fireEvent.change(screen.getByLabelText("jobTitle"), { target: { value: "Designer" } })
    await save()
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save your profile. The server could not be reached.")
    expect(setOpenState).not.toHaveBeenCalledWith(false)
  })

  it("stops, and says so, when the new photo didn't upload", async () => {
    upload.mockResolvedValue([])
    open()
    await waitFor(() => expect((screen.getByLabelText("Handle") as HTMLInputElement).value).toBe("sam_1a2b3"))
    const file = new File(["x"], "me.png", { type: "image/png" })
    fireEvent.change(document.getElementById("imageUpload")!, { target: { files: [file] } })
    await save()
    expect(post).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't upload your photo")
  })
})

// Closing the window (Escape, a click outside, the close button) with changes
// not saved asks first. It used to throw them away without a word.
describe("closing", () => {
  it("asks before throwing away unsaved changes", async () => {
    const setOpenState = open()
    await waitFor(() => expect((screen.getByLabelText("Handle") as HTMLInputElement).value).toBe("sam_1a2b3"))
    fireEvent.change(screen.getByLabelText("jobTitle"), { target: { value: "Designer" } })
    fireEvent.keyDown(screen.getByLabelText("jobTitle"), { key: "Escape" })
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: "Discard your profile changes?", cancelText: "Keep editing", destructive: true }))
    expect(setOpenState).not.toHaveBeenCalled()
    act(() => confirm.mock.calls[0][0].onConfirm())
    expect(setOpenState).toHaveBeenCalledWith(false)
  })

  it("closes at once when nothing has changed", async () => {
    const setOpenState = open()
    await waitFor(() => expect((screen.getByLabelText("Handle") as HTMLInputElement).value).toBe("sam_1a2b3"))
    fireEvent.keyDown(screen.getByLabelText("jobTitle"), { key: "Escape" })
    expect(confirm).not.toHaveBeenCalled()
    expect(setOpenState).toHaveBeenCalledWith(false)
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
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("#profile-edit-form input[name]")).map((i) => i.name)
    expect(inputs.slice(0, 3)).toEqual(["displayName", "fullName", "handle"])
  })

  it("show the full name and handle under the shown name when they differ", async () => {
    const before = fetched.data.data
    fetched.data.data = { ...profile, user_name: "Sam", user_full_name: "Samuel Rivera", user_handle: "srivera" }
    try {
      open()
      await waitFor(() => expect(screen.getByText("Samuel Rivera · @srivera")).toBeInTheDocument())
    } finally {
      fetched.data.data = before
    }
  })
})
