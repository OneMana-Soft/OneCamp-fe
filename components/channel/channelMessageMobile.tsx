"use client"

import { ChannelMessageAvatar } from "@/components/channel/channelMessageAvatar"
import { formatTimeForPostOrComment } from "@/lib/utils/date/formatTimeForPostOrComment"
import type { PostsRes } from "@/types/post"
import { cn } from "@/lib/utils/helpers/cn"
import { Check, X } from "lucide-react"
import MinimalTiptapTextInput from "@/components/textInput/textInput"
import { useLongPress } from "@/hooks/useLongPress"
import { useDispatch } from "react-redux"
import type { StandardReaction, SyncCustomReaction } from "@/types/reaction"
import { MessagePreview } from "@/components/message/MessagePreview"
import {app_channel_path, app_chat_path, app_user} from "@/types/paths"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { MessageAttachments } from "@/components/message/MessageAttachments"
import { GetEndpointUrl } from "@/services/endPoints"
import { BottomMenu } from "@/components/message/bottomMenu"
import { useCallback, useEffect, useState, memo } from "react"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import type { UserProfileInterface, UserSelectedOptionInterface } from "@/types/user"
import type { AttachmentMediaReq } from "@/types/attachment"
import { openUI, closeUI } from "@/store/slice/uiSlice"
import { ConditionalWrap } from "../conditionalWrap/conditionalWrap"
import { MessageReplyCount } from "@/components/message/messageReplyCount"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import { removeHtmlTags } from "@/lib/utils/removeHtmlTags"
import {updateUserInfoStatus} from "@/store/slice/userSlice";
import {useUserInfoState} from "@/hooks/useUserInfoState";

