
import { displayNameOf } from "@/lib/personName"
import { useLongPress } from "@/hooks/useLongPress";
import { ChannelMessageAvatar } from "@/components/channel/channelMessageAvatar";
import { ReplyLine } from "@/components/message/replyLine";
import { scrollToMessage } from "@/lib/utils/scrollToMessage";
import MinimalTiptapTextInput from "@/components/textInput/textInput";
import { cn } from "@/lib/utils/helpers/cn";
import { Check, X } from "@/lib/icons";
import { MessagePreview } from "@/components/message/MessagePreview";
import { ForwardedMessageData } from "@/types/rightPanel";
import { UserProfileDataInterface, UserProfileInterface, UserSelectedOptionInterface } from "@/types/user";
import TouchableDiv from "@/components/animation/touchRippleAnimation";
import { MessageAttachments } from "@/components/message/MessageAttachments";
import { GetEndpointUrl } from "@/services/endPoints";
import { BottomMenu } from "@/components/message/bottomMenu";
import { AttachmentMediaReq } from "@/types/attachment";
import { openUI, closeUI } from "@/store/slice/uiSlice";
import { useDispatch } from "react-redux";
import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { GroupedReaction, StandardReaction, SyncCustomReaction } from "@/types/reaction";
import { removeHtmlTags } from "@/lib/utils/removeHtmlTags";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { useCallback, useEffect, useRef, useState, memo } from "react";
import { useEditInPlace } from "@/hooks/useEditInPlace";
import { useStableCallback } from "@/hooks/useStableCallback";
import { app_user } from "@/types/paths";
import { useRouter } from "next/navigation";
import { useInternalLinkRouter } from "@/lib/utils/useInternalLinkRouter";
import { makeTaskAction } from "@/lib/task/makeTaskAction";
import { useRelayedAuthor } from "@/hooks/useRelayedAuthor";
import { RelayedAvatar } from "@/components/message/relayedAvatar";
import { RelayedPersonCard } from "@/components/message/relayedPersonCard";
import { PrincipalTag } from "@/components/ui/principalTag";
import { clockTime } from "@/lib/utils/date/clock";

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
    updateMessage: (id: string, body: string) => Promise<boolean> | boolean | void;
    deleteMessage: (id: string) => void;
    getMediaUrl: string
    /** Continues the reply above it (lib/messageGrouping): no avatar or name. */
    continued?: boolean
}

