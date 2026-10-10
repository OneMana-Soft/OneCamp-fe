"use client"

import { useSelector } from "react-redux"
import { useMemo } from "react"
import type { RootState } from "@/store/store"
import {UserEmojiInterface} from "@/store/slice/userSlice";


// One "nothing known" for everyone the store has no entry for.
const UNKNOWN_USER = {deviceConnected: -1, status: ''} as UserEmojiInterface

export const useUserInfoState = (userUUID: string | undefined) => {
    // Normalizes empty userUUID to empty string for consistent selector behavior
    const normalizedUUID = userUUID || ""

    const userStatus = useSelector(
        (state: RootState) => state.users.usersStatus[normalizedUUID] || UNKNOWN_USER,
        // Custom equality function to prevent re-renders on object reference changes
        (prev, next) => {
            if (!prev || !next) return prev === next
            return prev.userName === next.userName && 
                   prev.profileKey === next.profileKey && 
                   prev.status === next.status &&
                   prev.deviceConnected === next.deviceConnected
        },
    )

    // Memoize to ensure consumers get stable reference
    return useMemo(() => userStatus, [userStatus])
}
