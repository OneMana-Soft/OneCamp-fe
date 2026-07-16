import {createSlice} from "@reduxjs/toolkit";
import {ExtendedScrollToBottom, FilePreview, ScrollToBottom} from "@/store/slice/channelSlice";
import {AttachmentMediaReq} from "@/types/attachment";
import {ChatInfo} from "@/types/chat";
import {UserProfileDataInterface} from "@/types/user";
import {GroupedReaction} from "@/types/reaction";
import {CommentInfoInterface} from "@/types/comment";
import {PostsRes} from "@/types/post";
import { ExtendedChats, chatContentDiffers } from "./chatSlice";
import { isTombstoned, markTombstone, pruneTombstones, reconcileLatestWindow, type LatestWindowAuthority, type TombstoneMap } from "@/lib/utils/deletionTombstone";


export interface ChatInputState {
    chatBody: string,
    filesUploaded: AttachmentMediaReq[],
    filesPreview: FilePreview[]
    // Discord-style reply target: when set, the next message sent in this group
    // is an inline reply to this message (rendered as a composer pill).
    replyToUuid?: string
    replyToAuthorName?: string
    replyToText?: string
}

interface CreateChat {
    chatId: string
    chatText: string
    chatCreatedAt: string
    chatBy: UserProfileDataInterface
    grpId: string
    fwdPost?: PostsRes
    fwdChat?: ChatInfo
    replyTo?: ChatInfo
    attachments: AttachmentMediaReq[]
    addedLocally?: boolean
}

interface SetGroupChatReplyTarget {
    grpId: string
    uuid: string
    authorName: string
    text: string
}


export interface ExtendedChatInputState {
    [key: string]:  ChatInputState;
}

interface AddPreviewFiles {
    filesUploaded: FilePreview
    grpId: string
}

interface RemoveUploadedFile {
    key: string,
    grpId: string
}

interface AddUploadedFiles {
    filesUploaded: AttachmentMediaReq
    grpId: string
}

interface UpdatePreviewFiles {
    key: string,
    progress: number,
    grpId: string
}

interface UpdatePreviewFilesUUID {
    grpId: string,
    key: string,
    uuid: string
}

interface ClearDocComment {
    grpId: string
}

interface createOrUpdateCommentBody {
    grpID: string
    body: string
}

interface UpdateChatByChatId {
    messageId: string
    grpId: string
    htmlText: string
}

interface RemoveChat {
    grpId: string
    chatIndex: number
}

interface UpdateScrollToBottom {
    grpId: string
    scrollToBottom: boolean
}

interface RemoveChatByChatId {
    messageId: string
    grpId: string
}

interface RemoveChatReactionByChatId {
    messageId: string
    reactionId: string,
    grpId: string,
}

interface UpdatePostReactionByChatId {
    messageId: string
    reactionId: string,
    grpId: string,
    emojiId: string
}

interface CreateChatReactionByChatId {
    messageId: string
    reactionId: string,
    grpId: string,
    emojiId: string
    addedBy: UserProfileDataInterface
}

interface UpdateGroupChatReactionId {
    grpId: string
    messageId: string
    oldReactionId: string
    newReactionId: string
}

interface UpdateChat {
    grpId: string
    chatIndex: number
    htmlText: string
}

interface UpdateChats extends LatestWindowAuthority {
    grpId: string,
    chats: ChatInfo[]
}

interface UpdateChatCommentCount {
    chatId: string
    grpId: string
}

interface UpdateReplyCountInterface {
    grpId: string
    messageId: string
    comment: CommentInfoInterface
}

export interface LocallyCreatedGrpInfoInterface {
    haveSentFirstChat: boolean
    participants: UserProfileDataInterface[],
    grpId: string
}

interface createGroupChatLocallyInterface {
    participants: UserProfileDataInterface[],
    grpId: string
}


interface updateGroupChatLocallyInterface {
    grpId: string
}

interface ExtendedLocallyCreatedChats {
    [key: string]:  LocallyCreatedGrpInfoInterface;
}

