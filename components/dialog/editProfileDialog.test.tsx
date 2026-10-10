import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// The profile editor saves a profile whatever made its names, and sends the
// handle only when it changes. It used to refuse "sam_1a2b3" (what a name
// collision produced) on every save, and to resend the handle every time.

const { post, fetched } = vi.hoisted(() => ({ post: vi.fn(), fetched: { data: { data: {} as Record<string, unknown> }, mutate: () => {} } }))
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
vi.mock("@/hooks/useUploadFile", () => ({ useUploadFile: () => ({ makeRequestToUploadToPublic: vi.fn(), isSubmitting: false }) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: post, isSubmitting: false }) }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light", setTheme: vi.fn() }) }))
vi.mock("@/components/activeTheme/ColorThemePicker", () => ({ ColorThemePicker: () => null }))
vi.mock("@/components/profile/ChangePasswordSection", () => ({ ChangePasswordSection: () => null }))
vi.mock("@/components/profile/TwoFactorSection", () => ({ TwoFactorSection: () => null }))
vi.mock("@/components/profile/PasskeySection", () => ({ PasskeySection: () => null }))
vi.mock("@/components/dialog/appLanguageCombobox", () => ({ AppLanguageCombobox: () => null }))
vi.mock("@/lib/axiosInstance", () => ({ default: { get: vi.fn(async () => ({ data: {} })), post: vi.fn() }, OWN_ERRORS: { suppressErrorToast: true } }))

import EditProfileDialog from "./editProfileDailog"

beforeEach(() => {
  post.mockResolvedValue({})
})
afterEach(() => {
  cleanup()
  post.mockReset()
})

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
    const payload = post.mock.calls[0][0].payload
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
    expect(post.mock.calls[0][0].payload.user_handle).toBe("sam.rivera")
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
