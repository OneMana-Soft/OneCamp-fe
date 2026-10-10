"use client";


import { displayNameOf } from "@/lib/personName"
import { useMedia } from "@/context/MediaQueryContext";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {UserProfileDataInterface, UserProfileInterface} from "@/types/user";
import {useScheduleMessage} from "@/hooks/useScheduledMessages";
import {ScheduleSendContext} from "@/context/ScheduleSendContext";
import {useDispatch, useSelector, useStore} from "react-redux";
import {RootState} from "@/store/store";
import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {ChatInfo, CreateChatRes, CreateOrUpdateChatsReq} from "@/types/chat";
import {removeEmptyPTags} from "@/lib/utils/removeEmptyPTags";
import {ChatGrpIdDesktop} from "@/components/groupChat/chatGrpIdDesktop";
import {GrpChatIdMobile} from "@/components/groupChat/grpChatIdMobile";
import {
    addPendingGroupChat,
    clearGroupChatInputState,
    confirmPendingGroupChat,
    failPendingGroupChat,
    removePendingGroupChat,
    restoreUnsentGroupChatMessage,
    retryPendingGroupChat,
    updateGroupChatScrollToBottom,
    ChatInputState, UpdateGrpChatLocally
} from "@/store/slice/groupChatSlice";
import {UpdateMessageInChatList, UpdateUnreadCountToZero} from "@/store/slice/chatSlice";
import {resetUserChatUnread} from "@/store/slice/userSlice";
import { clearChatUnread } from "@/services/unreadCache";
import {useEffect, useMemo, useState} from "react";
import { useStableCallback } from "@/hooks/useStableCallback";
import { newLocalId } from "@/lib/chat/pendingSend";
import { appMutate } from "@/lib/swrMutate";
import { PendingSendContext } from "@/components/message/sendStatus";
import { usePendingSend } from "@/components/views/usePendingSend";


const EMPTY_INPUT_STATE: ChatInputState = { chatBody: '', filesUploaded: [], filesPreview: [] }

