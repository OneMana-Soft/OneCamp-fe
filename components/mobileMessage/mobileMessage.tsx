
import { displayNameOf } from "@/lib/personName"
import {useLongPress} from "@/hooks/useLongPress";
import {ChannelMessageAvatar} from "@/components/channel/channelMessageAvatar";
import {formatTimeForPostOrComment} from "@/lib/utils/date/formatTimeForPostOrComment";
import MinimalTiptapTextInput from "@/components/textInput/textInput";
import {cn} from "@/lib/utils/helpers/cn";
import { Check, X } from "@/lib/icons";
import {MessagePreview} from "@/components/message/MessagePreview";
import {ForwardedMessageData} from "@/types/rightPanel";
import {UserProfileDataInterface, UserProfileInterface, UserSelectedOptionInterface} from "@/types/user";
import TouchableDiv from "@/components/animation/touchRippleAnimation";
import {MessageAttachments} from "@/components/message/MessageAttachments";
import {GetEndpointUrl} from "@/services/endPoints";
import {BottomMenu} from "@/components/message/bottomMenu";
import {AttachmentMediaReq} from "@/types/attachment";
import {openUI, closeUI} from "@/store/slice/uiSlice";
import {useDispatch} from "react-redux";
import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {GroupedReaction, StandardReaction, SyncCustomReaction} from "@/types/reaction";
import {removeHtmlTags} from "@/lib/utils/removeHtmlTags";
import {useCopyToClipboard} from "@/hooks/useCopyToClipboard";
import { useCallback, useEffect, useRef, useState, memo } from "react";
import {app_user} from "@/types/paths";
import {useRouter} from "next/navigation";
import {useInternalLinkRouter} from "@/lib/utils/useInternalLinkRouter";
import { makeTaskAction } from "@/lib/task/makeTaskAction";
import { useRelayedAuthor } from "@/hooks/useRelayedAuthor";
import { RelayedAvatar } from "@/components/message/relayedAvatar";
import { PrincipalTag } from "@/components/ui/principalTag";

interface mobileMessageProps {
    userInfo: UserProfileDataInterface
    createdAt: string
    content: string
    forwardedMessage?: ForwardedMessageData
    replyMessage?: ForwardedMessageData
    channelUUID?: string
    commentUUID?: string
    postUUID?: string
    chatUUID?: string
    grpId?: string
    docId?: string
    chatMessageUUID?: string
    rawReactions?: GroupedReaction[]
    removeReaction: (reactionId: string) => void
    attachments?: AttachmentMediaReq[]
    addReaction: (emojiId:string, reactionId: string) => void
    isAdmin?: boolean;
    updateMessage: (id: string, body: string) => void;
    deleteMessage: (id: string) => void;
    getMediaUrl: string
}

