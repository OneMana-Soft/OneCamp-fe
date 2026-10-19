"use client"

import { useDispatch } from "react-redux"
import mqttService, { msgActivityInterface } from "@/services/mqttService"
import { incrementTotalUnreadActivityCount } from "@/store/slice/userSlice"
import { appMutate } from "@/lib/swrMutate"
import { inboxFeedKey, INBOX_PAGE_SIZE } from "@/lib/activity/feedPages"
import { GetEndpointUrl } from "@/services/endPoints"

interface UseActivityMessageHandlersProps {
    userUuid?: string
}

export const useActivityMessageHandlers = ({ userUuid }: UseActivityMessageHandlersProps) => {
    const dispatch = useDispatch()

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
    // inbox's first page, if it's open, reads it in. One about an event (an
    // invitation, a change, an answer: calendar A2) changes what the calendar
    // shows too, so its lists read again, and the event if it's open.
    const handleNoticeMessage = (messageStr: string) => {
        try {
            const notice = JSON.parse(messageStr)?.data
            if (notice?.user_uuid && notice.user_uuid === userUuid) {
                dispatch(incrementTotalUnreadActivityCount())
                void appMutate(inboxFeedKey(GetEndpointUrl.GetUnifiedActivity, INBOX_PAGE_SIZE))
                // The item as the feed lists it (models/mqtt MqttNotice): { activity: { notice } }.
                const item = notice.activity?.notice
                if (item?.resource_kind === "event") void appMutate((key) => showsEvent(key, item.resource_uuid))
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

/** Whether a cached answer shows the calendar's events, or the one event a notice is about. */
export function showsEvent(key: unknown, eventId: unknown): boolean {
    if (typeof key !== "string") return false
    if (key.startsWith(GetEndpointUrl.GoogleCalendarEvents)) return true
    const id = typeof eventId === "string" ? eventId : ""
    return !!id && (key.startsWith(`${GetEndpointUrl.GetEvent}/${id}`) || key.startsWith(`/calendar/events/${id}`))
}