export const MobileMessage = memo(({  userInfo, grpId, docId, isAdmin, deleteMessage, chatMessageUUID, content, rawReactions, addReaction, removeReaction, updateMessage, chatUUID, channelUUID, postUUID, commentUUID, attachments, getMediaUrl, forwardedMessage, replyMessage, createdAt, continued = false}: mobileMessageProps) => {


    const dispatch = useDispatch();

    // A correction in place: a save that fails opens the box again holding
    // what was typed (hooks/useEditInPlace, F-06).
    const edit = useEditInPlace(useStableCallback((body: string) => updateMessage(commentUUID || postUUID || chatMessageUUID || '', body)))
    const isMessageEditEnabled = edit.editing
    const { open: openEdit } = edit

    // Route internal /app deep links through client navigation; off while editing.
    const handleInternalLinkClick = useInternalLinkRouter(!isMessageEditEnabled)

    const [userSelectedOption, setUserSelectedOption] = useState<UserSelectedOptionInterface>({} as UserSelectedOptionInterface)
    const [reactions, setReactions] = useState<{ [key: string]: string[] }>({});

    // A channel guest's or Slack person's message or reply is drawn as theirs (see lib/relayedAuthor).
    const relayed = useRelayedAuthor(userInfo, content)
    const authorName = relayed ? relayed.name : displayNameOf(userInfo)
    const body = relayed ? relayed.body : content

    const updatedTextRef = useRef<string>(content);
    useEffect(() => {
        if (edit.draft !== undefined) updatedTextRef.current = edit.draft
    }, [edit.draft])

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
                        openEdit()
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
                        openEdit()
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
                        openEdit()
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
                        openEdit()
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
                        openEdit()
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
                        openEdit()
                    },
                    handleEmojiClick: handleEmojiClick,

                    onAddReaction: () => addEmojiReaction('docCommentLongPress'),
                    isOwner: (selfProfile.data?.data?.user_uuid == userInfo.user_uuid),
                }
            }))
        }

    }, [postUUID, channelUUID, commentUUID, chatMessageUUID, chatUUID, grpId, docId, dispatch, addEmojiReaction, openEdit, deleteMessage, selfProfile.data?.data?.user_uuid, userInfo.user_uuid, isAdmin, handleEmojiClick, copyText, body, authorName]);

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

            {/* The phone row of a thread (design v3 chat, C07 phone): a 32px
                avatar, 10px to the text, 16px insets, and no gutter time. */}
            <div data-message-row="" data-phone-row="" className={`grid w-[100vw] select-none grid-cols-[32px_minmax(0,1fr)] gap-x-2.5 px-4 ${continued && !isMessageEditEnabled ? 'py-0.5' : 'py-2'}`} {...longPressEvent}>

                {continued && !isMessageEditEnabled ? (
                    <span aria-hidden="true" className="w-8" />
                ) : (
                <div data-row-avatar="" className='size-8 shrink-0 self-start' onClick={handleUserClick}>
                    {relayed
                        ? <RelayedAvatar name={relayed.name}/>
                        : <ChannelMessageAvatar userName={authorName} userProfileKey={userInfo.user_profile_object_key} isBot={!!userInfo.is_bot} userUUID={userInfo.user_uuid}/>}

                </div>
                )}
                <div className='w-full min-w-0'>
                    {!(continued && !isMessageEditEnabled) && (
                    <div data-name-line="" className='flex h-5 min-w-0 items-center gap-2'>
                        {relayed ? (
                            // No profile to open: the name opens a read-only card (F-42).
                            <RelayedPersonCard name={authorName} kind={relayed.kind} />
                        ) : (
                            <span className='truncate text-ui font-semibold text-ink' onClick={handleUserClick}>
                                {authorName}
                            </span>
                        )}
                        {relayed && <PrincipalTag kind={relayed.kind} />}
                        <time className='shrink-0 text-meta tabular-nums text-ink-3'>
                            {clockTime(createdAt)}
                        </time>
                    </div>
                    )}
                    {replyMessage && (
                        <ReplyLine by={replyMessage.msgBy} text={replyMessage.msgText} onJump={() => scrollToMessage(replyMessage.msgUUID)} />
                    )}
                    {/* break-words, not break-all: break-all split ordinary words mid-word at the edge. */}
                    <div className='chat-body chat-body-phone break-words' onClickCapture={handleInternalLinkClick}>


                        <MinimalTiptapTextInput
                            // Editing hands every keystroke over at once, so Save never misses the last one.
                            throttleDelay={isMessageEditEnabled ? 0 : 300}
                            isOutputText={true}
                            className={cn("w-full rounded-xl h-auto", isMessageEditEnabled ? "p-2" : "border-none")}
                            editorContentClassName="overflow-auto "
                            output="html"
                            content={edit.draft ?? body}
                            placeholder={"Edit message…"}
                            editable={isMessageEditEnabled}
                            PrimaryButtonIcon={Check}
                            buttonOnclick={() => edit.finish(updatedTextRef.current)}
                            SecondaryButtonIcon={X}
                            secondaryButtonOnclick={edit.cancel}
                            editorClassName="focus:outline-none"
                            onChange={(content) => {
                                const s = content as string
                                updatedTextRef.current = s

                            }}
                        >
                        </MinimalTiptapTextInput>
                        <div className={`${content?.length > 0 ? 'mb-2' : ''}`}/>


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


                        { !isMessageEditEnabled && <BottomMenu handleEmojiClick={handleEmojiClick} reactions={reactions} selectedEmojiId={userSelectedOption.emojiId} selfName={selfProfile.data?.data?.user_name}/>}

                    </div>
                </div>
            </div>
        </TouchableDiv>
    )
})

MobileMessage.displayName = "MobileMessage"
