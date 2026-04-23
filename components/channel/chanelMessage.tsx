"use client"

import { ChannelMessageAvatar } from "@/components/channel/channelMessageAvatar"
import { formatTimeForPostOrComment } from "@/lib/utils/date/formatTimeForPostOrComment"
import type { PostsRes } from "@/types/post"
import { cn } from "@/lib/utils/helpers/cn"
import { Check, X } from "lucide-react"
import MinimalTiptapTextInput from "@/components/textInput/textInput"

import { useEffect, useState, useCallback, useMemo } from "react"
import { usePathname } from "next/navigation"
import { MessagePreview } from "@/components/message/MessagePreview"
import { MessageDesktopHoverOptionsForMainChatAndChannel } from "@/components/MessageDesktopHover/messageDesktopHoverOptionsForMainChatAndChannel"
import type { UserProfileInterface, UserSelectedOptionInterface } from "@/types/user"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { BottomMenu } from "@/components/message/bottomMenu"
import { MessageAttachments } from "@/components/message/MessageAttachments"
import { useDispatch } from "react-redux"
import {openUI} from "@/store/slice/uiSlice"
import type { AttachmentMediaReq } from "@/types/attachment"
import { MessageReplyCount } from "@/components/message/messageReplyCount"
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import { updateUserInfoStatus } from "@/store/slice/userSlice"
import {useUserInfoState} from "@/hooks/useUserInfoState";
import {userInfo} from "node:os";

interface ChannelMessageProps {
    postInfo: PostsRes
    isAdmin?: boolean
    addReaction: (emojiId: string, reactionId: string) => void
    removeReaction: (reactionId: string) => void
    removePost: () => void
    updatePost: (body: string) => void
    priority?: boolean
}

/**
 * Renders a channel message with editing, reactions, and media support
 * Optimized with memoized selectors and callback functions
 */
