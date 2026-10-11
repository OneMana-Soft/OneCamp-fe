import { displayNameOf } from "@/lib/personName"
import { MobileMessageRow, sheetPreview } from "@/components/message/mobileMessageRow";
import { mapChatInfoToBaseMessage } from "@/components/message/baseMessageCard";
import { useLongPress } from "@/hooks/useLongPress";
import { useDispatch } from "react-redux";
import { openUI, closeUI } from "@/store/slice/uiSlice";
import { StandardReaction, SyncCustomReaction } from "@/types/reaction";
import { app_grp_chat_path, app_user } from "@/types/paths";
import { useRouter } from "next/navigation";
import { GetEndpointUrl } from "@/services/endPoints";
import { useCallback, useState, useMemo } from "react";
import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { UserProfileInterface } from "@/types/user";
import { AttachmentMediaReq } from "@/types/attachment";
import { ChatInfo } from "@/types/chat";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { removeHtmlTags } from "@/lib/utils/removeHtmlTags";
import { setGroupChatReplyTarget } from "@/store/slice/groupChatSlice";
import { htmlToPreviewText } from "@/lib/utils/htmlToPreviewText";
import { useUserInfoState } from "@/hooks/useUserInfoState";
import { messageAuthorName } from "@/lib/utils/userDisplayName"
import { makeTaskAction } from "@/lib/task/makeTaskAction";

interface ChatMessageProps {
    chatInfo: ChatInfo
    isAdmin?: boolean
    addReaction: (emojiId: string, reactionId: string) => void
    removeReaction: (reactionId: string) => void
    removeChat: () => void
    updateChat: (body: string) => void
    priority?: boolean
    /** Continues the message above it (lib/messageGrouping). */
    continued?: boolean
    /** Arrived while the reader followed the end (C18). */
    arrived?: boolean
    grpId: string
}


export const GroupChatMessageMobile = ({chatInfo, grpId, isAdmin, addReaction, removeReaction, removeChat, updateChat, priority, continued = false, arrived = false}: ChatMessageProps) => {

    const dispatch = useDispatch();

    const router = useRouter();

    const copyToClipboard = useCopyToClipboard()


    const[isMessageEditEnabled, setIsMessageEditEnabled] = useState(false);


    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    const userInfoState = useUserInfoState(chatInfo.chat_from.user_uuid)

    const handleUserClick = useCallback((e: React.MouseEvent)=>{
        e.preventDefault()
        e.stopPropagation()
        router.push(`${app_user}/${chatInfo.chat_from.user_uuid}`);

    },[chatInfo.chat_from.user_uuid])

    // The reader's reaction (one per person), for the sheet's emoji row.
    const mine = chatInfo.chat_reactions?.find((r) => r?.reaction_added_by?.user_uuid === selfProfile.data?.data?.user_uuid)
    const userSelectedOption = { reactionId: mine?.uid ?? "", emojiId: mine?.reaction_emoji_id ?? "" }
    const message = useMemo(() => mapChatInfoToBaseMessage(chatInfo), [chatInfo])

    const copyPostText = () => {
        const t = removeHtmlTags(chatInfo.chat_body_text)

        copyToClipboard.copy(t, 'copied chat text')
    }

    const addEmojiReaction = () => {

        dispatch(closeUI('groupChatMessageLongPress'))

        dispatch(openUI({
            key: 'reactionPickerDrawer',
            data: {
                onReactionSelect(reaction: StandardReaction | SyncCustomReaction): void {
                    handleEmojiClick(reaction.id)
                },
                showCustomReactions: false
            }
        }))

    }

    const handleReply = () => {
        if (!chatInfo.chat_uuid) return
        dispatch(
            setGroupChatReplyTarget({
                grpId,
                uuid: chatInfo.chat_uuid,
                authorName: displayNameOf(chatInfo.chat_from) || "",
                text: htmlToPreviewText(chatInfo.chat_body_text),
            }),
        )
    }

    const onLongPress = () => {
        dispatch(openUI({
            key: 'groupChatMessageLongPress',
            data: {
                onAddReaction: addEmojiReaction,
                chatUUID: chatInfo.chat_uuid,
                grpId,
                editMessage: () => {setIsMessageEditEnabled(true)},
                deleteMessage: removeChat,
                isAdmin: isAdmin,
                isOwner: chatInfo.chat_from.user_uuid == selfProfile.data?.data.user_uuid,
                handleEmojiClick: handleEmojiClick,
                onReply: handleReply,
                copyTextToClipboard: copyPostText,
                messageText: removeHtmlTags(chatInfo.chat_body_text || ""),
                preview: sheetPreview(message, messageAuthorName(chatInfo.chat_from, userInfoState?.userName)),
                makeTask: () => {
                    const action = makeTaskAction({ html: chatInfo.chat_body_text, authorName: displayNameOf(chatInfo.chat_from), groupUUID: grpId, chatMessageID: chatInfo.chat_uuid }, window.location.origin)
                    if (action) dispatch(action)
                },
            }
        }))
    }


    const longPressEvent = useLongPress(onLongPress, {
        threshold: 500, // Reduced from 800ms to 500ms for quicker long press
        onLongPressStart: () =>{

        }
    })

    const handleEmojiClick = (emojiId: string) => {

        if(userSelectedOption.emojiId == emojiId) {
            removeReaction(userSelectedOption.reactionId)
            return
        }

        addReaction(emojiId, userSelectedOption.reactionId)
    }

    const handleSelectAttachment = (attachment: AttachmentMediaReq) => {

        if(chatInfo.chat_attachments) {
            dispatch(openUI({ key: 'attachmentLightbox', data: {allMedia: chatInfo.chat_attachments, media: attachment, mediaGetUrl: GetEndpointUrl.GetGroupChatMedia + '/' + grpId, analyzeContext: { srcKey: 'grpChat', srcRef: grpId }} }))

        }

    }

    // Not yet on the server: no thread to open and no actions, only its status.
    const pending = !!chatInfo.chat_send_state

    const handleOnCLick = useCallback((e: React.MouseEvent) => {
        // Prevent navigation if clicking on interactive elements
        if (pending || (e.target as HTMLElement).closest('button, a, .interactive')) return;
        router.push(`${app_grp_chat_path}/${grpId}/${chatInfo.chat_uuid}`);
    }, [router, grpId, chatInfo.chat_uuid, pending]);



    return (
        <MobileMessageRow
            message={message}
            continued={continued}
            arrived={arrived}
            priority={priority}
            editing={isMessageEditEnabled}
            onEditSave={(body) => {
                updateChat(body)
                setIsMessageEditEnabled(false)
            }}
            onEditCancel={() => setIsMessageEditEnabled(false)}
            onOpen={handleOnCLick}
            onUserClick={handleUserClick}
            longPress={pending ? {} : longPressEvent}
            addReaction={addReaction}
            removeReaction={removeReaction}
            onSelectAttachment={handleSelectAttachment}
            mediaGetUrl={GetEndpointUrl.GetGroupChatMedia + '/' + grpId}
        />
    )
}