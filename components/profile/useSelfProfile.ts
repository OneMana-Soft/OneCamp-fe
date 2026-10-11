"use client"

import { useCallback } from "react"
import { useDispatch } from "react-redux"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { updateUserInfoStatus } from "@/store/slice/userSlice"
import { USER_STATUS_OFFLINE, type UserProfileInterface, type UserProfileUpdateInterface } from "@/types/user"
import { saveProfile, type ProfileSaveOutcome } from "@/components/profile/saveProfile"

/**
 * Your own profile, read once and shared by every part of the profile page
 * (the identity band, the fields card, Appear online) and by the phone's
 * dialog: one SWR answer, so a photo saved in the band is the photo the fields
 * card sends with its next save.
 *
 * `save` sends the whole profile, as the server wants it, with the changes
 * laid over what is saved now; the handle goes only when it is among the
 * changes (saveProfile's rule). A save that held updates the answer and the
 * presence store in place, so the sidebar's avatar and name follow at once.
 */
export function useSelfProfile() {
  const info = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const dispatch = useDispatch()
  const profile = info.data?.data
  const { mutate } = info

  const save = useCallback(
    async (changes: Partial<UserProfileUpdateInterface>): Promise<ProfileSaveOutcome> => {
      const p = info.data?.data
      const payload: UserProfileUpdateInterface = {
        user_name: p?.user_name || "",
        user_full_name: p?.user_full_name || "",
        user_job_title: p?.user_job_title || "",
        user_profile_object_key: p?.user_profile_object_key || "",
        user_app_lang: p?.user_app_lang || "en",
        user_hobbies: p?.user_hobbies || "",
        user_status: p?.user_status || USER_STATUS_OFFLINE,
        ...changes,
      }
      const outcome = await saveProfile(payload)
      if (!outcome.ok) return outcome
      const next = {
        ...p,
        user_uuid: p?.user_uuid || "",
        user_name: payload.user_name,
        user_full_name: payload.user_full_name,
        user_handle: payload.user_handle ?? p?.user_handle,
        user_job_title: payload.user_job_title,
        user_profile_object_key: payload.user_profile_object_key,
        user_app_lang: payload.user_app_lang,
        user_hobbies: payload.user_hobbies,
        user_status: payload.user_status,
      }
      dispatch(
        updateUserInfoStatus({
          userUUID: next.user_uuid,
          profileKey: next.user_profile_object_key,
          userName: next.user_name,
          status: next.user_status,
        }),
      )
      void mutate({ ...info.data, data: next } as UserProfileInterface, false)
      return outcome
    },
    [info.data, mutate, dispatch],
  )

  return { profile, isLoading: !profile && !info.isError, error: info.isError, save, mutate }
}
