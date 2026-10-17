"use client"

import { useDispatch } from "react-redux"
import { useNotificationLevel } from "@/hooks/useNotificationLevel"
import { usePost } from "@/hooks/usePost"
import { PostEndpointUrl } from "@/services/endPoints"
import { setUserChannelNotificationType } from "@/store/slice/userSlice"
import type { ChannelNotificationInterface } from "@/types/channel"
import type { ChatNotificationInterface, GrpChatNotificationInterface } from "@/types/chat"

/**
 * Your notification level for a channel, and a choice of it, the same from
 * the header's More menu, Details and a phone's channel sheets: each had a
 * copy of its own, and only two of the four said a refusal in the channel's
 * words or showed the sidebar's row muted, or not, once it was saved; the
 * phone's left a refused change as an unhandled rejection.
 */
export function useChannelNotification(channelId: string, saved: string | undefined, channelName?: string) {
    const dispatch = useDispatch()
    const post = usePost()
    const { level, choose } = useNotificationLevel(
        `channel:${channelId}`,
        saved,
        (next) =>
            post.makeRequest<ChannelNotificationInterface>({
                payload: { channel_id: channelId, notification_type: next },
                apiEndpoint: PostEndpointUrl.UpdateChannelNotification,
                showErrorToast: true,
                failureTitle: channelName ? `Couldn't change your notifications for #${channelName}` : undefined,
            }),
        // The sidebar shows the channel muted, or not, at once.
        (next) => dispatch(setUserChannelNotificationType({ channelUUID: channelId, notificationType: next })),
    )
    return { level, choose, busy: post.isSubmitting }
}

/**
 * A DM's level, from its header and a phone's sheet. Each kept a copy of its
 * own: the header put a refused choice back by hand, and the phone's sheet
 * showed a choice only once saved, and left a refused one unhandled.
 */
export function useChatNotification(chatId: string, saved: string | undefined) {
    const post = usePost()
    const { level, choose } = useNotificationLevel(`chat:${chatId}`, saved, (next) =>
        post.makeRequest<ChatNotificationInterface>({ payload: { to_user_id: chatId, notification_type: next }, apiEndpoint: PostEndpointUrl.UpdateChatNotification, showErrorToast: true }),
    )
    return { level, choose, busy: post.isSubmitting }
}

/** A group's level, from its header and a phone's sheet, as a DM's. */
export function useGroupNotification(grpId: string, saved: string | undefined) {
    const post = usePost()
    const { level, choose } = useNotificationLevel(`group:${grpId}`, saved, (next) =>
        post.makeRequest<GrpChatNotificationInterface>({ payload: { grp_id: grpId, notification_type: next }, apiEndpoint: PostEndpointUrl.UpdateGroupChatNotification, showErrorToast: true }),
    )
    return { level, choose, busy: post.isSubmitting }
}
