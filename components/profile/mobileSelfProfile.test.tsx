import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// The phone's profile page says why a save failed where it can be fixed, as
// the desktop dialog does: a handle someone else has under the Handle field,
// anything else under the fields. It used to leave both to a toast, and when a
// new photo failed to upload it saved the old one and went back as if the new
// one were in.

const { post, back, upload, fetched } = vi.hoisted(() => ({
  post: vi.fn(),
  back: vi.fn(),
  upload: vi.fn(),
  fetched: {
    data: {
      data: {
        user_uuid: "u1",
        user_name: "Sam",
        user_full_name: "Sam Rivera",
        user_handle: "sam",
        user_profile_object_key: "",
        user_app_lang: "en",
        user_status: "online",
      } as Record<string, unknown>,
    },
    mutate: vi.fn(),
  },
}))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => fetched }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: "" }) }))
vi.mock("@/hooks/useUploadFile", () => ({ useUploadFile: () => ({ makeRequestToUploadToPublic: upload, isSubmitting: false }) }))
vi.mock("@/lib/axiosInstance", () => ({ default: { get: vi.fn(async () => ({ data: {} })), post }, OWN_ERRORS: { suppressErrorToast: true } }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ back }) }))
vi.mock("@/components/profile/ProfileSettingsSections", () => ({ AppearanceSection: () => null, CalendarSection: () => null, SigningInSection: () => null }))
vi.mock("@/components/dialog/appLanguageCombobox", () => ({ AppLanguageCombobox: () => null }))

import { MobileSelfProfile } from "./mobileSelfProfile"

beforeEach(() => {
  post.mockReset()
  back.mockReset()
  upload.mockReset()
})
afterEach(cleanup)

const ready = async () => waitFor(() => expect((screen.getByLabelText("Handle") as HTMLInputElement).value).toBe("sam"))
const save = async () => act(async () => void fireEvent.click(screen.getByRole("button", { name: "Save profile" })))

describe("saving the profile on a phone", () => {
  it("says a taken handle under the handle field, and stays", async () => {
    post.mockRejectedValue({ response: { status: 409, data: { msg: "@taken is taken. Try another." } } })
    render(<MobileSelfProfile />)
    await ready()
    fireEvent.change(screen.getByLabelText("Handle"), { target: { value: "taken" } })
    await save()
    expect(screen.getByLabelText("Handle")).toHaveAccessibleDescription(expect.stringContaining("@taken is taken. Try another."))
    expect(back).not.toHaveBeenCalled()
    expect(post.mock.calls[0][2]).toEqual({ suppressErrorToast: true })
  })

  it("says any other failure under the fields", async () => {
    post.mockRejectedValue({ message: "Network Error" })
    render(<MobileSelfProfile />)
    await ready()
    await save()
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save your profile. The server could not be reached.")
    expect(back).not.toHaveBeenCalled()
  })

  it("stops, and says so, when the new photo didn't upload", async () => {
    upload.mockResolvedValue([])
    render(<MobileSelfProfile />)
    await ready()
    fireEvent.change(document.getElementById("imageUploadMobile")!, { target: { files: [new File(["x"], "me.png", { type: "image/png" })] } })
    await save()
    expect(post).not.toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't upload your photo")
  })

  it("goes back once it has saved", async () => {
    post.mockResolvedValue({ data: {} })
    render(<MobileSelfProfile />)
    await ready()
    await save()
    expect(back).toHaveBeenCalled()
  })
})