export const MobileMessage = memo(({  userInfo, grpId, docId, isAdmin, deleteMessage, chatMessageUUID, content, rawReactions, addReaction, removeReaction, updateMessage, chatUUID, channelUUID, postUUID, commentUUID, attachments, getMediaUrl, forwardedMessage, replyMessage, createdAt}: mobileMessageProps) => {


    const dispatch = useDispatch();

    const[isMessageEditEnabled, setIsMessageEditEnabled] = useState(false);

    // Route internal /app deep links through client navigation; off while editing.
    const handleInternalLinkClick = useInternalLinkRouter(!isMessageEditEnabled)

    const [userSelectedOption, setUserSelectedOption] = useState<UserSelectedOptionInterface>({} as UserSelectedOptionInterface)
    const [reactions, setReactions] = useState<{ [key: string]: string[] }>({});

    // A channel guest's or Slack person's message or reply is drawn as theirs (see lib/relayedAuthor).
    const relayed = useRelayedAuthor(userInfo, content)
    const authorName = relayed ? relayed.name : displayNameOf(userInfo)
    const body = relayed ? relayed.body : content

    const [updatedText, setUpdatedText] = useState<string>(content);
    const updatedTextRef = useRef<string>(content);

    const router = useRouter()

    const copyToClipboard = useCopyToClipboard()

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    useEffect(() => {
        setUserSelectedOption({} as UserSelectedOptionInterface)
        setReactions({})
        if (selfProfile.data?.data && rawReactions) {
            rawReactions.forEach((reaction) => {
                if (reaction.reaction_added_by.user_uuid == selfProfile.data?.data.user_uuid) {
                    setUserSelectedOption({
                        reactionId: reaction.uid,
                        emojiId: reaction.reaction_emoji_id
                    })
                }
                setReactions(prevReactions => ({
                    ...prevReactions,
                    [reaction.reaction_emoji_id]: [...(prevReactions[reaction.reaction_emoji_id] || []), displayNameOf(reaction.reaction_added_by)]
                }));

            })
        }


    }, [rawReactions, selfProfile.data?.data]);

    const handleEmojiClick = useCallback((emojiId: string) => {
        if(userSelectedOption.emojiId == emojiId) {
            removeReaction(userSelectedOption.reactionId)
            return
        }

        addReaction(emojiId, userSelectedOption.reactionId)
    }, [userSelectedOption.emojiId, userSelectedOption.reactionId, removeReaction, addReaction]);

    const addEmojiReaction = useCallback((drawerToClose?: string) => {
        if (drawerToClose) {
            dispatch(closeUI(drawerToClose as any))
        }

        dispatch(openUI({
            key: 'reactionPickerDrawer',
            data: {
                onReactionSelect(reaction: StandardReaction | SyncCustomReaction): void {
                    handleEmojiClick(reaction.id)
                },
                showCustomReactions: false
            }
        }))
    }, [dispatch, handleEmojiClick]);

    const copyText = useCallback(() => {
        const t = removeHtmlTags(body)

        copyToClipboard.copy(t, 'copied body text')
    }, [body, copyToClipboard]);

    const handleLongPressPostComment = useCallback(() => {
        if(postUUID && channelUUID && !commentUUID) {
            dispatch(openUI({
                key: 'postMessageLongPress',
                data: {
                    onAddReaction: () => addEmojiReaction('postMessageLongPress'),
                    postUUID: postUUID,
                    channelUUID: channelUUID,
                    editMessage: () => {
                        setIsMessageEditEnabled(true)
                    },
                    deleteMessage: () => {
                        deleteMessage(postUUID)
                    },
                    isOwner: (selfProfile.data?.data?.user_uuid == userInfo.user_uuid),
                    isAdmin: isAdmin,
                    handleEmojiClick: handleEmojiClick,
                    copyTextToClipboard: copyText,
                    makeTask: () => {
                        const action = makeTaskAction({ html: body, authorName, channelUUID, postUUID }, window.location.origin)
                        if (action) dispatch(action)
                    },
                }
            }))
        }

        else if(postUUID && commentUUID) {
            dispatch(openUI({
                key: 'postCommentLongPress',
                data: {
                    copyTextToClipboard: copyText,
                    deleteMessage: () => {
                        deleteMessage(commentUUID)
                    },
                    editMessage: () => {
                        setIsMessageEditEnabled(true)
                    },
                    handleEmojiClick: handleEmojiClick,
                    onAddReaction: () => addEmojiReaction('postCommentLongPress'),
                    isOwner: (selfProfile.data?.data?.user_uuid == userInfo.user_uuid),
                    isAdmin: isAdmin
                }
            }))

        }

        else if(chatMessageUUID && chatUUID && !commentUUID) {
            dispatch(openUI({
                key: 'dmChatMessageLongPress',
                data: {
                    copyTextToClipboard: copyText,
                    deleteMessage: () => {
                        deleteMessage(chatMessageUUID)
                    },
                    editMessage: () => {
                        setIsMessageEditEnabled(true)
                    },
                    handleEmojiClick: handleEmojiClick,
                    chatUUID: chatUUID,
                    chatMessageUUID: chatMessageUUID,
                    makeTask: () => {
                        const action = makeTaskAction({ html: content, authorName: displayNameOf(userInfo), chatUUID, chatMessageID: chatMessageUUID }, window.location.origin)
                        if (action) dispatch(action)
                    },
                    onAddReaction: () => addEmojiReaction('dmChatMessageLongPress'),
                    isOwner: (selfProfile.data?.data?.user_uuid == userInfo.user_uuid),
                    isAdmin: isAdmin
                }
            }))
        }

        else if (commentUUID && chatMessageUUID) {
            dispatch(openUI({
                key: 'dmChatCommentLongPress',
                data: {
                    copyTextToClipboard: copyText,
                    deleteMessage: () => {
                        deleteMessage(commentUUID)
                    },
                    editMessage: () => {
                        setIsMessageEditEnabled(true)
                    },
                    handleEmojiClick: handleEmojiClick,

                    onAddReaction: () => addEmojiReaction('dmChatCommentLongPress'),
                    isOwner: (selfProfile.data?.data?.user_uuid == userInfo.user_uuid),
                    isAdmin: isAdmin
                }
            }))
        }

        else if(chatMessageUUID && grpId && !commentUUID) {
            dispatch(openUI({
                key: 'dmGroupChatMessageLongPress',
                data: {
                    copyTextToClipboard: copyText,
                    deleteMessage: () => {
                        deleteMessage(chatMessageUUID)
                    },
                    editMessage: () => {
                        setIsMessageEditEnabled(true)
                    },
                    handleEmojiClick: handleEmojiClick,
                    grpId: grpId,
                    chatMessageUUID: chatMessageUUID,
                    makeTask: () => {
                        const action = makeTaskAction({ html: content, authorName: displayNameOf(userInfo), groupUUID: grpId, chatMessageID: chatMessageUUID }, window.location.origin)
                        if (action) dispatch(action)
                    },
                    onAddReaction: () => addEmojiReaction('dmGroupChatMessageLongPress'),
                    isOwner: (selfProfile.data?.data?.user_uuid == userInfo.user_uuid),
                    isAdmin: isAdmin
                }
            }))
        }

        else if(docId && commentUUID) {
            dispatch(openUI({
                key: 'docCommentLongPress',
                data: {
                    copyTextToClipboard: copyText,
                    deleteMessage: () => {
                        deleteMessage(commentUUID)
                    },
                    editMessage: () => {
                        setIsMessageEditEnabled(true)
                    },
                    handleEmojiClick: handleEmojiClick,

                    onAddReaction: () => addEmojiReaction('docCommentLongPress'),
                    isOwner: (selfProfile.data?.data?.user_uuid == userInfo.user_uuid),
                }
            }))
        }

    }, [postUUID, channelUUID, commentUUID, chatMessageUUID, chatUUID, grpId, docId, dispatch, addEmojiReaction, setIsMessageEditEnabled, deleteMessage, selfProfile.data?.data?.user_uuid, userInfo.user_uuid, isAdmin, handleEmojiClick, copyText, body, authorName]);

    const longPressEvent = useLongPress(handleLongPressPostComment, {
        threshold: 500, // Reduced from 800ms to 500ms for quicker long press
        onLongPressStart: () =>{

        }
    })

    const handleUserClick = useCallback((e: React.MouseEvent)=>{
        e.preventDefault()
        e.stopPropagation()
        // A guest or Slack person has no profile: the relaying bot's would stand in.
        if (relayed) return
        router.push(`${app_user}/${userInfo.user_uuid}`);

    },[userInfo.user_uuid, relayed])


    const handleSelectAttachment = useCallback((attachment: AttachmentMediaReq) => {

        if(attachments) {
            dispatch(openUI({ key: 'attachmentLightbox', data: {allMedia: attachments, media: attachment, mediaGetUrl: getMediaUrl} }))

        }

    }, [attachments, dispatch, getMediaUrl]);



    return (

        <TouchableDiv
            rippleBrightness={0.8}
            rippleDuration={800}

        >

            <div  className='flex p-4 space-x-4 w-[100vw] pb-0 select-none' {...longPressEvent}


            >

                <div className='h-12 w-12 flex-shrink-0' onClick={handleUserClick}>
                    {relayed
                        ? <RelayedAvatar name={relayed.name}/>
                        : <ChannelMessageAvatar userName={authorName} userProfileKey={userInfo.user_profile_object_key} isBot={!!userInfo.is_bot} userUUID={userInfo.user_uuid}/>}

                </div>
                <div className='w-full'>
                    <div className='flex items-baseline space-x-2'>
                        <div className='font-semibold text-m' onClick={handleUserClick}>
                            {authorName}
                        </div>
                        {relayed && <PrincipalTag kind={relayed.kind} />}
                        <div className='text-xs text-muted-foreground text'>
                            {formatTimeForPostOrComment(createdAt)}

                        </div>
                    </div>
                    {replyMessage && (
                        <div className="mb-1 border-l-2 border-primary/40 pl-2">
                            <MessagePreview
                                msgBy={replyMessage.msgBy}
                                msgText={replyMessage.msgText}
                                msgUUID={replyMessage.msgUUID}
                                msgCreatedAt={replyMessage.msgCreatedAt}
                                vewFooter={false}
                            />
                        </div>
                    )}
                    <div className='break-all' onClickCapture={handleInternalLinkClick}>


                        <MinimalTiptapTextInput
                            throttleDelay={300}
                            isOutputText={true}
                            className={cn("w-full rounded-xl h-auto", isMessageEditEnabled ? "p-2" : "border-none")}
                            editorContentClassName="overflow-auto "
                            output="html"
                            content={body}
                            placeholder={"Edit message…"}
                            editable={isMessageEditEnabled}
                            PrimaryButtonIcon={Check}
                            buttonOnclick={()=>{
                                updateMessage( commentUUID || postUUID || chatMessageUUID || '', updatedTextRef.current)
                                setIsMessageEditEnabled(false)

                            }}
                            SecondaryButtonIcon={X}
                            secondaryButtonOnclick={()=>{
                                setIsMessageEditEnabled(false)
                            }}
                            editorClassName="focus:outline-none"
                            onChange={(content) => {
                                const s = content as string
                                updatedTextRef.current = s
                                setUpdatedText(s)

                            }}
                        >
                        </MinimalTiptapTextInput>
                        <div className={`${content?.length > 0 ? 'mb-4' : ''}`}/>


                        {forwardedMessage && (
                            <MessagePreview
                                msgBy={forwardedMessage.msgBy}
                                msgText={forwardedMessage.msgText}
                                msgChannelName={forwardedMessage.msgChannelName}
                                msgChannelUUID={forwardedMessage.msgChannelUUID}
                                msgUUID={forwardedMessage.msgUUID}
                                msgCreatedAt={forwardedMessage.msgCreatedAt}
                                vewFooter={true}
                            />
                        )}

                        {
                            !isMessageEditEnabled && attachments && attachments?.length > 0 &&
                            <MessageAttachments attachmentSelected={handleSelectAttachment} attachments={attachments} mediaGetUrl={getMediaUrl}/>
                        }


                        { !isMessageEditEnabled && <BottomMenu handleEmojiClick={handleEmojiClick} reactions={reactions} selectedEmojiId={userSelectedOption.emojiId}/>}

                    </div>
                </div>
            </div>
        </TouchableDiv>
    )
})

MobileMessage.displayName = "MobileMessage"
