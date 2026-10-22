"use client"

import { displayNameOf } from "@/lib/personName"
import { useRelayedAuthor } from "@/hooks/useRelayedAuthor"
import { useMessageReactions } from "@/hooks/useMessageReactions"
import type { PostsRes } from "@/types/post"
import { MobileMessageRow, sheetPreview } from "@/components/message/mobileMessageRow"
import { mapPostsResToBaseMessage } from "@/components/message/baseMessageCard"
import { useLongPress } from "@/hooks/useLongPress"
import { useDispatch } from "react-redux"
import { setChannelReplyTarget } from "@/store/slice/channelSlice"
import { htmlToPreviewText } from "@/lib/utils/htmlToPreviewText"
import type { StandardReaction, SyncCustomReaction } from "@/types/reaction"
import { app_channel_path } from "@/types/paths"
import { useRouter } from "next/navigation"
import { GetEndpointUrl } from "@/services/endPoints"
import { useCallback, useMemo, memo } from "react"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import type { UserProfileInterface } from "@/types/user"
import type { AttachmentMediaReq } from "@/types/attachment"
import { openUI, closeUI } from "@/store/slice/uiSlice"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import { removeHtmlTags } from "@/lib/utils/removeHtmlTags"
import { useUserInfoState } from "@/hooks/useUserInfoState";
import { makeTaskAction } from "@/lib/task/makeTaskAction";
import { useEditInPlace } from "@/hooks/useEditInPlace";

interface ChannelMessageProps {
    postInfo: PostsRes
    isAdmin?: boolean
    addReaction: (emojiId: string, reactionId: string) => void
    removeReaction: (reactionId: string) => void
    channelId: string
    removePost: () => void
    /** Saves an edit: answers whether it saved, so a failure opens the box again with the words typed (F-06). */
    updatePost: (body: string) => Promise<boolean> | void
    priority?: boolean
    /** Continues the message above it (lib/messageGrouping). */
    continued?: boolean
    /** Arrived while the reader followed the end (C18). */
    arrived?: boolean
}

