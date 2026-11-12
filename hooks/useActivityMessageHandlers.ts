"use client"

import mqttService, { msgActivityInterface } from "@/services/mqttService"
import { appMutate } from "@/lib/swrMutate"
import { showsEvent } from "@/lib/calendar/eventCache"
import { inboxArrived } from "@/lib/activity/inboxArrived"
import { recountInbox } from "@/services/unreadCache"
import { useLiveAgain } from "@/hooks/useLiveAgain"

interface UseActivityMessageHandlersProps {
    userUuid?: string
}

export const useActivityMessageHandlers = ({ userUuid }: UseActivityMessageHandlersProps) => {
    // The badge's count was read before the connection was live, and an Inbox
    // event sent in between reached no one: read it again each time it is.
    useLiveAgain(recountInbox)

    const handleActivityMessage = (messageStr: string) => {
        try {
            const rawActivity = mqttService.parseActivityMsg(messageStr)
            const activityData: msgActivityInterface = rawActivity.data

            if (activityData.user_uuid === userUuid) inboxArrived()
        } catch (error) {
            console.error("[MQTT] Activity message processing error:", error)
        }
    }

    // An inbox notice (types/activity NoticeItem), as an activity. One about an
    // event (an invitation, a change, an answer: calendar A2) changes what the
    // calendar shows too, so its lists read again, and the event if it's open.
    const handleNoticeMessage = (messageStr: string) => {
        try {
            const notice = JSON.parse(messageStr)?.data
            if (notice?.user_uuid && notice.user_uuid === userUuid) {
                inboxArrived()
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
