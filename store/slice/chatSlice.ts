import {createSlice} from "@reduxjs/toolkit";
import {ExtendedCallStatus, ExtendedScrollToBottom, FilePreview, ScrollToBottom} from "@/store/slice/channelSlice";
import {AttachmentMediaReq} from "@/types/attachment";
import {ChatInfo} from "@/types/chat";
import {UserDMInterface, UserProfileDataInterface} from "@/types/user";
import {GroupedReaction} from "@/types/reaction";
import {CommentInfoInterface} from "@/types/comment";
import {PostsRes} from "@/types/post";


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
    chatTo: UserProfileDataInterface
    dmId: string
    fwdPost?: PostsRes
    fwdChat?: ChatInfo
    attachments: AttachmentMediaReq[]
}


export interface ExtendedChatInputState {
    [key: string]:  ChatInputState;
}

interface AddPreviewFiles {
    filesUploaded: FilePreview
    chatUUID: string
}

interface RemoveUploadedFile {
    key: string,
    chatUUID: string
}

interface AddUploadedFiles {
    filesUploaded: AttachmentMediaReq
    chatUUID: string
}

interface UpdatePreviewFiles {
    key: string,
    progress: number,
    chatUUID: string
}

interface UpdatePreviewFilesUUID {
    chatUUID: string,
    key: string,
    uuid: string
}

interface ClearDocComment {
    chatUUID: string
}

interface createOrUpdateCommentBody {
    chatUUID: string
    body: string
}

interface UpdateChatByChatId {
    messageId: string
    chatId: string
    htmlText: string
}

interface RemoveChat {
    dmId: string
    chatIndex: number
}

interface UpdateScrollToBottom {
    chatId: string
    scrollToBottom: boolean
}

interface RemoveChatByChatId {
    messageId: string
    chatId: string
}

interface RemoveChatReactionByChatId {
    messageId: string
    reactionId: string,
    chatId: string,
}

interface UpdatePostReactionByChatId {
    messageId: string
    reactionId: string,
    chatId: string,
    emojiId: string
}

interface CreateChatReactionByChatId {
    messageId: string
    reactionId: string,
    chatId: string,
    emojiId: string
    addedBy: UserProfileDataInterface
}

interface UpdateChatReactionId {
    chatId: string
    messageId: string
    oldReactionId: string
    newReactionId: string
}

interface UpdateChannelCallStatus {
    channelId: string
    callStatus: boolean
}

interface UpdateChat {
    dmId: string
    chatIndex: number
    htmlText: string
}

interface UpdateChats {
    chatId: string,
    chats: ChatInfo[]
}

interface UpdateChatCommentCount {
    chatId: string
    dmId: string
}

interface UpdateReplyCountInterface {
    chatId: string
    messageId: string
    comment: CommentInfoInterface
}

interface UserChatListInput {
    userDmList: UserDMInterface[]
}

interface UpdateChatCallStatus {
    grpId: string
    callStatus: boolean
}

interface AddChatToChatListInput {
    grpId: string
    name: string
    msg: string
    msgTime: string
    attachments: AttachmentMediaReq[]
}

interface GroupIdInput {
    grpId: string
}

interface AddOrUpdateUserChatListInput {
    usersDm: UserDMInterface
}

export interface  ExtendedChats {
    [key: string]:  ChatInfo[];
}

export interface ChatScrollPosition {
    [key: string]: { key: string, offset: number };
}

const initialState = {
    chatInputState: {} as ExtendedChatInputState,
    chatMessages: {} as ExtendedChats,
    chatScrollToBottom: {} as ExtendedScrollToBottom,
    chatScrollPositions: {} as ChatScrollPosition, // Stores the UUID and relative offset of the top visible message
    latestChatList: [] as UserDMInterface[],
    chatCallStatus: {} as ExtendedCallStatus

}

