"use client"

import { displayNameOf } from "@/lib/personName"
import { useRelayedAuthor } from "@/hooks/useRelayedAuthor"
import type { PostsRes } from "@/types/post"
import { MobileMessageRow, sheetPreview } from "@/components/message/mobileMessageRow"
import { mapPostsResToBaseMessage } from "@/components/message/baseMessageCard"
import { useLongPress } from "@/hooks/useLongPress"
import { useDispatch } from "react-redux"
import { setChannelReplyTarget } from "@/store/slice/channelSlice"
import { htmlToPreviewText } from "@/lib/utils/htmlToPreviewText"
import type { StandardReaction, SyncCustomReaction } from "@/types/reaction"
import { app_channel_path, app_user } from "@/types/paths"
import { useRouter } from "next/navigation"
import { GetEndpointUrl } from "@/services/endPoints"
import { useCallback, useMemo, useState, memo } from "react"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import type { UserProfileInterface } from "@/types/user"
import type { AttachmentMediaReq } from "@/types/attachment"
import { openUI, closeUI } from "@/store/slice/uiSlice"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import { removeHtmlTags } from "@/lib/utils/removeHtmlTags"
import { useUserInfoState } from "@/hooks/useUserInfoState";
import { makeTaskAction } from "@/lib/task/makeTaskAction";

interface ChannelMessageProps {
    postInfo: PostsRes
    isAdmin?: boolean
    addReaction: (emojiId: string, reactionId: string) => void
    removeReaction: (reactionId: string) => void
    channelId: string
    removePost: () => void
    updatePost: (body: string) => void
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

    const [isMessageEditEnabled, setIsMessageEditEnabled] = useState(false)

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
        router.push(`${app_user}/${postInfo.post_by.user_uuid}`);

    },[postInfo.post_by.user_uuid, relayed])

    // The reader's reaction, for the sheet's emoji row (one per person).
    const mine = postInfo.post_reactions?.find((r) => r?.reaction_added_by?.user_uuid === selfProfile.data?.data?.user_uuid)
    const handleEmojiClick = useCallback(
        (emojiId: string) => {
            if (mine?.reaction_emoji_id == emojiId) {
                removeReaction(mine.uid)
                return
            }
            addReaction(emojiId, mine?.uid ?? "")
        },
        [mine, removeReaction, addReaction],
    )

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
                editMessage: () => { // Changed to match original `editMessage` behavior
                    setIsMessageEditEnabled(true)
                },
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
    }, [dispatch, addEmojiReaction, channelId, postInfo.post_uuid, setIsMessageEditEnabled, removePost, isAdmin, selfProfile.data?.data, postInfo.post_by?.user_uuid, handleEmojiClick, handleReply, copyPostText, postText, relayed, postInfo.post_by, message, authorName])

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
                            analyzeContext: { srcKey: 'channel', srcRef: channelId },
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

    const handleOnClick = useCallback((e: React.MouseEvent) => {
        // Prevent navigation if clicking on interactive elements
        if (pending || (e.target as HTMLElement).closest('button, a, .interactive')) return;
        router.push(postHref);
    }, [router, postHref, pending]);

    return (
        <MobileMessageRow
            message={message}
            continued={continued}
            arrived={arrived}
            priority={priority}
            editing={isMessageEditEnabled}
            onEditSave={(body) => {
                updatePost(body)
                setIsMessageEditEnabled(false)
            }}
            onEditCancel={() => setIsMessageEditEnabled(false)}
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
