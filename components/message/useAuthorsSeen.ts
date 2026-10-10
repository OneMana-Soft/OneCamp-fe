"use client"

import { useEffect, useRef } from "react"
import { useDispatch } from "react-redux"
import { updateUserInfoStatus } from "@/store/slice/userSlice"
import { displayNameOf } from "@/lib/personName"
import type { UserProfileDataInterface } from "@/types/user"

/**
 * Tells the store who wrote the messages on screen (their name, picture and
 * status), so avatars and names elsewhere can use them.
 *
 * Once per person, and again only when what is known about them changes. It
 * used to dispatch once per person on every change to the list: a reaction or
 * a new message sent a dispatch for every author in the conversation, and each
 * dispatch ran every selector on the page.
 */
export function useAuthorsSeen<T>(
    messages: readonly T[],
    authorOf: (m: T) => UserProfileDataInterface | undefined,
    selfUUID: string | undefined,
) {
    const dispatch = useDispatch()
    const told = useRef(new Map<string, string>())
    const authorRef = useRef(authorOf)
    authorRef.current = authorOf

    useEffect(() => {
        // Each person as their first message in the list has them, as before.
        const thisPass = new Set<string>()
        for (const m of messages) {
            const by = authorRef.current(m)
            const uuid = by?.user_uuid
            if (!by || !uuid || uuid === selfUUID || thisPass.has(uuid)) continue
            thisPass.add(uuid)
            const info = {
                userUUID: uuid,
                profileKey: by.user_profile_object_key || "",
                userName: displayNameOf(by) || "",
                status: by.user_status || "",
            }
            const sig = `${info.profileKey}\u0000${info.userName}\u0000${info.status}`
            if (told.current.get(uuid) === sig) continue
            told.current.set(uuid, sig)
            dispatch(updateUserInfoStatus(info))
        }
    }, [messages, selfUUID, dispatch])
}
