"use client";

import { useEffect, useMemo, useState } from "react";
import { useMedia } from "@/context/MediaQueryContext";
import { ChannelIdDesktop } from "@/components/channel/chanelIdDesktop";
import {ChannelIdMobile} from "@/components/channel/channelIdMobile";
import {CreateOrUpdatePostsReq, CreatePostsRes, PostsRes} from "@/types/post";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {
    addPendingPost,
    clearChannelInputState,
    confirmPendingPost,
    failPendingPost,
    removePendingPost,
    restoreUnsentChannelPost,
    retryPendingPost,
    updateChannelCallStatus,
    updateChannelScrollToBottom
} from "@/store/slice/channelSlice";
import {UserProfileDataInterface, UserProfileInterface} from "@/types/user";
import {useScheduleMessage} from "@/hooks/useScheduledMessages";
import {ScheduleSendContext} from "@/context/ScheduleSendContext";
import {useDispatch, useStore} from "react-redux";
import {RootState} from "@/store/store";
import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {ChannelInfoInterfaceResp} from "@/types/channel";
import {addUserChannelList, resetUserChannelUnread} from "@/store/slice/userSlice";
import {removeEmptyPTags} from "@/lib/utils/removeEmptyPTags";
import {markChannelSeen} from "@/services/channelService";
import {MessageInputState} from "@/store/slice/channelSlice";
import {useToast} from "@/hooks/use-toast";
import {NOT_SENT_TOAST, type Draft} from "@/lib/chat/unsentMessage";
import {useComposeOnArrival} from "@/hooks/useComposeOnArrival";
import { useStableCallback } from "@/hooks/useStableCallback";
import { newLocalId } from "@/lib/chat/pendingSend";
import { appMutate } from "@/lib/swrMutate";
import axiosInstance from "@/lib/axiosInstance";
import { PendingSendContext } from "@/components/message/sendStatus";
import { SEND_QUIETLY, usePendingSend, viewingLinkedMessage } from "@/components/views/usePendingSend";


const EMPTY_INPUT_STATE: MessageInputState = { inputTextHTML: '', filesUploaded: [], filePreview: [] }

