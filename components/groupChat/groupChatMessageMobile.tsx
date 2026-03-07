import {ChannelMessageAvatar} from "@/components/channel/channelMessageAvatar";
import {formatTimeForPostOrComment} from "@/lib/utils/date/formatTimeForPostOrComment";
import {cn} from "@/lib/utils/helpers/cn";
import {Check, X} from "lucide-react";
import MinimalTiptapTextInput from "@/components/textInput/textInput";
import {useLongPress} from "@/hooks/useLongPress";
import {useDispatch} from "react-redux";
import {openUI, closeUI} from "@/store/slice/uiSlice";
import {StandardReaction, SyncCustomReaction} from "@/types/reaction";
import {MessagePreview} from "@/components/message/MessagePreview";
import {app_chat_path, app_grp_chat_path, app_user} from "@/types/paths";
import {usePathname, useRouter} from "next/navigation";
import {MessageAttachments} from "@/components/message/MessageAttachments";
import {GetEndpointUrl} from "@/services/endPoints";
import {BottomMenu} from "@/components/message/bottomMenu";
import {useCallback, useEffect, useState} from "react";
import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {UserProfileInterface, UserSelectedOptionInterface} from "@/types/user";
import { AttachmentMediaReq} from "@/types/attachment";
import { ConditionalWrap } from "../conditionalWrap/conditionalWrap";
import {MessageReplyCount} from "@/components/message/messageReplyCount";
import {ChatInfo} from "@/types/chat";
import {useCopyToClipboard} from "@/hooks/useCopyToClipboard";
import {removeHtmlTags} from "@/lib/utils/removeHtmlTags";
import {updateUserInfoStatus} from "@/store/slice/userSlice";
import {useUserInfoState} from "@/hooks/useUserInfoState";

interface ChatMessageProps {
    chatInfo: ChatInfo
    isAdmin?: boolean
    addReaction: (emojiId: string, reactionId: string) => void
    removeReaction: (reactionId: string) => void
    removeChat: () => void
    updateChat: (body: string) => void
    priority?: boolean
    grpId: string
}


