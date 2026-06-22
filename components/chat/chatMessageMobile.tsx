import {ChannelMessageAvatar} from "@/components/channel/channelMessageAvatar";
import {formatTimeForPostOrComment} from "@/lib/utils/date/formatTimeForPostOrComment";
import {cn} from "@/lib/utils/helpers/cn";
import { Check, X } from "@/lib/icons";
import MinimalTiptapTextInput from "@/components/textInput/textInput";
import {useLongPress} from "@/hooks/useLongPress";
import {useDispatch} from "react-redux";
import {openUI, closeUI} from "@/store/slice/uiSlice";
import {StandardReaction, SyncCustomReaction} from "@/types/reaction";
import {MessagePreview} from "@/components/message/MessagePreview";
import {app_chat_path, app_user} from "@/types/paths";
import {usePathname, useRouter} from "next/navigation";
import {MessageAttachments} from "@/components/message/MessageAttachments";
import {GetEndpointUrl} from "@/services/endPoints";
import {BottomMenu} from "@/components/message/bottomMenu";
import {useCallback, useEffect, useRef, useState} from "react";
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
}


export const ChatMessageMobile = ({chatInfo, isAdmin, addReaction, removeReaction, removeChat, updateChat, priority}: ChatMessageProps) => {

    const dispatch = useDispatch();

    const router = useRouter();

    const copyToClipboard = useCopyToClipboard()

    const otherUserUUID = usePathname().split('/')[3]

    const[isMessageEditEnabled, setIsMessageEditEnabled] = useState(false);

    const [userSelectedOption, setUserSelectedOption] = useState<UserSelectedOptionInterface>({} as UserSelectedOptionInterface)
    const [reactions, setReactions] = useState<{ [key: string]: string[] }>({});

    const [updatedText, setUpdatedText] = useState<string>(chatInfo.chat_body_text||'');
    const updatedTextRef = useRef<string>(chatInfo.chat_body_text || '');

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

    const onLongPress = () => {
        dispatch(openUI({
            key: 'chatMessageLongPress',
            data: {
                onAddReaction: addEmojiReaction,
                chatUUID: chatInfo.chat_uuid,
                otherUserUUID: otherUserUUID,
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
            dispatch(openUI({
                key: 'attachmentLightbox',
                data: {allMedia: chatInfo.chat_attachments, media: attachment, mediaGetUrl: GetEndpointUrl.GetChatMedia + '/' + otherUserUUID, analyzeContext: { srcKey: 'chat', srcRef: otherUserUUID }}
            }))

        }

    }

    const handleOnCLick = useCallback((e: React.MouseEvent) => {
        // Prevent navigation if clicking on interactive elements
        if ((e.target as HTMLElement).closest('button, a, .interactive')) return;
        router.push(`${app_chat_path}/${otherUserUUID}/${chatInfo.chat_uuid}`);
    }, [router, otherUserUUID, chatInfo.chat_uuid]);



    return (

        <ConditionalWrap
            condition={!isMessageEditEnabled}
            wrap={(c) => (
                <div onClick={handleOnCLick}>{c}</div>
            )}>
        <div  className='flex gap-3 px-4 py-2.5 select-none active:bg-accent/50 transition-colors duration-100' {...longPressEvent} >

            <div className='h-9 w-9 mt-0.5 flex-shrink-0' onClick={handleUserClick}>
                <ChannelMessageAvatar
                    userName={userInfoState?.userName || chatInfo.chat_from.user_name}
                    userProfileKey={userInfoState?.profileKey ?? chatInfo.chat_from.user_profile_object_key}
                />

            </div>
            <div className='flex-1 min-w-0'>
                <div className='flex items-baseline gap-2'>
                    <div className='text-sm font-semibold text-foreground truncate' onClick={handleUserClick}>
                        {userInfoState.userName || chatInfo.chat_from.user_name}
                    </div>
                    <div className='text-[11px] tabular-nums text-muted-foreground shrink-0'>
                        {formatTimeForPostOrComment(chatInfo.chat_created_at, true)}

                    </div>
                </div>
                    <div className='break-words' >


                        <MinimalTiptapTextInput
                            throttleDelay={300}
                            isOutputText={!isMessageEditEnabled}
                            className={cn("max-w-full h-auto", isMessageEditEnabled && "p-2 ml-[-4]")}
                            editorContentClassName={cn("overflow-auto ")}
                            output="html"
                            content={chatInfo.chat_body_text}
                            placeholder={"Edit message..."}
                            editable={isMessageEditEnabled}
                            PrimaryButtonIcon={Check}
                            buttonOnclick={()=>{
                                updateChat(updatedTextRef.current)
                                setIsMessageEditEnabled(false)

                            }}
                            SecondaryButtonIcon={X}
                            secondaryButtonOnclick={()=>{
                                setIsMessageEditEnabled(false)
                            }}
                            editorClassName="focus:outline-none "
                            onChange={(content) => {
                                const s = content as string
                                updatedTextRef.current = s
                                setUpdatedText(s)

                            }}
                        />


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
                    <MessageAttachments priority={priority} attachmentSelected={handleSelectAttachment} attachments={chatInfo.chat_attachments} mediaGetUrl={GetEndpointUrl.GetChatMedia + '/' + otherUserUUID}/>
                }

                {chatInfo.chat_comments && (chatInfo.chat_comment_count || 0) > 0 && <div className='mb-3' onClick={handleOnCLick}><MessageReplyCount replyCount={chatInfo.chat_comment_count} lastCommentCreatedAt={chatInfo.chat_comments[0].comment_created_at} participants={chatInfo.chat_comments.map((c) => ({ uuid: c.comment_by?.user_uuid || "", name: c.comment_by?.user_name || "", profileKey: c.comment_by?.user_profile_object_key }))}/></div>}

                { !isMessageEditEnabled && <BottomMenu handleEmojiClick={handleEmojiClick} reactions={reactions} selectedEmojiId={userSelectedOption.emojiId}/>}



            </div>



        </div>
        </ConditionalWrap>

    )
}