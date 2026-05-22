"use client"

import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { useEffect } from "react"
import {
    USER_STATUS_ONLINE,
    UserEmojiStatus,
    UserProfileInterface,
} from "@/types/user"
import { ChatUserAvatar } from "@/components/chat/chatUserAvatar"
import {
    updateUserConnectedDeviceCount,
    updateUserEmojiStatus,
    updateUserStatus,
} from "@/store/slice/userSlice"
import { useDispatch } from "react-redux"
import { useUserInfoState } from "@/hooks/useUserInfoState"
import { openUI } from "@/store/slice/uiSlice"
import { statusColors } from "@/lib/colors"
import { ChatUserEmojiStatus } from "@/components/chat/chatUserEmojiStatus"
import { cn } from "@/lib/utils/helpers/cn"

export function MobileTopNavigationBarSecondChat({ chatUUID }: { chatUUID: string }) {
    const otherUserInfo = useFetchOnlyOnce<UserProfileInterface>(
        `${GetEndpointUrl.SelfProfile}/${chatUUID}`,
    )

    const dispatch = useDispatch()
    const userStatusState = useUserInfoState(chatUUID)

    useEffect(() => {
        if (otherUserInfo.data?.data) {
            dispatch(
                updateUserEmojiStatus({
                    userUUID: otherUserInfo.data.data.user_uuid,
                    status:
                        otherUserInfo.data.data.user_emoji_statuses?.[0] ||
                        ({} as UserEmojiStatus),
                }),
            )
            dispatch(
                updateUserStatus({
                    userUUID: otherUserInfo.data.data.user_uuid,
                    status: otherUserInfo.data.data.user_status || "online",
                }),
            )
            dispatch(
                updateUserConnectedDeviceCount({
                    userUUID: otherUserInfo.data.data.user_uuid,
                    deviceConnected: otherUserInfo.data.data.user_device_connected || 0,
                }),
            )
        }
    }, [otherUserInfo.data?.data])

    const isReduxLoaded = userStatusState && userStatusState.deviceConnected !== -1
    const currentStatus =
        isReduxLoaded && userStatusState.status
            ? userStatusState.status
            : otherUserInfo.data?.data.user_status || "offline"
    const currentDeviceCount = isReduxLoaded
        ? userStatusState.deviceConnected
        : otherUserInfo.data?.data.user_device_connected || 0

    const isOnline =
        currentStatus === USER_STATUS_ONLINE && currentDeviceCount > 0

    const userName = userStatusState.userName || otherUserInfo.data?.data.user_name

    return (
        <button
            type="button"
            onClick={() =>
                dispatch(openUI({ key: "otherUserProfile", data: { userUUID: chatUUID } }))
            }
            className={cn(
                "flex w-full items-center justify-center gap-2 px-2 min-w-0",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-md",
            )}
        >
            <div className="relative shrink-0">
                <ChatUserAvatar
                    userName={userName}
                    userProfileObjKey={
                        userStatusState.profileKey ||
                        otherUserInfo.data?.data.user_profile_object_key
                    }
                />
                {isOnline && (
                    <span
                        aria-hidden
                        className={cn(
                            "absolute bottom-0 right-0 h-2 w-2 rounded-full ring-2 ring-background",
                            statusColors.online.solid,
                        )}
                    />
                )}
            </div>
            <span className="text-base font-semibold text-foreground truncate min-w-0">
                {userName}
            </span>
            <ChatUserEmojiStatus userUUID={chatUUID} />
        </button>
    )
}