interface ChannelMessageProps {
    postInfo: PostsRes
    isAdmin?: boolean
    addReaction: (emojiId: string, reactionId: string) => void
    removeReaction: (reactionId: string) => void
    channelId: string
    removePost: () => void
    updatePost: (body: string) => void
    priority?: boolean
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
                                       }: ChannelMessageProps) => {
    const dispatch = useDispatch()

    const router = useRouter()

    const copyToClipboard = useCopyToClipboard()

    const [isMessageEditEnabled, setIsMessageEditEnabled] = useState(false)

    const userInfoState = useUserInfoState(postInfo.post_by.user_uuid)


    const [userSelectedOption, setUserSelectedOption] = useState<UserSelectedOptionInterface>(
        {} as UserSelectedOptionInterface,
    )
    const [reactions, setReactions] = useState<{ [key: string]: string[] }>({})

    const [updatedText, setUpdatedText] = useState<string>(postInfo.post_text || "")

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    const handleUserClick = useCallback((e: React.MouseEvent)=>{
        e.preventDefault()
        e.stopPropagation()
        router.push(`${app_user}/${postInfo.post_by.user_uuid}`);

    },[postInfo.post_by.user_uuid])

    useEffect(() => {
        setUserSelectedOption({} as UserSelectedOptionInterface)
        setReactions({})
        if (selfProfile.data?.data && postInfo.post_reactions) {
            postInfo.post_reactions.forEach((reaction) => {
                if (reaction.reaction_added_by.user_uuid == selfProfile.data?.data.user_uuid) {
                    setUserSelectedOption({
                        reactionId: reaction.uid,
                        emojiId: reaction.reaction_emoji_id,
                    })
                }
                setReactions((prevReactions) => ({
                    ...prevReactions,
                    [reaction.reaction_emoji_id]: [
                        ...(prevReactions[reaction.reaction_emoji_id] || []),
                        reaction.reaction_added_by.user_name,
                    ],
                }))
            })
        }
    }, [postInfo, selfProfile.data?.data])
    
    const handleEmojiClick = useCallback(
        (emojiId: string) => {
            if (userSelectedOption.emojiId == emojiId) {
                removeReaction(userSelectedOption.reactionId)
                return
            }

            addReaction(emojiId, userSelectedOption.reactionId)
        },
        [userSelectedOption, removeReaction, addReaction],
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
        const t = removeHtmlTags(postInfo.post_text)

        copyToClipboard.copy(t, "copied post text")
    }, [postInfo.post_text, copyToClipboard])

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
                copyTextToClipboard: () => { // Changed to match original `copyPostText` behavior
                    copyPostText()
                }
            }
        }))
    }, [dispatch, addEmojiReaction, channelId, postInfo.post_uuid, setIsMessageEditEnabled, removePost, isAdmin, selfProfile.data?.data, postInfo.post_by?.user_uuid, handleEmojiClick, copyPostText])

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
                        }
                    }),
                )
            }
        },
        [postInfo.post_attachments, channelId, dispatch],
    )

    const postHref = `${app_channel_path}/${channelId}/${postInfo.post_uuid}`

    const handleOnClick = useCallback((e: React.MouseEvent) => {
        // Prevent navigation if clicking on interactive elements
        if ((e.target as HTMLElement).closest('button, a, .interactive')) return;
        router.push(postHref);
    }, [router, postHref]);

    return (
        <ConditionalWrap condition={!isMessageEditEnabled} wrap={(c) => <div onClick={handleOnClick} className="block cursor-pointer">{c}</div>}>
            <div className="flex p-4 space-x-4 select-none" {...longPressEvent}>
                <div className="h-12 w-12 flex-shrink-0" onClick={handleUserClick}>
                    <ChannelMessageAvatar
                        userName={userInfoState.userName || postInfo.post_by.user_name}
                        userProfileKey={userInfoState.profileKey ?? postInfo.post_by.user_profile_object_key}
                    />
                </div>
                <div className="w-full">
                    <div className="flex items-baseline space-x-2">
                        <div className="font-semibold text-m" onClick={handleUserClick}>{userInfoState.userName || postInfo.post_by.user_name}</div>
                        <div className="text-xs text-muted-foreground text">
                            {formatTimeForPostOrComment(postInfo.post_created_at, true)}
                        </div>
                    </div>
                    <div className="break-all">
                        <MinimalTiptapTextInput
                            throttleDelay={300}
                            isOutputText={true}
                            className={cn("max-w-full rounded-xl h-auto ", isMessageEditEnabled ? "p-2 ml-[-4]" : "border-none")}
                            editorContentClassName={cn("overflow-auto")}
                            output="html"
                            content={postInfo.post_text}
                            placeholder={"message"}
                            editable={isMessageEditEnabled}
                            PrimaryButtonIcon={Check}
                            buttonOnclick={() => {
                                updatePost(updatedText)
                                setIsMessageEditEnabled(false)
                            }}
                            SecondaryButtonIcon={X}
                            secondaryButtonOnclick={() => {
                                setIsMessageEditEnabled(false)
                            }}
                            editorClassName="focus:outline-none "
                            onChange={(content) => {
                                const s = content as string

                                setUpdatedText(s)
                            }}
                        ></MinimalTiptapTextInput>
                        <div className={`${postInfo.post_text && postInfo.post_text.length > 0 ? "mb-2" : ""}`} />

                        {(postInfo.post_fwd_msg_chat || postInfo.post_fwd_msg_post) && (
                            <MessagePreview
                                msgBy={postInfo.post_by || postInfo.post_fwd_msg_chat?.chat_from}
                                msgText={postInfo.post_fwd_msg_post?.post_text || postInfo.post_fwd_msg_chat?.chat_body_text || ""}
                                msgChannelName={postInfo.post_fwd_msg_post?.post_channel?.ch_name}
                                msgChannelUUID={postInfo.post_fwd_msg_post?.post_channel?.ch_uuid}
                                msgUUID={postInfo.post_uuid || postInfo.post_fwd_msg_post?.post_uuid || postInfo.post_fwd_msg_chat?.chat_uuid}
                                msgCreatedAt={
                                    postInfo.post_fwd_msg_post?.post_created_at || postInfo.post_fwd_msg_chat?.chat_created_at
                                }
                                vewFooter={true}
                            />
                        )}
                    </div>

                    {!isMessageEditEnabled && postInfo.post_attachments && postInfo.post_attachments?.length > 0 && (
                        <MessageAttachments
                            attachmentSelected={handleSelectAttachment}
                            attachments={postInfo.post_attachments}
                            mediaGetUrl={GetEndpointUrl.GetChannelMedia + "/" + channelId}
                        />
                    )}

                    {postInfo.post_comments && postInfo.post_comment_count && (
                        <div className="mb-3">
                            <MessageReplyCount
                                replyCount={postInfo.post_comment_count}
                                lastCommentCreatedAt={postInfo.post_comments[postInfo.post_comments.length - 1].comment_created_at}
                            />
                        </div>
                    )}

                    {!isMessageEditEnabled && (
                        <BottomMenu
                            handleEmojiClick={handleEmojiClick}
                            reactions={reactions}
                            selectedEmojiId={userSelectedOption.emojiId}
                        />
                    )}
                </div>
            </div>
        </ConditionalWrap>
    )
}

export const ChannelMessageMobile = memo(ChannelMessageMobileComponent)
ChannelMessageMobile.displayName = "ChannelMessageMobile"