export const ChannelMessage = ({
                                   updatePost,
                                   postInfo,
                                   addReaction,
                                   removeReaction,
                                   isAdmin,
                                   removePost,
                               }: ChannelMessageProps) => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false)
    const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false)
    const [isMessageEditEnabled, setIsMessageEditEnabled] = useState(false)
    const [updatedText, setUpdatedText] = useState<string>(postInfo.post_text || "")

    const channelId = usePathname().split("/")[3]
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const dispatch = useDispatch()

    const userInfoState = useUserInfoState(postInfo.post_by.user_uuid)

    const reactions = useMemo(() => {
        const r: { [key: string]: string[] } = {}
        if (postInfo.post_reactions) {
            postInfo.post_reactions.forEach((reaction) => {
                if (!r[reaction.reaction_emoji_id]) {
                    r[reaction.reaction_emoji_id] = []
                }
                if (reaction.reaction_added_by?.user_name) {
                    r[reaction.reaction_emoji_id].push(reaction.reaction_added_by.user_name)
                }
            })
        }
        return r
    }, [postInfo.post_reactions])

    const userSelectedOption = useMemo(() => {
        if (!selfProfile.data?.data || !postInfo.post_reactions) return {} as UserSelectedOptionInterface

        const reaction = postInfo.post_reactions.find(
            (r) => r.reaction_added_by?.user_uuid === selfProfile.data?.data.user_uuid,
        )
        if (reaction) {
            return {
                reactionId: reaction.uid,
                emojiId: reaction.reaction_emoji_id,
            }
        }
        return {} as UserSelectedOptionInterface
    }, [postInfo.post_reactions, selfProfile.data?.data])

    const handleUserClick = useCallback(()=>{

        dispatch(openUI({ key: 'otherUserProfile', data: {userUUID: postInfo.post_by.user_uuid} }))

    },[postInfo.post_by.user_uuid])

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

    const handleEmojiClick = useCallback(
        (emojiId: string) => {
            if (userSelectedOption.emojiId === emojiId) {
                removeReaction(userSelectedOption.reactionId)
                return
            }
            addReaction(emojiId, userSelectedOption.reactionId)
        },
        [userSelectedOption, addReaction, removeReaction],
    )

    const handleOpenThread = useCallback(() => {
        dispatch(
            openRightPanel({channelUUID: channelId, postUUID: postInfo.post_uuid || "", chatMessageUUID: '', chatUUID: '', taskUUID: '', groupUUID: '', docUUID:''})
        )
    }, [postInfo.post_uuid, channelId, dispatch])

    const handleEditComplete = useCallback(() => {
        updatePost(updatedText)
        setIsMessageEditEnabled(false)
        setIsDropdownOpen(false)
    }, [updatedText, updatePost])

    const handleEditCancel = useCallback(() => {
        setIsMessageEditEnabled(false)
        setIsDropdownOpen(false)
    }, [])

    return (
        <div
            className={`pl-4 space-x-4 relative pb-4 pt-4 hover:bg-primary/10 transition-colors delay-200 group ${isDropdownOpen || isEmojiPickerOpen ? "bg-primary/5" : ""}`}
        >
            <div className={`flex space-x-4`}>
                {!isMessageEditEnabled && (
                    <div
                        className={cn(
                            "ml-2 absolute -top-5 right-1 transition-opacity delay-200",
                            isDropdownOpen || isEmojiPickerOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                        )}
                    >
                        <MessageDesktopHoverOptionsForMainChatAndChannel
                            editMessage={() => {
                                setIsMessageEditEnabled(true)
                            }}
                            deleteMessage={removePost}
                            isOwner={postInfo.post_by.user_uuid === selfProfile.data?.data.user_uuid}
                            isAdmin={isAdmin}
                            setEmojiPopupState={setIsEmojiPickerOpen}
                            onReactionSelect={handleEmojiClick}
                            setIsDropdownOpen={setIsDropdownOpen}
                            channelUUID={channelId}
                            postUUID={postInfo.post_uuid}
                        />
                    </div>
                )}
                <div className="h-12 w-12 flex-shrink-0" onClick={handleUserClick}>
                    <ChannelMessageAvatar
                        userName={userInfoState.userName || postInfo.post_by.user_name}
                        userProfileKey={userInfoState.profileKey ?? postInfo.post_by.user_profile_object_key}
                    />
                </div>
                <div className="flex-1">
                    {!isMessageEditEnabled && (
                        <div className="flex items-baseline space-x-2">
                            <div className="font-semibold text-m hover:underline" onClick={handleUserClick}>{userInfoState.userName || postInfo.post_by.user_name}</div>
                            <div className="text-xs text-muted-foreground text">
                                {formatTimeForPostOrComment(postInfo.post_created_at, true)}
                            </div>
                        </div>
                    )}
                    <div className="break-all w-full">
                        <MinimalTiptapTextInput
                            throttleDelay={300}
                            isOutputText={true}
                            className={cn("max-w-full rounded-xl h-auto", isMessageEditEnabled ? "p-2" : "border-none")}
                            editorContentClassName="overflow-auto mb-2"
                            output="html"
                            content={postInfo.post_text}
                            placeholder={"message"}
                            editable={isMessageEditEnabled}
                            PrimaryButtonIcon={Check}
                            buttonOnclick={handleEditComplete}
                            SecondaryButtonIcon={X}
                            secondaryButtonOnclick={handleEditCancel}
                            editorClassName="focus:outline-none "
                            onChange={(content) => {
                                const s = content as string
                                setUpdatedText(s)
                            }}
                        ></MinimalTiptapTextInput>
                    </div>

                    {(postInfo.post_fwd_msg_chat || postInfo.post_fwd_msg_post) && !isMessageEditEnabled && (
                        <MessagePreview
                            msgBy={postInfo.post_fwd_msg_post?.post_by || postInfo.post_fwd_msg_chat?.chat_from}
                            msgText={postInfo.post_fwd_msg_post?.post_text || postInfo.post_fwd_msg_chat?.chat_body_text || ""}
                            msgChannelName={postInfo.post_fwd_msg_post?.post_channel?.ch_name}
                            msgChannelUUID={postInfo.post_fwd_msg_post?.post_channel?.ch_uuid}
                            msgUUID={postInfo.post_fwd_msg_post?.post_uuid || postInfo.post_fwd_msg_chat?.chat_uuid}
                            msgCreatedAt={postInfo.post_fwd_msg_post?.post_created_at || postInfo.post_fwd_msg_chat?.chat_created_at}
                            vewFooter={true}
                        />
                    )}

                    {!isMessageEditEnabled && postInfo.post_attachments && postInfo.post_attachments?.length > 0 && (
                        <MessageAttachments
                            attachmentSelected={handleSelectAttachment}
                            attachments={postInfo.post_attachments}
                            mediaGetUrl={GetEndpointUrl.GetChannelMedia + "/" + channelId}
                        />
                    )}

                    {postInfo.post_comments && postInfo.post_comment_count && (
                        <div className="mb-2">
                            <MessageReplyCount
                                openDesktopThread={handleOpenThread}
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
        </div>
    )
}
