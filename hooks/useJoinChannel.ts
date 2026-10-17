"use client"

import { usePost } from "@/hooks/usePost"
import { PostEndpointUrl } from "@/services/endPoints"
import type { ChannelJoinInterface } from "@/types/channel"

/**
 * Joining a channel from its page, on a computer and a phone. A refusal is
 * said once, in the channel's name and the server's words (usePost's own
 * toast, through apiErrorMessage), and nothing is left unhandled: each page
 * awaited the join with no catch of its own, so a refused one was an
 * unhandled rejection under the toast.
 */
export function useJoinChannel(channelId: string, onJoined: () => void, channelName?: string) {
    const post = usePost()
    const join = () =>
        post
            .makeRequest<ChannelJoinInterface>({
                apiEndpoint: PostEndpointUrl.JoinChannel,
                payload: { channel_uuid: channelId },
                showErrorToast: true,
                failureTitle: channelName ? `Couldn't join #${channelName}` : undefined,
                onSuccess: onJoined,
            })
            .then(
                () => true,
                () => false,
            )
    return { join, joining: post.isSubmitting }
}
