"use client"

import { useDispatch } from "react-redux"
import mqttService, { msgActivityInterface } from "@/services/mqttService"
import { incrementTotalUnreadActivityCount } from "@/store/slice/userSlice"
import { useSelector } from "react-redux"
import { RootState } from "@/store/store"
import { appMutate } from "@/lib/swrMutate"
import { inboxFeedKey, INBOX_PAGE_SIZE } from "@/lib/activity/feedPages"
import { GetEndpointUrl } from "@/services/endPoints"

interface UseActivityMessageHandlersProps {
    userUuid?: string
}

export const useActivityMessageHandlers = ({ userUuid }: UseActivityMessageHandlersProps) => {
    const dispatch = useDispatch()
    const totalUnreadActivityCount = useSelector((state: RootState) => state.users.userSidebar.totalUnreadActivityCount)

    const handleActivityMessage = (messageStr: string) => {
        try {
            const rawActivity = mqttService.parseActivityMsg(messageStr)
            const activityData: msgActivityInterface = rawActivity.data

            if (activityData.user_uuid === userUuid) {
                // The backend sends the full activity object, but we only need to increment for the sidebar badge
                dispatch(incrementTotalUnreadActivityCount())
            }
        } catch (error) {
            console.error("[MQTT] Activity message processing error:", error)
        }
    }

    // An inbox notice (types/activity NoticeItem): it counts as unread, and the
    // inbox's first page, if it's open, reads it in.
    const handleNoticeMessage = (messageStr: string) => {
        try {
            const notice = JSON.parse(messageStr)?.data
            if (notice?.user_uuid && notice.user_uuid === userUuid) {
                dispatch(incrementTotalUnreadActivityCount())
                void appMutate(inboxFeedKey(GetEndpointUrl.GetUnifiedActivity, INBOX_PAGE_SIZE))
            }
        } catch (error) {
            console.error("[MQTT] Notice message processing error:", error)
        }
    }

    return {
        handleActivityMessage,
        handleNoticeMessage,
    }
}