export function GroupChatView({ grpId }: { grpId: string }) {

    const scheduleMessage = useScheduleMessage()
    const dispatch = useDispatch();
    const store = useStore<RootState>()

    // A group made here whose first message has not gone yet: the server makes
    // the group with that message, from its participants.
    const notYetOnServer = useSelector((state: RootState) => {
        const info = state.groupChat.locallyCreatedGrpInfo[grpId]
        return !!(info && info.grpId && !info.haveSentFirstChat)
    });
    const groupExists = !notYetOnServer

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    const latestKey = grpId ? GetEndpointUrl.GetGroupChatLatestMessage + '/' + grpId : ''

    // A message is in the conversation the moment Send is pressed (lib/chat/pendingSend).
    const { send, actions } = usePendingSend<ChatInfo, CreateOrUpdateChatsReq, CreateChatRes>({
        endpoint: PostEndpointUrl.CreateGroupChatMessage,
        add: (chat) => addPendingGroupChat({ grpId, chat }),
        confirm: (localId, res) => confirmPendingGroupChat({ grpId, localId, chatUUID: res?.uuid || '', createdAt: res?.chat_created_at }),
        fail: (localId) => failPendingGroupChat({ grpId, localId }),
        retry: (localId) => retryPendingGroupChat({ grpId, localId }),
        remove: (localId) => removePendingGroupChat({ grpId, localId }),
        find: (state, localId) => state.groupChat.chatMessages[grpId]?.find((c) => c.chat_local_id === localId),
        payloadOf: (chat) => {
            const payload: CreateOrUpdateChatsReq = {
                media_attachments: chat.chat_attachments,
                text_html: chat.chat_body_text,
                grp_id: grpId,
                ...(chat.chat_reply_to?.chat_uuid ? { reply_to_uuid: chat.chat_reply_to.chat_uuid } : {}),
            }
            const info = store.getState().groupChat.locallyCreatedGrpInfo[grpId]
            if (info && info.grpId && !info.haveSentFirstChat) {
                payload.participants = info.participants.map((t) => t.uid || '')
                payload.grp_id = ''
            }
            return payload
        },
        draftOf: (chat) => ({
            html: chat.chat_body_text,
            files: chat.chat_attachments || [],
            previews: [],
            replyToUuid: chat.chat_reply_to?.chat_uuid,
            replyToAuthorName: chat.chat_reply_to?.chat_from?.user_name,
            replyToText: chat.chat_reply_to?.chat_body_text,
        }),
        restore: (unsent) => restoreUnsentGroupChatMessage({ grpId, unsent }),
        onSent: (chat, res) => {
            dispatch(UpdateMessageInChatList({
                name: displayNameOf(selfProfile.data?.data) || '',
                msgTime: res?.chat_created_at || chat.chat_created_at,
                attachments: chat.chat_attachments,
                msg: chat.chat_body_text,
                chatUuid: res?.uuid || '',
                grpId: grpId
            }))
            const info = store.getState().groupChat.locallyCreatedGrpInfo[grpId]
            if (info && info.grpId && !info.haveSentFirstChat) {
                dispatch(UpdateGrpChatLocally({grpId}))
            }
            void appMutate(latestKey)
        },
    })

    // Send later: the same body Send would post, handed to the scheduler.
    const handleSchedule = useStableCallback(async (latestContent: string | undefined, at: Date) => {
        const chatState = store.getState().groupChat.chatInputState[grpId] || EMPTY_INPUT_STATE
        const body = removeEmptyPTags(latestContent ?? chatState.chatBody)
        if ((body.length == 0 && !chatState.filesUploaded?.length) || !groupExists) return false
        const replyToUuid = chatState.replyToUuid
        const ok = await scheduleMessage("group", {
            media_attachments: chatState.filesUploaded,
            text_html: body,
            grp_id: grpId,
            ...(replyToUuid ? { reply_to_uuid: replyToUuid } : {}),
        }, at)
        if (ok) dispatch(clearGroupChatInputState({grpId}))
        return ok
    })

    const handleSend = useStableCallback((latestContent?: string) => {
        // The draft as it is now, read when sending rather than subscribed to.
        const chatState = store.getState().groupChat.chatInputState[grpId] || EMPTY_INPUT_STATE
        const body = removeEmptyPTags(latestContent ?? chatState.chatBody)
        const files = chatState.filesUploaded || []

        // Words, or files on their own: a message of only a photo is a message.
        if (body.length == 0 && files.length == 0) return

        const replyToUuid = chatState.replyToUuid
        const replyTo: ChatInfo | undefined = replyToUuid
            ? {
                  chat_uuid: replyToUuid,
                  chat_body_text: chatState.replyToText || '',
                  chat_from: { user_name: chatState.replyToAuthorName || '' } as UserProfileDataInterface,
                  chat_to: {} as UserProfileDataInterface,
                  chat_created_at: '',
                  chat_attachments: [],
                  chat_comment_count: 0,
              }
            : undefined

        dispatch(clearGroupChatInputState({grpId}))

        const localId = newLocalId()
        send(localId, {
            chat_uuid: localId,
            chat_local_id: localId,
            chat_send_state: "sending",
            chat_added_locally: true,
            chat_from: selfProfile.data?.data || {} as UserProfileDataInterface,
            chat_to: {} as UserProfileDataInterface,
            chat_created_at: new Date().toISOString(),
            chat_body_text: body,
            chat_attachments: files,
            chat_reply_to: replyTo,
            chat_comment_count: 0,
        })
        dispatch(updateGroupChatScrollToBottom({grpId, scrollToBottom: true}))
    })

    // How many were unread on opening, read once (see ChannelView).
    const [unreadOnOpen] = useState(() => store.getState().users.userSidebar.userChats.find(chat => chat.dm_grouping_id === grpId)?.dm_unread || 0);

    useEffect(()=>{
        if(!grpId) return
        dispatch(UpdateUnreadCountToZero({grpId}))
        dispatch(resetUserChatUnread({dm_grouping_id: grpId}))
        clearChatUnread(grpId)
    },[grpId, dispatch])


    const { isMobile, isDesktop } = useMedia();

    const schedule = useMemo(() => (groupExists ? { kind: "group" as const, target: grpId, schedule: handleSchedule } : null), [groupExists, grpId, handleSchedule])

    if(!grpId) return

    return (
        <PendingSendContext.Provider value={actions}>
            <ScheduleSendContext.Provider value={schedule}>
            {isMobile && <GrpChatIdMobile grpId={grpId} handleSend={handleSend} unreadCount={unreadOnOpen} />}

            {isDesktop && <ChatGrpIdDesktop grpId={grpId} handleSend={handleSend} unreadCount={unreadOnOpen} />}
            </ScheduleSendContext.Provider>
        </PendingSendContext.Provider>
    );
}