export const GroupChatMessageMobile = ({chatInfo, grpId, isAdmin, addReaction, removeReaction, removeChat, updateChat, priority}: ChatMessageProps) => {

    const dispatch = useDispatch();

    const router = useRouter();

    const copyToClipboard = useCopyToClipboard()


    const[isMessageEditEnabled, setIsMessageEditEnabled] = useState(false);

    const [userSelectedOption, setUserSelectedOption] = useState<UserSelectedOptionInterface>({} as UserSelectedOptionInterface)
    const [reactions, setReactions] = useState<{ [key: string]: string[] }>({});

    const [updatedText, setUpdatedText] = useState<string>(chatInfo.chat_body_text||'');

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    const userInfoState = useUserInfoState(chatInfo.chat_from.user_uuid)

    const handleUserClick = useCallback((e: React.MouseEvent)=>{
        e.preventDefault()
        e.stopPropagation()
        router.push(`${app_user}/${chatInfo.chat_from.user_uuid}`);

    },[chatInfo.chat_from.user_uuid])

    useEffect(() => {
        setUserSelectedOption({} as UserSelectedOptionInterface)
        setReactions({})
        if (selfProfile.data?.data && chatInfo.chat_reactions) {
            chatInfo.chat_reactions.forEach((reaction) => {
                if (reaction.reaction_added_by.user_uuid == selfProfile.data?.data.user_uuid) {
                    setUserSelectedOption({
                        reactionId: reaction.uid,
                        emojiId: reaction.reaction_emoji_id
                    })
                }
                setReactions(prevReactions => ({
                    ...prevReactions,
                    [reaction.reaction_emoji_id]: [...(prevReactions[reaction.reaction_emoji_id] || []), reaction.reaction_added_by.user_name]
                }));

            })
        }


    }, [chatInfo, selfProfile.data?.data]);

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
                copyTextToClipboard: copyPostText
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
            dispatch(openUI({ key: 'attachmentLightbox', data: {allMedia: chatInfo.chat_attachments, media: attachment, mediaGetUrl: GetEndpointUrl.GetGroupChatMedia + '/' + grpId} }))

        }

    }

    const handleOnCLick = useCallback((e: React.MouseEvent) => {
        // Prevent navigation if clicking on interactive elements
        if ((e.target as HTMLElement).closest('button, a, .interactive')) return;
        router.push(`${app_grp_chat_path}/${grpId}/${chatInfo.chat_uuid}`);
    }, [router, grpId, chatInfo.chat_uuid]);



    return (
        <ConditionalWrap
            condition={!isMessageEditEnabled}
            wrap={(c) => (
                <div onClick={handleOnCLick}>{c}</div>
            )}>
        <div  className='flex p-4 space-x-4 select-none' {...longPressEvent} >

            <div className='h-12 w-12 flex-shrink-0' onClick={handleUserClick}>
                <ChannelMessageAvatar
                    userName={userInfoState?.userName || chatInfo.chat_from.user_name}
                    userProfileKey={userInfoState?.profileKey ?? chatInfo.chat_from.user_profile_object_key}
                />

            </div>
            <div className='w-full'>
                <div className='flex items-baseline space-x-2'>
                    <div className='font-semibold text-m' onClick={handleUserClick}>
                        {userInfoState?.userName || chatInfo.chat_from.user_name}
                    </div>
                    <div className='text-xs text-muted-foreground text'>
                        {formatTimeForPostOrComment(chatInfo.chat_created_at, true)}

                    </div>
                </div>

                    <div className='break-all' >


                        <MinimalTiptapTextInput
                            throttleDelay={300}
                            isOutputText={true}
                            className={cn("max-w-full rounded-xl h-auto ", isMessageEditEnabled ? "p-2 ml-[-4]" : "border-none")}
                            editorContentClassName={cn("overflow-auto ")}
                            output="html"
                            content={chatInfo.chat_body_text}
                            placeholder={"message"}
                            editable={isMessageEditEnabled}
                            PrimaryButtonIcon={Check}
                            buttonOnclick={()=>{
                                updateChat(updatedText)
                                setIsMessageEditEnabled(false)

                            }}
                            SecondaryButtonIcon={X}
                            secondaryButtonOnclick={()=>{
                                setIsMessageEditEnabled(false)
                            }}
                            editorClassName="focus:outline-none "
                            onChange={(content) => {
                                const s = content as string

                                setUpdatedText(s)

                            }}
                        >
                        </MinimalTiptapTextInput>
                        <div className={`${chatInfo.chat_body_text && chatInfo.chat_body_text.length > 0 ? 'mb-2' : ''}`}/>


                        {
                            (chatInfo.chat_fwd_msg_chat || chatInfo.chat_fwd_msg_post) &&

                            <MessagePreview
                                msgBy={chatInfo.chat_from || chatInfo.chat_fwd_msg_chat?.chat_from}
                                msgText={chatInfo.chat_fwd_msg_post?.post_text || chatInfo.chat_fwd_msg_chat?.chat_body_text || ''}
                                msgChannelName={chatInfo.chat_fwd_msg_post?.post_channel?.ch_name}
                                msgChannelUUID={chatInfo.chat_fwd_msg_post?.post_channel?.ch_uuid}
                                msgUUID={chatInfo.chat_fwd_msg_post?.post_uuid || chatInfo.chat_fwd_msg_chat?.chat_uuid}
                                msgCreatedAt={chatInfo.chat_fwd_msg_post?.post_created_at || chatInfo.chat_fwd_msg_chat?.chat_created_at}
                                vewFooter={true}
                            />
                        }
                    </div>


                {
                    !isMessageEditEnabled && chatInfo.chat_attachments && chatInfo.chat_attachments?.length > 0 &&
                    <MessageAttachments priority={priority} attachmentSelected={handleSelectAttachment} attachments={chatInfo.chat_attachments} mediaGetUrl={GetEndpointUrl.GetGroupChatMedia + '/' + grpId}/>
                }

                {chatInfo.chat_comments && chatInfo.chat_comment_count && <div className='mb-3' onClick={handleOnCLick}><MessageReplyCount replyCount={chatInfo.chat_comment_count} lastCommentCreatedAt={chatInfo.chat_comments[0].comment_created_at}/></div>}

                { !isMessageEditEnabled && <BottomMenu handleEmojiClick={handleEmojiClick} reactions={reactions} selectedEmojiId={userSelectedOption.emojiId}/>}



            </div>



        </div>
        </ConditionalWrap>

    )
}