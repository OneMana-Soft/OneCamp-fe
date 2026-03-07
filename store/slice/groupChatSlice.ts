import {createSlice} from "@reduxjs/toolkit";
import {ExtendedScrollToBottom, FilePreview, ScrollToBottom} from "@/store/slice/channelSlice";
import {AttachmentMediaReq} from "@/types/attachment";
import {ChatInfo} from "@/types/chat";
import {UserProfileDataInterface} from "@/types/user";
import {GroupedReaction} from "@/types/reaction";
import {CommentInfoInterface} from "@/types/comment";
import {PostsRes} from "@/types/post";
import { ExtendedChats } from "./chatSlice";


export interface ChatInputState {
    chatBody: string,
    filesUploaded: AttachmentMediaReq[],
    filesPreview: FilePreview[]
}

interface CreateChat {
    chatId: string
    chatText: string
    chatCreatedAt: string
    chatBy: UserProfileDataInterface
    grpId: string
    fwdPost?: PostsRes
    fwdChat?: ChatInfo
    attachments: AttachmentMediaReq[]
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

interface UpdateChats {
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

        createGroupChat: (state, action: {payload: CreateChat}) => {
            const {chatId, chatText, chatCreatedAt, grpId, chatBy, attachments, fwdChat, fwdPost} = action.payload;
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
                chat_attachments: attachments,
                chat_comment_count: 0,
                chat_fwd_msg_chat: fwdChat,
                chat_fwd_msg_post: fwdPost,
            })
        },


        updateGroupChatByChatId: (state, action: {payload: UpdateChatByChatId}) => {
            const { messageId, grpId, htmlText } = action.payload;
            state.chatMessages[grpId] = state.chatMessages[grpId].map((chat) => {
                if(messageId == chat.chat_uuid) {
                    chat.chat_body_text = htmlText
                }

                return chat
            })
        },

        removeGroupChat: (state, action: {payload: RemoveChat}) => {
            const { grpId, chatIndex } = action.payload;
            if (chatIndex > -1 && chatIndex < state.chatMessages[grpId].length) {
                state.chatMessages[grpId].splice(chatIndex, 1);
            }
        },

        removeGroupChatByChatId: (state, action: {payload: RemoveChatByChatId}) => {
            const { messageId, grpId } = action.payload;
            state.chatMessages[grpId] = state.chatMessages[grpId].filter((chat) => {
                return chat.chat_uuid !== messageId
            })
        },

        removeGroupChatReactionByChatId: (state, action: {payload: RemoveChatReactionByChatId}) => {
            const { messageId, grpId, reactionId } = action.payload;
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

            state.chatMessages[grpId].map((post)=> {
                if(post.chat_uuid == chatId) {
                    post.chat_comment_count--
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


        updateGroupChatReactionByChatId: (state, action: {payload: UpdatePostReactionByChatId}) => {
            const { messageId, grpId, emojiId, reactionId } = action.payload;

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

            state.chatMessages[grpId] = state.chatMessages[grpId].map((chat) => {
                if(chat.chat_uuid == messageId) {
                    if(!chat.chat_reactions) {
                        chat.chat_reactions = [] as GroupedReaction[]
                    }
                    chat.chat_reactions.push({
                        reaction_emoji_id: emojiId,
                        uid: reactionId,
                        reaction_added_by: addedBy,
                        reaction_added_at: new Date().toISOString(),
                        reaction_on_content_added_by: addedBy
                    })
                }

                return chat
            })

        },

        updateGroupChatReactionId: (state, action: {payload: UpdateGroupChatReactionId}) => {
            const { grpId, messageId, oldReactionId, newReactionId } = action.payload;

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

            state.chatMessages[grpId] = state.chatMessages[grpId].map((chat) => {

                if(chat.chat_uuid === messageId) {
                    chat.chat_comments = chat.chat_comments || [];
                    chat.chat_comments.push(comment);
                    chat.chat_comment_count++
                }

                return chat
            })
        },

        updateGroupChatMessageReplyDecrement: (state, action: {payload: UpdateReplyCountInterface}) => {

            const {grpId, messageId, comment} = action.payload;

            state.chatMessages[grpId] = state.chatMessages[grpId].map((chat) => {

                if(chat.chat_uuid === messageId) {
                    chat.chat_comments = chat.chat_comments || [];
                    chat.chat_comments = chat.chat_comments.filter((c) => c.comment_uuid != comment.comment_uuid)
                    chat.chat_comment_count--
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
    invalidateGroupChatMessages
} = groupChatSlice.actions

export default groupChatSlice;