export function ChannelView({ channelId }: { channelId: string }) {

    const scheduleMessage = useScheduleMessage()
    const { toast } = useToast()
    const dispatch = useDispatch();
    const store = useStore<RootState>()

    const channelInfo  = useFetch<ChannelInfoInterfaceResp>(channelId ? `${GetEndpointUrl.ChannelBasicInfo}/${channelId}` : '')

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    const latestKey = channelId ? GetEndpointUrl.GetChannelLatestPost + '/' + channelId : ''

    // How many were unread on opening, read once: the catch-up banner says so.
    // Subscribing to the sidebar re-rendered the whole channel each time any
    // channel's count changed.
    const [unreadOnOpen] = useState(() => store.getState().users.userSidebar.userChannels.find((ch) => ch.ch_uuid === channelId)?.unread_post_count || 0)

    const { isMobile, isDesktop } = useMedia();

    // A new member lands here with the message box ready (lib/landing.ts).
    const focusComposer = useComposeOnArrival(channelId);

    useEffect(() => {

        if(channelInfo.data?.channel_info) {
            dispatch(addUserChannelList({channelUser: channelInfo.data?.channel_info}))

            dispatch(updateChannelCallStatus({channelId: channelId, callStatus: channelInfo.data?.channel_info.ch_call_active || false}))
        }


    }, [channelInfo.data?.channel_info]);

    useEffect(() => {
        if(channelId) {
            dispatch(resetUserChannelUnread({ch_uuid: channelId}))
            // ON ENTER, not only on leave.
            //
            // The local reset above clears the badge instantly and only in Redux.
            // The sidebar then revalidates every 30 seconds and overwrites that
            // state with the server's counts, and the server still had the OLD
            // last-seen marker, because it was advanced on unmount and nowhere
            // else. So opening a channel cleared the badge for up to half a
            // minute and then brought it back while the user was sitting there
            // reading the messages it claimed were unread.
            //
            // Opening a channel IS the moment the user has seen what is in it,
            // so the marker belongs here. The unmount call below still earns its
            // place: it covers what arrived while they were watching.
            markChannelSeen(channelId)
        }

        // On leave (channel switch / page unmount), durably advance the
        // server-side last-seen marker so messages that arrived while the user
        // was actively viewing don't resurrect the unread badge on the next
        // channel-list refetch. Fire-and-forget + silent by design.
        return () => {
            if (channelId) {
                markChannelSeen(channelId)
                dispatch(resetUserChannelUnread({ch_uuid: channelId}))
            }
        }
    }, [channelId]);

    // A post is in the channel the moment Send is pressed (lib/chat/pendingSend).
    const { send, actions } = usePendingSend<PostsRes, CreateOrUpdatePostsReq, CreatePostsRes>({
        endpoint: PostEndpointUrl.CreateChannelPost,
        add: (post) => addPendingPost({ channelId, post }),
        confirm: (localId, res) => confirmPendingPost({ channelId, localId, postUUID: res?.uuid || '', createdAt: res?.post_created_at }),
        fail: (localId) => failPendingPost({ channelId, localId }),
        retry: (localId) => retryPendingPost({ channelId, localId }),
        remove: (localId) => removePendingPost({ channelId, localId }),
        find: (state, localId) => state.channel.channelPosts[channelId]?.find((p) => p.post_local_id === localId),
        payloadOf: (post) => ({
            post_attachments: post.post_attachments,
            channel_id: channelId,
            post_text_html: post.post_text,
            ...(post.post_reply_to?.post_uuid ? { reply_to_uuid: post.post_reply_to.post_uuid } : {}),
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
        // The cached latest page has it next time the channel opens.
        onSent: () => void appMutate(latestKey),
    })

    // Send later: the same body Send would post, handed to the scheduler.
    const handleSchedule = useStableCallback(async (latestContent: string | undefined, at: Date) => {
        const channelState = store.getState().channel.channelInputState[channelId] || EMPTY_INPUT_STATE
        const body = removeEmptyPTags(latestContent ?? channelState.inputTextHTML)
        if (body.length == 0 && !(channelState.filesUploaded?.length)) return false
        const replyToUuid = channelState.replyToUuid
        const ok = await scheduleMessage("channel", {
            post_attachments: channelState.filesUploaded,
            channel_id: channelId,
            post_text_html: body,
            ...(replyToUuid ? { reply_to_uuid: replyToUuid } : {}),
        }, at)
        if (ok) dispatch(clearChannelInputState({channelId}))
        return ok
    })

    const handleSend = useStableCallback((latestContent?: string) => {
        // The draft as it is now, read when sending rather than subscribed to:
        // the view used to re-render on every change to it while typing.
        const channelState = store.getState().channel.channelInputState[channelId] || EMPTY_INPUT_STATE

        // Prefer the editor's latest HTML (passed in by the input wrapper
        // after flushing its pending throttle window) over the store's copy,
        // which can lag by one keystroke and drop the last typed character.
        const body = removeEmptyPTags(latestContent ?? channelState.inputTextHTML)
        const files = channelState.filesUploaded || []

        // Words, or files on their own: a message of only a photo is a message.
        if (body.length == 0 && files.length == 0) return

        const replyToUuid = channelState.replyToUuid
        const replyTo: PostsRes | undefined = replyToUuid
            ? {
                  post_uuid: replyToUuid,
                  post_text: channelState.replyToText || '',
                  post_by: { user_name: channelState.replyToAuthorName || '' } as UserProfileDataInterface,
                  post_created_at: '',
                  post_comment_count: 0,
              }
            : undefined

        dispatch(clearChannelInputState({channelId}))

        // Parked on an older post from a link, the latest messages are not
        // loaded, so there is nowhere to show it yet: it is sent as it was, and
        // goes back in the message box if it does not go.
        if (viewingLinkedMessage("postId")) {
            const unsent: Draft = { html: body, files, previews: channelState.filePreview, replyToUuid, replyToAuthorName: channelState.replyToAuthorName, replyToText: channelState.replyToText }
            axiosInstance.post(PostEndpointUrl.CreateChannelPost, {
                post_attachments: files,
                channel_id: channelId,
                post_text_html: body,
                ...(replyToUuid ? { reply_to_uuid: replyToUuid } : {}),
            }, SEND_QUIETLY).then(() => void appMutate(latestKey), () => {
                dispatch(restoreUnsentChannelPost({channelId, unsent}))
                toast(NOT_SENT_TOAST)
            })
            return
        }

        const localId = newLocalId()
        send(localId, {
            post_uuid: localId,
            post_local_id: localId,
            post_send_state: "sending",
            post_added_locally: true,
            post_by: selfProfile.data?.data || {} as UserProfileDataInterface,
            post_created_at: new Date().toISOString(),
            post_text: body,
            post_attachments: files,
            post_reply_to: replyTo,
            post_comment_count: 0,
        })
        dispatch(updateChannelScrollToBottom({channelId, scrollToBottom: true}))
    })

    const schedule = useMemo(() => ({ kind: "channel" as const, target: channelId, schedule: handleSchedule }), [channelId, handleSchedule])

    if(!channelId) return

    return (
        <PendingSendContext.Provider value={actions}>
            <ScheduleSendContext.Provider value={schedule}>
            {isMobile && <ChannelIdMobile channelId={channelId} handleSend={handleSend} unreadCount={unreadOnOpen} focusComposer={focusComposer}/>}

            {isDesktop && <ChannelIdDesktop channelId={channelId} handleSend={handleSend} unreadCount={unreadOnOpen} focusComposer={focusComposer}/>}
            </ScheduleSendContext.Provider>
        </PendingSendContext.Provider>
    );
}
