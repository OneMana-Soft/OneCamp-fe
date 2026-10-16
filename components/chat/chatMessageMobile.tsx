import { displayNameOf } from "@/lib/personName"
import { MobileMessageRow, sheetPreview } from "@/components/message/mobileMessageRow";
import { mapChatInfoToBaseMessage } from "@/components/message/baseMessageCard";
import { useLongPress } from "@/hooks/useLongPress";
import { useDispatch } from "react-redux";
import { openUI, closeUI } from "@/store/slice/uiSlice";
import { StandardReaction, SyncCustomReaction } from "@/types/reaction";
import { app_chat_path } from "@/types/paths";
import { usePathname, useRouter } from "next/navigation";
import { GetEndpointUrl } from "@/services/endPoints";
import { useCallback, useMemo } from "react";
import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { UserProfileInterface } from "@/types/user";
import { AttachmentMediaReq } from "@/types/attachment";
import { ChatInfo } from "@/types/chat";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { removeHtmlTags } from "@/lib/utils/removeHtmlTags";
import { setChatReplyTarget } from "@/store/slice/chatSlice";
import { htmlToPreviewText } from "@/lib/utils/htmlToPreviewText";
import { useUserInfoState } from "@/hooks/useUserInfoState";
import { messageAuthorName } from "@/lib/utils/userDisplayName"
import { makeTaskAction } from "@/lib/task/makeTaskAction";
import { useEditInPlace } from "@/hooks/useEditInPlace";

interface ChatMessageProps {
    chatInfo: ChatInfo
    isAdmin?: boolean
    addReaction: (emojiId: string, reactionId: string) => void
    removeReaction: (reactionId: string) => void
    removeChat: () => void
    /** Saves an edit: answers whether it saved, so a failure opens the box again with the words typed (F-06). */
    updateChat: (body: string) => Promise<boolean> | void
    priority?: boolean
    /** Continues the message above it (lib/messageGrouping). */
    continued?: boolean
    /** Arrived while the reader followed the end (C18). */
    arrived?: boolean
}


export const ChatMessageMobile = ({chatInfo, isAdmin, addReaction, removeReaction, removeChat, updateChat, priority, continued = false, arrived = false}: ChatMessageProps) => {

    const dispatch = useDispatch();

    const router = useRouter();

    const copyToClipboard = useCopyToClipboard()

    const otherUserUUID = usePathname().split('/')[3]

    // An edit in place, opened again with what was typed when its save fails (F-06).
    const edit = useEditInPlace(updateChat);


    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    const userInfoState = useUserInfoState(chatInfo.chat_from.user_uuid)

    const handleUserClick = useCallback((e: React.MouseEvent)=>{
        e.preventDefault()
        e.stopPropagation()
        // The profile sheet, as a desktop opens it. It went to the member
        // page, a whole screen away from the conversation.
        dispatch(openUI({ key: "otherUserProfile", data: { userUUID: chatInfo.chat_from.user_uuid } }))

    },[chatInfo.chat_from.user_uuid, dispatch])

    // The reader's reaction (one per person), for the sheet's emoji row.
    const mine = chatInfo.chat_reactions?.find((r) => r?.reaction_added_by?.user_uuid === selfProfile.data?.data?.user_uuid)
    const userSelectedOption = { reactionId: mine?.uid ?? "", emojiId: mine?.reaction_emoji_id ?? "" }
    const message = useMemo(() => mapChatInfoToBaseMessage(chatInfo), [chatInfo])

    const copyPostText = () => {
        const t = removeHtmlTags(chatInfo.chat_body_text)

        copyToClipboard.copy(t, 'copied chat text')
    }

    const addEmojiReaction = () => {

        dispatch(closeUI('chatMessageLongPress'))

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
            setChatReplyTarget({
                chatUUID: otherUserUUID,
                uuid: chatInfo.chat_uuid,
                authorName: displayNameOf(chatInfo.chat_from) || "",
                text: htmlToPreviewText(chatInfo.chat_body_text),
            }),
        )
    }

    const onLongPress = () => {
        dispatch(openUI({
            key: 'chatMessageLongPress',
            data: {
                onAddReaction: addEmojiReaction,
                chatUUID: chatInfo.chat_uuid,
                otherUserUUID: otherUserUUID,
                editMessage: edit.open,
                deleteMessage: removeChat,
                isAdmin: isAdmin,
                isOwner: chatInfo.chat_from.user_uuid == selfProfile.data?.data.user_uuid,
                handleEmojiClick: handleEmojiClick,
                onReply: handleReply,
                copyTextToClipboard: copyPostText,
                messageText: removeHtmlTags(chatInfo.chat_body_text || ""),
                preview: sheetPreview(message, messageAuthorName(chatInfo.chat_from, userInfoState?.userName)),
                makeTask: () => {
                    const action = makeTaskAction({ html: chatInfo.chat_body_text, authorName: displayNameOf(chatInfo.chat_from), chatUUID: otherUserUUID, chatMessageID: chatInfo.chat_uuid }, window.location.origin)
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
            dispatch(openUI({
                key: 'attachmentLightbox',
                data: {allMedia: chatInfo.chat_attachments, media: attachment, mediaGetUrl: GetEndpointUrl.GetChatMedia + '/' + otherUserUUID, analyzeContext: { srcKey: 'chat', srcRef: otherUserUUID }}
            }))

        }

    }

    // Not yet on the server: no thread to open and no actions, only its status.
    const pending = !!chatInfo.chat_send_state

    // Its thread; the row decides which taps open it (opensThread).
    const handleOnCLick = useCallback(() => {
        if (pending) return;
        router.push(`${app_chat_path}/${otherUserUUID}/${chatInfo.chat_uuid}`);
    }, [router, otherUserUUID, chatInfo.chat_uuid, pending]);



    return (
        <MobileMessageRow
            message={message}
            continued={continued}
            arrived={arrived}
            priority={priority}
            editing={edit.editing}
            editDraft={edit.draft}
            onEditSave={edit.finish}
            onEditCancel={edit.cancel}
            onOpen={handleOnCLick}
            onUserClick={handleUserClick}
            longPress={pending ? {} : longPressEvent}
            addReaction={addReaction}
            removeReaction={removeReaction}
            onSelectAttachment={handleSelectAttachment}
            mediaGetUrl={GetEndpointUrl.GetChatMedia + '/' + otherUserUUID}
        />
    )
}