export const chatSlice = createSlice({
    name: 'chat',
    initialState,
    reducers: {
        // ... existing reducers
        updateChatScrollPosition: (state, action: {payload: {chatId: string, key: string, offset: number}}) => {
            const {chatId, key, offset} = action.payload;
            state.chatScrollPositions[chatId] = { key, offset };
        },

        createOrUpdateChatBody: (state, action: {payload: createOrUpdateCommentBody}) => {
// ... rest of file

            const { chatUUID, body } = action.payload;

            if (!state.chatInputState[chatUUID]) {
                state.chatInputState[chatUUID] = { chatBody: '', filesUploaded: [] , filesPreview: [] };
            }

            state.chatInputState[chatUUID].chatBody = body;
        },


        addChatPreviewFiles: (state, action: {payload: AddPreviewFiles}) => {
            const { filesUploaded, chatUUID} = action.payload;

            if(!state.chatInputState[chatUUID]) {
                state.chatInputState[chatUUID] = { chatBody: '', filesUploaded: [] , filesPreview: [] };
            }

            state.chatInputState[chatUUID].filesPreview.push(filesUploaded);
        },

        deleteChatPreviewFiles: (state, action: {payload: RemoveUploadedFile}) => {
            const { key, chatUUID } = action.payload;

            if(!state.chatInputState[chatUUID]) {
                state.chatInputState[chatUUID] = { chatBody: '', filesUploaded: [] , filesPreview: [] };
            }

            state.chatInputState[chatUUID].filesPreview = state.chatInputState[chatUUID].filesPreview.filter((media) => {
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

        updateChatPreviewFiles: (state, action: {payload: UpdatePreviewFiles}) => {
            const { key, progress, chatUUID } = action.payload;
            if(!state.chatInputState[chatUUID]) {
                state.chatInputState[chatUUID] = { chatBody: '', filesUploaded: [] , filesPreview: [] };
            }
            state.chatInputState[chatUUID].filesPreview = state.chatInputState[chatUUID].filesPreview.map((item) => {
                return item.key === key ? { ...item, progress } : item;
            });

        },

        updateChatPreviewFilesUUID: (state, action: {payload: UpdatePreviewFilesUUID}) => {
            const { chatUUID, key, uuid } = action.payload;
            if (state.chatInputState[chatUUID]) {
                state.chatInputState[chatUUID].filesPreview = state.chatInputState[chatUUID].filesPreview.map((item) => {
                    return item.key === key ? { ...item, uuid } : item;
                });
            }
        },


        addChatUploadedFiles: (state, action: {payload: AddUploadedFiles}) => {
            const { filesUploaded, chatUUID } = action.payload;
            if(!state.chatInputState[chatUUID]) {
                state.chatInputState[chatUUID] = { chatBody: '', filesUploaded: [] , filesPreview: [] };
            }
            state.chatInputState[chatUUID].filesUploaded.push(filesUploaded);
        },

        removeChatUploadedFiles: (state, action: {payload: RemoveUploadedFile}) => {
            const { key, chatUUID } = action.payload;
            if(!state.chatInputState[chatUUID]) {
                state.chatInputState[chatUUID] = { chatBody: '', filesUploaded: [] , filesPreview: [] };
            }
            state.chatInputState[chatUUID].filesUploaded = state.chatInputState[chatUUID].filesUploaded.filter((media) => media.attachment_obj_key !== key);
        },

        clearChatInputState: (state, action :{payload: ClearDocComment}) => {
            const {chatUUID } = action.payload;

            state.chatInputState[chatUUID] = { chatBody: '', filesUploaded: [] , filesPreview: [] };

        },

        createChat: (state, action: {payload: CreateChat}) => {
            const {chatId, chatText, chatCreatedAt, dmId, chatBy, chatTo, attachments, fwdChat, fwdPost} = action.payload;
            if(!state.chatMessages[dmId]) {
                state.chatMessages[dmId] = [] as ChatInfo[]
            }
            if (state.chatMessages[dmId].some(c => c.chat_uuid === chatId)) return;
            state.chatMessages[dmId].push({
                chat_to: chatTo,
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


        updateChatByChatId: (state, action: {payload: UpdateChatByChatId}) => {
            const { messageId, chatId, htmlText } = action.payload;
            state.chatMessages[chatId] = state.chatMessages[chatId].map((chat) => {
                if(messageId == chat.chat_uuid) {
                    chat.chat_body_text = htmlText
                }

                return chat
            })
        },

        removeChat: (state, action: {payload: RemoveChat}) => {
            const { dmId, chatIndex } = action.payload;
            if (chatIndex > -1 && chatIndex < state.chatMessages[dmId].length) {
                state.chatMessages[dmId].splice(chatIndex, 1);
            }
        },

        removeChatByChatId: (state, action: {payload: RemoveChatByChatId}) => {
            const { messageId, chatId } = action.payload;
            state.chatMessages[chatId] = state.chatMessages[chatId].filter((chat) => {
                return chat.chat_uuid !== messageId
            })
        },

        removeChatReactionByChatId: (state, action: {payload: RemoveChatReactionByChatId}) => {
            const { messageId, chatId, reactionId } = action.payload;
            state.chatMessages[chatId] = state.chatMessages[chatId].map((chat) => {

                if(chat.chat_uuid == messageId) {
                    chat.chat_reactions = chat.chat_reactions?.filter((reaction) => {
                        return reaction.uid !== reactionId
                    })
                }
                return chat
            })
        },

        decrementChatCommentCountByChatID: (state, action: {payload: UpdateChatCommentCount}) => {
            const {chatId , dmId} = action.payload;

            state.chatMessages[dmId].map((post)=> {
                if(post.chat_uuid == chatId) {
                    post.chat_comment_count--
                }
                return post
            })

        },

        updateChat: (state, action: {payload: UpdateChat}) => {
            const { dmId, chatIndex, htmlText } = action.payload;
            if (chatIndex > -1 && chatIndex < state.chatMessages[dmId].length) {
                state.chatMessages[dmId][chatIndex].chat_body_text = htmlText
            }

        },

        updateChats: (state, action: {payload: UpdateChats}) => {
            const { chatId, chats } = action.payload;

            state.chatMessages[chatId] = [...chats];

        },


        updateChatReactionByChatId: (state, action: {payload: UpdatePostReactionByChatId}) => {
            const { messageId, chatId, emojiId, reactionId } = action.payload;

            state.chatMessages[chatId] = state.chatMessages[chatId].map((chat) => {
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

        createChatReactionChatId: (state, action: {payload: CreateChatReactionByChatId}) => {
            const { messageId, chatId, emojiId, reactionId , addedBy} = action.payload;

            state.chatMessages[chatId] = state.chatMessages[chatId].map((chat) => {
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

        updateChatReactionId: (state, action: {payload: UpdateChatReactionId}) => {
            const { chatId, messageId, oldReactionId, newReactionId } = action.payload;

            state.chatMessages[chatId] = state.chatMessages[chatId].map((chat) => {
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

        updateChatScrollToBottom: (state, action: {payload: UpdateScrollToBottom}) => {

            const {chatId, scrollToBottom} = action.payload;

            if(!state.chatScrollToBottom[chatId]) {
                state.chatScrollToBottom[chatId] = {} as ScrollToBottom
            }

            state.chatScrollToBottom[chatId].shouldScrollToBottom = scrollToBottom

        },

        CreateUserChatList: (state, action: {payload: UserChatListInput}) => {

            const {userDmList} = action.payload;

            state.latestChatList = userDmList
        },


        UpdateMessageInChatList: (state, action: {payload: AddChatToChatListInput}) => {
            const {grpId, name, msgTime, attachments, msg} = action.payload;
            let targetChat: UserDMInterface | undefined;

            state.latestChatList = state.latestChatList.filter((d) => {
                if(d.dm_grouping_id == grpId) {
                    targetChat = d;
                    return false; // Remove from current position
                }
                return true;
            });

            if (targetChat) {
                if(!targetChat.dm_chats) {
                    targetChat.dm_chats = [{} as ChatInfo];
                }
                targetChat.dm_chats[0].chat_created_at = msgTime;
                targetChat.dm_chats[0].chat_from = {user_name: name, user_uuid: '', user_profile_object_key: ''};
                targetChat.dm_chats[0].chat_attachments = attachments;
                targetChat.dm_chats[0].chat_body_text = msg;

                // Move to top
                state.latestChatList.unshift(targetChat);
            }
        },

        UpdateUnreadCountToZero : (state, action:{payload: GroupIdInput}) => {

            const{grpId} = action.payload;

            state.latestChatList = state.latestChatList.map((d) => {

                if(d.dm_grouping_id == grpId) {

                    d.dm_unread = 0
                }

                return d

            })

        },

        IncrementUnreadCount :  (state, action:{payload: GroupIdInput}) => {

            const{grpId} = action.payload;

            state.latestChatList = state.latestChatList.map((d) => {

                if(d.dm_grouping_id == grpId) {

                    d.dm_unread++
                }

                return d

            })

        },


        AddUserInChatList: (state, action: {payload: AddOrUpdateUserChatListInput}) => {
            const {usersDm} = action.payload;

            let foundUser = false

            state.latestChatList.forEach((u) => {
                if(u.dm_grouping_id == usersDm.dm_grouping_id) {
                    foundUser = true
                    return
                }

            })


            if(!foundUser) {
                state.latestChatList.push(usersDm)
            }

        },


        updateChatMessageReplyIncrement: (state, action: {payload: UpdateReplyCountInterface}) => {

            const {chatId, messageId, comment} = action.payload;

            state.chatMessages[chatId] = state.chatMessages[chatId].map((chat) => {

                if(chat.chat_uuid === messageId) {
                    chat.chat_comments = chat.chat_comments || [];
                    chat.chat_comments.push(comment);
                    chat.chat_comment_count++
                }

                return chat
            })
        },

        updateChatMessageReplyDecrement: (state, action: {payload: UpdateReplyCountInterface}) => {

            const {chatId, messageId, comment} = action.payload;

            state.chatMessages[chatId] = state.chatMessages[chatId].map((chat) => {

                if(chat.chat_uuid === messageId) {
                    chat.chat_comments = chat.chat_comments || [];
                    chat.chat_comments = chat.chat_comments.filter((c) => c.comment_uuid != comment.comment_uuid)
                    chat.chat_comment_count--
                }

                return chat
            })
        },

        updateChatCallStatus: (state, action: {payload: UpdateChatCallStatus}) => {

            const {grpId, callStatus} = action.payload;

            state.chatCallStatus[grpId] = {active:callStatus}

        },

        // SYNC: Clear all loaded chat messages to force API refetch after stale reconnection
        invalidateAllChatMessages: (state) => {
            state.chatMessages = {} as ExtendedChats
        }


    }
});

export const {
    createOrUpdateChatBody,
    addChatPreviewFiles,
    deleteChatPreviewFiles,
    updateChatPreviewFiles,
    addChatUploadedFiles,
    removeChatUploadedFiles,
    clearChatInputState,
    updateChatByChatId,
    removeChat,
    updateChat,
    updateChats,
    removeChatByChatId,
    createChat,
    removeChatReactionByChatId,
    updateChatPreviewFilesUUID,
    UpdateMessageInChatList,
    decrementChatCommentCountByChatID,
    updateChatReactionByChatId,
    createChatReactionChatId,
    updateChatScrollToBottom,
    CreateUserChatList,
    AddUserInChatList,
    updateChatMessageReplyIncrement,
    updateChatMessageReplyDecrement,
    UpdateUnreadCountToZero,
    IncrementUnreadCount,
    updateChatScrollPosition,
    updateChatReactionId,
    updateChatCallStatus,
    invalidateAllChatMessages
} = chatSlice.actions

export default chatSlice;