const initialState = {
    chatInputState: {} as ExtendedChatInputState,
    chatMessages: {} as ExtendedChats,
    chatScrollToBottom: {} as ExtendedScrollToBottom,
    locallyCreatedGrpInfo: {} as ExtendedLocallyCreatedChats,
    // grpId -> chat_uuid -> deleted-at ms. Keeps a just-deleted group message
    // from being resurrected by a merge whose window predates the delete.
    deletedChats: {} as TombstoneMap,
}

export const groupChatSlice = createSlice({
    name: 'groupChat',
    initialState,
    reducers: {

        createGrpChatLocally : (state, action: {payload: createGroupChatLocallyInterface}) => {
            const {participants, grpId} = action.payload;
            state.locallyCreatedGrpInfo[grpId] = {
                haveSentFirstChat: false,
                participants,
                grpId
            }
        },

        UpdateGrpChatLocally : (state, action: {payload: updateGroupChatLocallyInterface}) => {
            const { grpId} = action.payload;
            state.locallyCreatedGrpInfo[grpId].haveSentFirstChat = true

        },

        createOrUpdateGroupChatBody: (state, action: {payload: createOrUpdateCommentBody}) => {
            const { grpID, body } = action.payload;

            if (!state.chatInputState[grpID]) {
                state.chatInputState[grpID] = { chatBody: '', filesUploaded: [] , filesPreview: [] };
            }

            state.chatInputState[grpID].chatBody = body;
        },


        addGroupChatPreviewFiles: (state, action: {payload: AddPreviewFiles}) => {
            const { filesUploaded, grpId} = action.payload;

            if(!state.chatInputState[grpId]) {
                state.chatInputState[grpId] = { chatBody: '', filesUploaded: [] , filesPreview: [] };
            }

            state.chatInputState[grpId].filesPreview.push(filesUploaded);
        },

        deleteGroupChatPreviewFiles: (state, action: {payload: RemoveUploadedFile}) => {
            const { key, grpId } = action.payload;

            if(!state.chatInputState[grpId]) {
                state.chatInputState[grpId] = { chatBody: '', filesUploaded: [] , filesPreview: [] };
            }

            state.chatInputState[grpId].filesPreview = state.chatInputState[grpId].filesPreview.filter((media) => {
                if (media.key === key) {
                    if(media.progress != 100 && typeof media.cancelSource.cancel === 'function') {
                        media.cancelSource.cancel(`Stopping file upload: ${media.fileName}`);
                    }
                    return false;
                } else {
                    return true;
                }
            });

        },

        updateGroupChatPreviewFiles: (state, action: {payload: UpdatePreviewFiles}) => {
            const { key, progress, grpId } = action.payload;
            if(!state.chatInputState[grpId]) {
                state.chatInputState[grpId] = { chatBody: '', filesUploaded: [] , filesPreview: [] };
            }
            state.chatInputState[grpId].filesPreview = state.chatInputState[grpId].filesPreview.map((item) => {
                return item.key === key ? { ...item, progress } : item;
            });

        },

        updateGroupChatPreviewFilesUUID: (state, action: {payload: UpdatePreviewFilesUUID}) => {
            const { grpId, key, uuid } = action.payload;
            if (state.chatInputState[grpId]) {
                state.chatInputState[grpId].filesPreview = state.chatInputState[grpId].filesPreview.map((item) => {
                    return item.key === key ? { ...item, uuid } : item;
                });
            }
        },


        addGroupChatUploadedFiles: (state, action: {payload: AddUploadedFiles}) => {
            const { filesUploaded, grpId } = action.payload;
            if(!state.chatInputState[grpId]) {
                state.chatInputState[grpId] = { chatBody: '', filesUploaded: [] , filesPreview: [] };
            }
            state.chatInputState[grpId].filesUploaded.push(filesUploaded);
        },

        removeGroupChatUploadedFiles: (state, action: {payload: RemoveUploadedFile}) => {
            const { key, grpId } = action.payload;
            if(!state.chatInputState[grpId]) {
                state.chatInputState[grpId] = { chatBody: '', filesUploaded: [] , filesPreview: [] };
            }
            state.chatInputState[grpId].filesUploaded = state.chatInputState[grpId].filesUploaded.filter((media) => media.attachment_obj_key !== key);
        },

        clearGroupChatInputState: (state, action :{payload: ClearDocComment}) => {
            const {grpId } = action.payload;

            state.chatInputState[grpId] = { chatBody: '', filesUploaded: [] , filesPreview: [] };

        },

        // setGroupChatReplyTarget arms the composer to reply to a message.
        setGroupChatReplyTarget: (state, action: {payload: SetGroupChatReplyTarget}) => {
            const { grpId, uuid, authorName, text } = action.payload;
            if (!state.chatInputState[grpId]) {
                state.chatInputState[grpId] = { chatBody: '', filesUploaded: [], filesPreview: [] };
            }
            state.chatInputState[grpId].replyToUuid = uuid;
            state.chatInputState[grpId].replyToAuthorName = authorName;
            state.chatInputState[grpId].replyToText = text;
        },

        // clearGroupChatReplyTarget dismisses the reply pill without clearing the draft.
        clearGroupChatReplyTarget: (state, action: {payload: { grpId: string }}) => {
            const { grpId } = action.payload;
            const s = state.chatInputState[grpId];
            if (s) {
                s.replyToUuid = undefined;
                s.replyToAuthorName = undefined;
                s.replyToText = undefined;
            }
        },

        createGroupChat: (state, action: {payload: CreateChat}) => {
            const {chatId, chatText, chatCreatedAt, grpId, chatBy, attachments, fwdChat, fwdPost, replyTo, addedLocally = false} = action.payload;
            // Ignore an out-of-order create delivered after this message's
            // delete. A later authoritative restore is allowed after TTL.
            if (chatId && isTombstoned(state.deletedChats, grpId, chatId)) return;
            if(!state.chatMessages[grpId]) {
                state.chatMessages[grpId] = [] as ChatInfo[]
            }
            if (state.chatMessages[grpId].some(c => c.chat_uuid === chatId)) return;
            state.chatMessages[grpId].push({
                chat_to: {} as UserProfileDataInterface,
                chat_from: chatBy,
                chat_created_at: chatCreatedAt,
                chat_body_text: chatText,
                chat_uuid: chatId,
                chat_added_locally: addedLocally,
                chat_attachments: attachments,
                chat_comment_count: 0,
                chat_fwd_msg_chat: fwdChat,
                chat_fwd_msg_post: fwdPost,
                chat_reply_to: replyTo,
            })
        },


        updateGroupChatByChatId: (state, action: {payload: UpdateChatByChatId}) => {
            const { messageId, grpId, htmlText } = action.payload;
            if (!state.chatMessages[grpId]) return
            state.chatMessages[grpId] = state.chatMessages[grpId].map((chat) => {
                if(messageId == chat.chat_uuid) {
                    chat.chat_body_text = htmlText
                }

                return chat
            })
        },

        removeGroupChat: (state, action: {payload: RemoveChat}) => {
            const { grpId, chatIndex } = action.payload;
            if (!state.chatMessages[grpId]) return
            if (chatIndex > -1 && chatIndex < state.chatMessages[grpId].length) {
                state.chatMessages[grpId].splice(chatIndex, 1);
            }
        },

        removeGroupChatByChatId: (state, action: {payload: RemoveChatByChatId}) => {
            const { messageId, grpId } = action.payload;
            // Tombstone first so a merge from a pre-delete window can't re-add it.
            markTombstone(state.deletedChats, grpId, messageId);
            if (!state.chatMessages[grpId]) return
            state.chatMessages[grpId] = state.chatMessages[grpId].filter((chat) => {
                return chat.chat_uuid !== messageId
            })
        },

        removeGroupChatReactionByChatId: (state, action: {payload: RemoveChatReactionByChatId}) => {
            const { messageId, grpId, reactionId } = action.payload;
            if (!state.chatMessages[grpId]) return
            state.chatMessages[grpId] = state.chatMessages[grpId].map((chat) => {

                if(chat.chat_uuid == messageId) {
                    chat.chat_reactions = chat.chat_reactions?.filter((reaction) => {
                        return reaction.uid !== reactionId
                    })
                }
                return chat
            })
        },

        decrementGroupChatCommentCountByChatID: (state, action: {payload: UpdateChatCommentCount}) => {
            const {chatId , grpId} = action.payload;
            if (!state.chatMessages[grpId]) return

            state.chatMessages[grpId].map((post)=> {
                if(post.chat_uuid == chatId) {
                    // Guard against undefined/0 counters when MQTT races the
                    // initial fetch. undefined-- yields NaN.
                    post.chat_comment_count = Math.max(0, (post.chat_comment_count || 0) - 1)
                }
                return post
            })

        },

        updateGroupChat: (state, action: {payload: UpdateChat}) => {
            const { grpId, chatIndex, htmlText } = action.payload;
            if (chatIndex > -1 && chatIndex < state.chatMessages[grpId].length) {
                state.chatMessages[grpId][chatIndex].chat_body_text = htmlText
            }

        },

        updateGroupChats: (state, action: {payload: UpdateChats}) => {
            const { grpId, chats } = action.payload;

            state.chatMessages[grpId] = [...chats];

        },

        // SYNC (window-reconcile): reconcile this group chat against a
        // freshly-fetched "latest" window after an idle gap. Within the time-
        // range the window covers the server is authoritative, so this applies
        // adds, edits, AND deletes. Messages newer than the window (optimistic
        // sends) and older paginated history are preserved. Reference-stable
        // when nothing changed. (Mirrors chatSlice.mergeChats.)
        mergeGroupChats: (state, action: {payload: UpdateChats}) => {
            const { grpId, chats, authoritativeThrough } = action.payload;
            if (!chats) return;

            pruneTombstones(state.deletedChats, grpId);
            const existing = state.chatMessages[grpId] || [];
            const next = reconcileLatestWindow({
                existing,
                incoming: chats,
                authoritativeThrough,
                getId: (chat) => chat.chat_uuid,
                getCreatedAt: (chat) => chat.chat_created_at,
                contentDiffers: chatContentDiffers,
                isOptimistic: (chat) => !!chat.chat_added_locally,
                shouldAcceptIncoming: (chat) => !chat.chat_uuid || !isTombstoned(state.deletedChats, grpId, chat.chat_uuid),
                mergeMatched: (current, server) => ({ ...current, ...server, chat_added_locally: false }),
                sort: (a, b) => Date.parse(a.chat_created_at) - Date.parse(b.chat_created_at),
            });

            if (next !== existing) state.chatMessages[grpId] = next;
        },


        updateGroupChatReactionByChatId: (state, action: {payload: UpdatePostReactionByChatId}) => {
            const { messageId, grpId, emojiId, reactionId } = action.payload;
            if (!state.chatMessages[grpId]) return

            state.chatMessages[grpId] = state.chatMessages[grpId].map((chat) => {
                if(chat.chat_uuid == messageId) {
                    chat.chat_reactions = chat.chat_reactions?.map((reaction) => {
                        if (reaction.uid == reactionId) {
                            reaction.reaction_emoji_id = emojiId
                        }
                        return reaction
                    })
                }

                return chat
            })

        },

        createGroupChatReactionChatId: (state, action: {payload: CreateChatReactionByChatId}) => {
            const { messageId, grpId, emojiId, reactionId , addedBy} = action.payload;
            if (!state.chatMessages[grpId]) return

            state.chatMessages[grpId] = state.chatMessages[grpId].map((chat) => {
                if(chat.chat_uuid == messageId) {
                    if(!chat.chat_reactions) {
                        chat.chat_reactions = [] as GroupedReaction[]
                    }
                    // Idempotent: a user can only hold one reaction per emoji
                    // on a given message. Match an existing (user, emoji)
                    // entry and upgrade its uid (handles temp -> real swap)
                    // instead of pushing a duplicate.
                    const existingIdx = chat.chat_reactions.findIndex(
                        (r) =>
                            r.reaction_emoji_id === emojiId &&
                            r.reaction_added_by?.user_uuid === addedBy?.user_uuid,
                    )
                    if (existingIdx > -1) {
                        if (chat.chat_reactions[existingIdx].uid !== reactionId) {
                            chat.chat_reactions[existingIdx].uid = reactionId
                        }
                    } else {
                        chat.chat_reactions.push({
                            reaction_emoji_id: emojiId,
                            uid: reactionId,
                            reaction_added_by: addedBy,
                            reaction_added_at: new Date().toISOString(),
                            reaction_on_content_added_by: addedBy
                        })
                    }
                }

                return chat
            })

        },

        updateGroupChatReactionId: (state, action: {payload: UpdateGroupChatReactionId}) => {
            const { grpId, messageId, oldReactionId, newReactionId } = action.payload;
            if (!state.chatMessages[grpId]) return

            state.chatMessages[grpId] = state.chatMessages[grpId].map((chat) => {
                if(chat.chat_uuid == messageId) {
                    chat.chat_reactions = chat.chat_reactions?.map((reaction) => {
                        if (reaction.uid == oldReactionId) {
                            reaction.uid = newReactionId
                        }
                        return reaction
                    })
                }

                return chat
            })
        },

        updateGroupChatScrollToBottom: (state, action: {payload: UpdateScrollToBottom}) => {

            const {grpId, scrollToBottom} = action.payload;

            if(!state.chatScrollToBottom[grpId]) {
                state.chatScrollToBottom[grpId] = {} as ScrollToBottom
            }

            state.chatScrollToBottom[grpId].shouldScrollToBottom = scrollToBottom

        },



        updateGroupChatMessageReplyIncrement: (state, action: {payload: UpdateReplyCountInterface}) => {

            const {grpId, messageId, comment} = action.payload;
            if (!state.chatMessages[grpId]) return

            state.chatMessages[grpId] = state.chatMessages[grpId].map((chat) => {

                if(chat.chat_uuid === messageId) {
                    chat.chat_comments = chat.chat_comments || [];
                    // Dedup by comment_uuid so an MQTT echo (same user, second
                    // device) doesn't double-push and double-count the reply.
                    const alreadyTracked = chat.chat_comments.some(
                        (c) => c.comment_uuid === comment.comment_uuid
                    );
                    if (!alreadyTracked) {
                        chat.chat_comments.push(comment);
                        chat.chat_comment_count = (chat.chat_comment_count || 0) + 1
                    }
                }

                return chat
            })
        },

        updateGroupChatMessageReplyDecrement: (state, action: {payload: UpdateReplyCountInterface}) => {

            const {grpId, messageId, comment} = action.payload;
            if (!state.chatMessages[grpId]) return

            state.chatMessages[grpId] = state.chatMessages[grpId].map((chat) => {

                if(chat.chat_uuid === messageId) {
                    chat.chat_comments = chat.chat_comments || [];
                    // Only decrement when the comment was actually tracked.
                    const wasTracked = chat.chat_comments.some(
                        (c) => c.comment_uuid === comment.comment_uuid
                    );
                    if (wasTracked) {
                        chat.chat_comments = chat.chat_comments.filter((c) => c.comment_uuid != comment.comment_uuid)
                        chat.chat_comment_count = Math.max(0, (chat.chat_comment_count || 0) - 1)
                    }
                }

                return chat
            })
        },

        // SYNC: Clear all loaded group chat messages to force API refetch after stale reconnection
        invalidateGroupChatMessages: (state) => {
            state.chatMessages = {} as ExtendedChats
        }

    }
});

export const {
    createOrUpdateGroupChatBody,
    addGroupChatPreviewFiles,
    deleteGroupChatPreviewFiles,
    updateGroupChatPreviewFiles,
    addGroupChatUploadedFiles,
    removeGroupChatUploadedFiles,
    clearGroupChatInputState,
    updateGroupChatByChatId,
    removeGroupChat,
    updateGroupChat,
    updateGroupChats,
    removeGroupChatByChatId,
    createGroupChat,
    setGroupChatReplyTarget,
    clearGroupChatReplyTarget,
    updateGroupChatPreviewFilesUUID,
    removeGroupChatReactionByChatId,
    decrementGroupChatCommentCountByChatID,
    updateGroupChatReactionByChatId,
    createGroupChatReactionChatId,
    updateGroupChatScrollToBottom,
    updateGroupChatMessageReplyIncrement,
    updateGroupChatMessageReplyDecrement,
    createGrpChatLocally,UpdateGrpChatLocally,
    updateGroupChatReactionId,
    invalidateGroupChatMessages,
    mergeGroupChats
} = groupChatSlice.actions

export default groupChatSlice;