"use client"

import { useEffect, useMemo } from "react"
import { useDispatch } from "react-redux"
import { ChannelIdDesktop } from "@/components/channel/chanelIdDesktop"
import { ChannelIdMobile } from "@/components/channel/channelIdMobile"
import { ConversationBody, type ConversationKind, type ConversationPageProps } from "@/components/conversation/ConversationBody"
import { OpenCount } from "@/components/conversation/openCount"
import {
    addPendingPost,
    clearChannelInputState,
    confirmPendingPost,
    failPendingPost,
    removePendingPost,
    restoreUnsentChannelPost,
    retryPendingPost,
    updateChannelCallStatus,
    updateChannelScrollToBottom,
} from "@/store/slice/channelSlice"
import { addUserChannelList, resetUserChannelUnread } from "@/store/slice/userSlice"
import { useFetch } from "@/hooks/useFetch"
import { useUnreadOnOpen } from "@/hooks/useUnreadOnOpen"
import { isHeldUnread, releaseUnread } from "@/lib/conversation/unreadHold"
import { markChannelSeen } from "@/services/channelService"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { app_channel_path } from "@/types/paths"
import type { ChannelInfoInterfaceResp } from "@/types/channel"
import type { CreateOrUpdatePostsReq, CreatePostsRes, PostsRes } from "@/types/post"
import type { UserProfileDataInterface } from "@/types/user"

// The channel's pages, declared once so a count arriving never remounts them.
const Computer = ({ id, ...page }: ConversationPageProps) => <ChannelIdDesktop channelId={id} {...page} />
const Phone = ({ id, ...page }: ConversationPageProps) => <ChannelIdMobile channelId={id} {...page} />

/** A channel as the conversation body takes it (chat A1 step 2). */
export function channelKind(channelId: string): ConversationKind<PostsRes, CreateOrUpdatePostsReq, CreatePostsRes> {
    return {
        kind: "channel",
        id: channelId,
        missing: { noun: "channel", back: { label: "Back to channels", href: app_channel_path }, noAccessDetail: "It's private. Ask someone in it to add you." },
        latestKey: `${GetEndpointUrl.GetChannelLatestPost}/${channelId}`,
        linkParam: "postId",
        pending: {
            endpoint: PostEndpointUrl.CreateChannelPost,
            add: (post) => addPendingPost({ channelId, post }),
            confirm: (localId, res) => confirmPendingPost({ channelId, localId, postUUID: res?.uuid || "", createdAt: res?.post_created_at }),
            fail: (localId) => failPendingPost({ channelId, localId }),
            retry: (localId) => retryPendingPost({ channelId, localId }),
            remove: (localId) => removePendingPost({ channelId, localId }),
            find: (state, localId) => state.channel.channelPosts[channelId]?.find((p) => p.post_local_id === localId),
            payloadOf: (post) => ({
                post_attachments: post.post_attachments,
                channel_id: channelId,
                post_text_html: post.post_text,
                ...(post.post_reply_to?.post_uuid ? { reply_to_uuid: post.post_reply_to.post_uuid } : {}),
                // Try again after a lost answer is the same post, not a second one.
                ...(post.post_local_id ? { client_msg_id: post.post_local_id } : {}),
            }),
            draftOf: (post) => ({
                html: post.post_text,
                files: post.post_attachments || [],
                previews: [],
                replyToUuid: post.post_reply_to?.post_uuid,
                replyToAuthorName: post.post_reply_to?.post_by?.user_name,
                replyToText: post.post_reply_to?.post_text,
            }),
            restore: (unsent) => restoreUnsentChannelPost({ channelId, unsent }),
        },
        draftOf: (state) => state.channel.channelInputState[channelId],
        clearDraft: clearChannelInputState({ channelId }),
        bodyOf: ({ html, files, replyToUuid }) => ({
            post_attachments: files,
            channel_id: channelId,
            post_text_html: html,
            ...(replyToUuid ? { reply_to_uuid: replyToUuid } : {}),
        }),
        sending: (localId, { html, files, replyToUuid, draft, self }) => ({
            post_uuid: localId,
            post_local_id: localId,
            post_send_state: "sending",
            post_added_locally: true,
            post_by: self,
            post_created_at: new Date().toISOString(),
            post_text: html,
            post_attachments: files,
            post_reply_to: replyToUuid
                ? {
                      post_uuid: replyToUuid,
                      post_text: draft.replyToText || "",
                      post_by: { user_name: draft.replyToAuthorName || "" } as UserProfileDataInterface,
                      post_created_at: "",
                      post_comment_count: 0,
                  }
                : undefined,
            post_comment_count: 0,
        }),
        hasMine: (state, self) => (state.channel.channelPosts[channelId] || []).some((p) => p.post_by?.user_uuid === self),
        schedule: { kind: "channel", target: channelId },
        afterSend: updateChannelScrollToBottom({ channelId, scrollToBottom: true }),
        pages: { computer: Computer, phone: Phone },
    }
}

/**
 * A channel on screen (chat A1 step 2): the conversation body with the
 * channel's kind, and what opening and leaving a channel do to the sidebar
 * and the seen mark. It took ChannelView's place.
 */
export function ChannelConversation({ channelId }: { channelId: string }) {
    const dispatch = useDispatch()
    const channelInfo = useFetch<ChannelInfoInterfaceResp>(channelId ? `${GetEndpointUrl.ChannelBasicInfo}/${channelId}` : "")
    // How many were unread on opening, read once (hooks/useUnreadOnOpen).
    const unreadOnOpen = useUnreadOnOpen(channelId, (s) => s.users.userSidebar.userChannels.find((ch) => ch.ch_uuid === channelId)?.unread_post_count,
        (a) => a.data?.user_channels?.find((ch) => ch.ch_uuid === channelId)?.unread_post_count)
    const unreadKnown = unreadOnOpen !== undefined

    useEffect(() => {
        const info = channelInfo.data?.channel_info
        if (!info) return
        // Into the sidebar only when you're in it: opening a channel you aren't
        // in (from Discover or search) added it until the next sidebar answer
        // took it out (FE-F-14).
        if (info.ch_is_member) dispatch(addUserChannelList({ channelUser: info }))
        dispatch(updateChannelCallStatus({ channelId, callStatus: info.ch_call_active || false }))
    }, [channelInfo.data?.channel_info])

    useEffect(() => {
        // Marked read once its unread count is read, on entering as well as on
        // leaving: the sidebar's revalidation brought a badge back while the
        // reader sat in the channel, as the server's marker only moved on leave.
        // Opening it reads it, even after a Mark unread (B27).
        if (!channelId || !unreadKnown) return
        dispatch(resetUserChannelUnread({ ch_uuid: channelId }))
        releaseUnread(channelId)
        markChannelSeen(channelId)
    }, [channelId, unreadKnown])

    useEffect(() => {
        // On leaving, the marker moves past what came while it was watched, so
        // it doesn't come back as unread; a channel marked unread stays so (B27).
        return () => {
            if (channelId && !isHeldUnread(channelId)) {
                markChannelSeen(channelId)
                dispatch(resetUserChannelUnread({ ch_uuid: channelId }))
            }
        }
    }, [channelId])

    // The count reaches only the list and the catch-up banner (components/
    // conversation/openCount): the body, made once per channel, isn't redrawn when it lands.
    const body = useMemo(() => <ConversationBody kind={channelKind(channelId)} />, [channelId])
    return <OpenCount.Provider value={unreadOnOpen}>{body}</OpenCount.Provider>
}
