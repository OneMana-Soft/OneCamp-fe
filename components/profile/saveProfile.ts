import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { apiErrorMessage, apiErrorStatus } from "@/lib/utils/apiError"
import { PostEndpointUrl } from "@/services/endPoints"
import type { UserProfileUpdateInterface } from "@/types/user"

/**
 * Saving a profile, for the desktop dialog and the phone's profile page alike,
 * so the two say a failure the same way.
 */

/** Said when a newly chosen photo didn't upload. The save stops there: going on kept the old photo as if the new one were in. */
export const PHOTO_NOT_UPLOADED = "Couldn't upload your photo. Try again, or remove it and save the rest."

export type ProfileSaveOutcome =
  | { ok: true }
  /** `field` names the field the refusal is about, when there is one. */
  | { ok: false; field: "handle" | null; message: string }

/**
 * Sends the profile and says a refusal where it can be fixed. Someone else's
 * handle is the one refusal with its own answer (409, "@x is taken. Try
 * another."), so it belongs under the Handle field; anything else, the server's
 * reason or "The server could not be reached…", goes under the fields. The
 * request passes OWN_ERRORS, so the form's message is the only one: a toast
 * went while the person was still reading, and said nothing at all when the
 * server could not be reached.
 */
export async function saveProfile(payload: UserProfileUpdateInterface): Promise<ProfileSaveOutcome> {
  try {
    await axiosInstance.post(PostEndpointUrl.UpdateUserProfile, payload, OWN_ERRORS)
    return { ok: true }
  } catch (e) {
    if (apiErrorStatus(e) === 409) {
      return { ok: false, field: "handle", message: apiErrorMessage(e, "That handle is taken. Try another.") }
    }
    return { ok: false, field: null, message: `Couldn't save your profile. ${apiErrorMessage(e, "Check your connection and try again.")}` }
  }
}