const ChannelMessageMobileComponent = ({
                                           postInfo,
                                           channelId,
                                           isAdmin,
                                           addReaction,
                                           removeReaction,
                                           removePost,
                                           updatePost,
                                           priority,
                                           continued = false,
                                           arrived = false,
                                       }: ChannelMessageProps) => {
    const dispatch = useDispatch()

    const router = useRouter()

    const copyToClipboard = useCopyToClipboard()

    // An edit in place, opened again with what was typed when its save fails (F-06).
    const edit = useEditInPlace(updatePost)

    const userInfoState = useUserInfoState(postInfo.post_by.user_uuid)
    // A channel guest's or Slack person's message is drawn as theirs (see lib/relayedAuthor).
    const relayed = useRelayedAuthor(postInfo.post_by, postInfo.post_text)
    const authorName = relayed ? relayed.name : (userInfoState.userName || displayNameOf(postInfo.post_by))
    const postText = relayed ? relayed.body : postInfo.post_text


    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    const handleUserClick = useCallback((e: React.MouseEvent)=>{
        e.preventDefault()
        e.stopPropagation()
        // A guest or Slack person has no profile: the relaying bot's would stand in.
        if (relayed) return
        // The profile sheet, as a desktop opens it (chanelMessage). It went to
        // the member page, a whole screen away from the conversation.
        dispatch(openUI({ key: "otherUserProfile", data: { userUUID: postInfo.post_by.user_uuid } }))

    },[postInfo.post_by.user_uuid, relayed, dispatch])

    // The sheet's emoji row and the picker: several emoji a person, each once (lib/chat/reactions).
    const handleEmojiClick = useMessageReactions(postInfo.post_reactions, selfProfile.data?.data?.user_uuid, addReaction, removeReaction).toggle

    const addEmojiReaction = useCallback(() => {
        dispatch(closeUI('channelMessageLongPress'))
        dispatch(openUI({
            key: 'reactionPickerDrawer',
            data: {
                showCustomReactions: true,
                onReactionSelect: (emoji: StandardReaction | SyncCustomReaction) => {
                    handleEmojiClick(emoji.id)
                }
            }
        }))
    }, [dispatch, handleEmojiClick])

    const copyPostText = useCallback(() => {
        const t = removeHtmlTags(postText)

        copyToClipboard.copy(t, "copied post text")
    }, [postText, copyToClipboard])

    const handleReply = useCallback(() => {
        if (!postInfo.post_uuid) return
        dispatch(
            setChannelReplyTarget({
                channelId,
                uuid: postInfo.post_uuid,
                authorName: relayed ? relayed.name : displayNameOf(postInfo.post_by),
                text: htmlToPreviewText(postText),
            }),
        )
    }, [dispatch, channelId, postInfo.post_uuid, postInfo.post_by, postText, relayed])

    const message = useMemo(() => mapPostsResToBaseMessage(postInfo), [postInfo])

    const onLongPress = useCallback(() => {
        // The instruction implies removing the old drawer slice calls and replacing with openUI.
        // The instruction's snippet had a nested `dispatch(dispatch(openUI(...)))` and orphaned lines.
        // This is a corrected version based on the intent to use `openUI`.
        dispatch(openUI({
            key: 'channelMessageLongPress',
            data: {
                onAddReaction: addEmojiReaction,
                channelUUID: channelId,
                postUUID: postInfo.post_uuid,
                editMessage: edit.open,
                deleteMessage: () => {
                    removePost()
                },
                isAdmin: isAdmin,
                isOwner: selfProfile.data?.data?.user_uuid === postInfo.post_by?.user_uuid,
                handleEmojiClick: (emoji: string) => {
                    handleEmojiClick(emoji) // Reverted to original logic for `handleEmojiClick`
                },
                onReply: handleReply,
                copyTextToClipboard: () => { // Changed to match original `copyPostText` behavior
                    copyPostText()
                },
                messageText: removeHtmlTags(postText || ""),
                preview: sheetPreview(message, authorName),
                makeTask: () => {
                    const action = makeTaskAction({ html: postText, authorName: relayed ? relayed.name : displayNameOf(postInfo.post_by), channelUUID: channelId, postUUID: postInfo.post_uuid }, window.location.origin)
                    if (action) dispatch(action)
                },
            }
        }))
    }, [dispatch, addEmojiReaction, channelId, postInfo.post_uuid, edit.open, removePost, isAdmin, selfProfile.data?.data, postInfo.post_by?.user_uuid, handleEmojiClick, handleReply, copyPostText, postText, relayed, postInfo.post_by, message, authorName])

    const longPressEvent = useLongPress(onLongPress, {
        threshold: 500,
        onLongPressStart: () => {},
    })

    const handleSelectAttachment = useCallback(
        (attachment: AttachmentMediaReq) => {
            if (postInfo.post_attachments) {
                dispatch(
                    openUI({
                        key: 'attachmentLightbox',
                        data: {
                            allMedia: postInfo.post_attachments,
                            media: attachment,
                            mediaGetUrl: GetEndpointUrl.GetChannelMedia + "/" + channelId,
                            source: { srcKey: 'channel', srcRef: channelId },
                        }
                    }),
                )
            }
        },
        [postInfo.post_attachments, channelId, dispatch],
    )

    const postHref = `${app_channel_path}/${channelId}/${postInfo.post_uuid}`

    // Not yet on the server: no thread to open and no actions, only its status.
    const pending = !!postInfo.post_send_state

    // Its thread; the row decides which taps open it (opensThread).
    const handleOnClick = useCallback(() => {
        if (pending) return;
        router.push(postHref);
    }, [router, postHref, pending]);

    return (
        <MobileMessageRow
            inChannel
            message={message}
            continued={continued}
            arrived={arrived}
            priority={priority}
            editing={edit.editing}
            editDraft={edit.draft}
            onEditSave={edit.finish}
            onEditCancel={edit.cancel}
            onOpen={handleOnClick}
            onUserClick={handleUserClick}
            longPress={pending ? {} : longPressEvent}
            addReaction={addReaction}
            removeReaction={removeReaction}
            onSelectAttachment={handleSelectAttachment}
            mediaGetUrl={GetEndpointUrl.GetChannelMedia + "/" + channelId}
        />
    )
}

export const ChannelMessageMobile = memo(ChannelMessageMobileComponent)
ChannelMessageMobile.displayName = "ChannelMessageMobile"
