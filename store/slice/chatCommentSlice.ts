import {createSlice} from "@reduxjs/toolkit";
import {AttachmentMediaReq} from "@/types/attachment";
import {FilePreview} from "@/store/slice/channelSlice";
import {ExtendedComments} from "@/store/slice/channelCommentSlice";
import {CommentInfoInterface} from "@/types/comment";
import {UserProfileDataInterface} from "@/types/user";
import {GroupedReaction} from "@/types/reaction";
import {applyReplyEdit} from "@/lib/chat/replyEdit";


interface ChatCommentInputState {
    commentBody: string,
    filesUploaded: AttachmentMediaReq[],
    filesPreview: FilePreview[]
}

interface UpdateChatComment {
    chatId: string,
    comments: CommentInfoInterface[]
}

interface RemoveComment {
    chatId: string
    commentIndex: number
}

interface RemoveCommentByCommentID {
    chatId: string
    commentId: string
}

interface UpdateCommentByCommentID {
    chatId: string
    commentId: string
    htmlText: string
    updatedAt?: string | null
}

interface CreateComment {
    commentId: string
    commentText: string
    commentCreatedAt: string
    commentBy: UserProfileDataInterface
    chatId: string
    attachments: AttachmentMediaReq[]
}

interface UpdateCommentReaction {
    chatId: string
    reactionId: string,
    commentIndex: number,
    emojiId: string
}

interface UpdateCommentReactionByCommentId {
    chatId: string
    reactionId: string,
    commentId: string,
    emojiId: string
}

interface CreateCommentReaction {
    chatId: string
    reactionId: string,
    commentIndex: number,
    emojiId: string
    addedBy: UserProfileDataInterface
}

interface CreateCommentReactionByCommentId {
    chatId: string
    reactionId: string,
    commentId: string,
    emojiId: string
    addedBy: UserProfileDataInterface
}

interface RemoveCommentReaction {
    chatId: string
    reactionId: string,
    commentIndex: number,
}

interface RemoveCommentReactionByCommentId {
    chatId: string
    reactionId: string,
    commentId: string,
}

interface UpdateChatCommentReactionId {
    chatId: string
    commentIndex: number
    oldReactionId: string
    newReactionId: string
}

// A DM or group thread reply's unsent draft, keyed by the thread: the uuid of
// the message the thread hangs from, never the conversation's. The desktop
// panels keyed it by the conversation, so every thread in a DM or group shared
// one draft and Enter posted it under whichever was open (MC-BUG-1).
// store/slice/threadDrafts.test.ts holds it.
interface ExtendedChatCommentInputState {
    [threadId: string]:  ChatCommentInputState;
}

interface AddPreviewFiles {
    fileUploaded: FilePreview
    threadId: string
}

interface RemoveUploadedFile {
    key: string,
    threadId: string
}

interface AddUploadedFiles {
    filesUploaded: AttachmentMediaReq
    threadId: string
}

interface UpdatePreviewFiles {
    key: string,
    progress: number,
    threadId: string
}

interface UpdatePreviewFilesUUID {
    threadId: string,
    key: string,
    uuid: string
}

interface ClearChatComment {
    threadId: string
    /** The keys of the files the reply took; a file still uploading stays. */
    sent?: (string | undefined)[]
}

interface createOrUpdateCommentBody {
   threadId: string
    body: string
}

const emptyDraft = (): ChatCommentInputState => ({ commentBody: '', filesUploaded: [], filesPreview: [] })

const draftOf = (state: { chatCommentInputState: ExtendedChatCommentInputState }, threadId: string): ChatCommentInputState =>
    (state.chatCommentInputState[threadId] ??= emptyDraft())

const initialState = {
    chatCommentInputState: {} as ExtendedChatCommentInputState,
    chatComments: {} as ExtendedComments,
}

export const chatCommentSlice = createSlice({
    name: 'chatComments',
    initialState,
    reducers: {

        createOrUpdateChatCommentBody: (state, action: {payload: createOrUpdateCommentBody}) => {
            const { threadId, body } = action.payload;
            draftOf(state, threadId).commentBody = body;
        },

        addChatCommentPreviewFiles: (state, action: {payload: AddPreviewFiles}) => {
            const { fileUploaded, threadId} = action.payload;
            draftOf(state, threadId).filesPreview.push(fileUploaded);
        },

        deleteChatCommentPreviewFiles: (state, action: {payload: RemoveUploadedFile}) => {
            const { key, threadId } = action.payload;
            const draft = draftOf(state, threadId)
            draft.filesPreview = draft.filesPreview.filter((media) => {
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

        updateChatCommentPreviewFiles: (state, action: {payload: UpdatePreviewFiles}) => {
            const { key, progress, threadId } = action.payload;
            const draft = draftOf(state, threadId)
            draft.filesPreview = draft.filesPreview.map((item) => {
                return item.key === key ? { ...item, progress } : item;
            });
        },

        updateChatCommentPreviewFilesUUID: (state, action: {payload: UpdatePreviewFilesUUID}) => {
            const { threadId, key, uuid } = action.payload;
            const draft = draftOf(state, threadId)
            draft.filesPreview = draft.filesPreview.map((item) => {
                return item.key === key ? { ...item, uuid } : item;
            });
        },

        // As in a channel's thread (channelCommentSlice): an upload joins the
        // thread it was picked in, only while its preview is still there.
        addChatCommentUploadedFiles: (state, action: {payload: AddUploadedFiles}) => {
            const { filesUploaded, threadId } = action.payload;
            const draft = state.chatCommentInputState[threadId]
            if (draft?.filesPreview.some((p) => p.key === filesUploaded.attachment_obj_key)) draft.filesUploaded.push(filesUploaded);
        },

        removeChatCommentUploadedFiles: (state, action: {payload: RemoveUploadedFile}) => {
            const { key, threadId } = action.payload;
            const draft = draftOf(state, threadId)
            draft.filesUploaded = draft.filesUploaded.filter((media) => media.attachment_obj_key  !== key);
        },

        // Sending a reply empties its own thread's draft of what it sent.
        clearChatCommentInputState: (state, action :{payload: ClearChatComment}) => {
            const { threadId, sent } = action.payload;
            const draft = state.chatCommentInputState[threadId]
            if (!draft) return
            const gone = new Set(sent ?? draft.filesUploaded.map((f) => f.attachment_obj_key))
            state.chatCommentInputState[threadId] = {
                ...emptyDraft(),
                filesUploaded: draft.filesUploaded.filter((f) => !gone.has(f.attachment_obj_key)),
                filesPreview: draft.filesPreview.filter((p) => !gone.has(p.key)),
            };
        },
        addChatComments: (state, action: {payload: UpdateChatComment}) => {
            const { chatId, comments } = action.payload;

            state.chatComments[chatId] = [...comments];

        },

        removeChatComment: (state, action: {payload: RemoveComment}) => {
            const { chatId, commentIndex } = action.payload;
            if (state.chatComments[chatId] && commentIndex > -1 && commentIndex < state.chatComments[chatId].length) {
                state.chatComments[chatId].splice(commentIndex, 1);
            }
        },

        removeChatCommentByCommentId: (state, action: {payload: RemoveCommentByCommentID}) => {
            const { chatId, commentId } = action.payload;
            if (state.chatComments[chatId]) {
                state.chatComments[chatId] = state.chatComments[chatId].filter((comment) => {
                    return comment.comment_uuid !== commentId
                })
            }
        },

        updateChatCommentByCommentId: (state, action: {payload: UpdateCommentByCommentID}) => {
            const { chatId, commentId, htmlText, updatedAt } = action.payload;
            if (state.chatComments[chatId]) {
                state.chatComments[chatId] = state.chatComments[chatId].map((comment) => {
                    if(comment.comment_uuid == commentId){
                        applyReplyEdit(comment, htmlText, updatedAt)
                    }
                    return comment
                })
            }
        },

        createChatComment: (state, action: {payload: CreateComment}) => {
            const {chatId, commentText, commentCreatedAt, commentId, commentBy, attachments} = action.payload;
            if(!state.chatComments[chatId]) {
                state.chatComments[chatId] = [] as CommentInfoInterface[]
            }
            // Dedup by comment_uuid so an MQTT echo (same user, second
            // device) doesn't add the comment twice.
            if (commentId && state.chatComments[chatId].some((c) => c.comment_uuid === commentId)) return;
            state.chatComments[chatId].push({
                comment_updated_at: "",
                comment_by: commentBy,
                comment_created_at: commentCreatedAt,
                comment_text: commentText,
                comment_uuid: commentId,
                comment_added_locally: true, // not seen by user yet
                comment_attachments: attachments
            })
        },

        updateChatCommentReaction: (state, action: {payload: UpdateCommentReaction}) => {
            const { chatId, commentIndex, emojiId, reactionId } = action.payload;

            if (commentIndex > -1 && commentIndex < state.chatComments[chatId].length) {
                state.chatComments[chatId][commentIndex].comment_reactions = state.chatComments[chatId][commentIndex].comment_reactions?.map((reaction) => {
                    if (reaction.uid == reactionId) {
                        reaction.reaction_emoji_id = emojiId
                    }
                    return reaction
                })
            }

        },

        updateChatCommentReactionByCommentId: (state, action: {payload: UpdateCommentReactionByCommentId}) => {
            const { chatId, commentId, emojiId, reactionId } = action.payload;

            if (state.chatComments[chatId]) {
                state.chatComments[chatId] = state.chatComments[chatId].map((c) => {
                    if(c.comment_uuid == commentId){
                        c.comment_reactions = c.comment_reactions?.map((r) => {
                            if (r.uid == reactionId) {
                                r.reaction_emoji_id = emojiId
                            }
                            return r
                        })
                    }
                    return c
                })
            }
        },

        createChatCommentReaction: (state, action: {payload: CreateCommentReaction}) => {
            const { chatId, commentIndex, emojiId, reactionId , addedBy} = action.payload;

            if (commentIndex > -1 && commentIndex < state.chatComments[chatId].length) {

                if(!state.chatComments[chatId][commentIndex].comment_reactions) {
                    state.chatComments[chatId][commentIndex].comment_reactions = [] as GroupedReaction[]
                }
                state.chatComments[chatId][commentIndex].comment_reactions?.push({
                    reaction_emoji_id: emojiId,
                    uid: reactionId,
                    reaction_added_by: addedBy,
                    reaction_added_at: new Date().toISOString(),
                    reaction_on_content_added_by: addedBy,
                })
            }
        },

        createChatCommentReactionByCommentId: (state, action: {payload: CreateCommentReactionByCommentId}) => {
            const { chatId, commentId, emojiId, reactionId , addedBy} = action.payload;

            if (state.chatComments[chatId]) {
                state.chatComments[chatId] = state.chatComments[chatId].map((c) => {
                    if(c.comment_uuid == commentId){
                        if (!c.comment_reactions) {
                            c.comment_reactions = [] as GroupedReaction[];
                        }
                        // Idempotent: dedup by (user, emoji); upgrade temp uid
                        // to real uid instead of pushing a duplicate row.
                        const existingIdx = c.comment_reactions.findIndex(
                            (r) =>
                                r.reaction_emoji_id === emojiId &&
                                r.reaction_added_by?.user_uuid === addedBy?.user_uuid,
                        )
                        if (existingIdx > -1) {
                            if (c.comment_reactions[existingIdx].uid !== reactionId) {
                                c.comment_reactions[existingIdx].uid = reactionId
                            }
                        } else {
                            c.comment_reactions.push({
                                reaction_emoji_id: emojiId,
                                uid: reactionId,
                                reaction_added_by: addedBy,
                                reaction_added_at: new Date().toISOString(),
                                reaction_on_content_added_by: addedBy,
                            })
                        }
                    }
                    return c
                })
            }
        },

        removeChatCommentReaction: (state, action: {payload: RemoveCommentReaction}) => {
            const { chatId, commentIndex, reactionId } = action.payload;

            if (commentIndex > -1 && commentIndex < state.chatComments[chatId].length) {
                state.chatComments[chatId][commentIndex].comment_reactions =  state.chatComments[chatId][commentIndex].comment_reactions?.filter((reaction) => {
                    return reaction.uid !== reactionId
                })
            }

        },

        removeChatCommentReactionByCommentId: (state, action: {payload: RemoveCommentReactionByCommentId}) => {
            const { chatId, commentId, reactionId } = action.payload;

            if (state.chatComments[chatId]) {
                state.chatComments[chatId] = state.chatComments[chatId].map((c) => {
                    if(c.comment_uuid == commentId){
                        c.comment_reactions = c.comment_reactions?.filter((reaction) => {
                            return reaction.uid !== reactionId
                        })
                    }
                    return c
                })
            }
        },

        updateChatCommentReactionId: (state, action: {payload: UpdateChatCommentReactionId}) => {
            const { chatId, commentIndex, oldReactionId, newReactionId } = action.payload;

            if (commentIndex > -1 && commentIndex < state.chatComments[chatId].length) {
                state.chatComments[chatId][commentIndex].comment_reactions = state.chatComments[chatId][commentIndex].comment_reactions?.map((reaction) => {
                    if (reaction.uid == oldReactionId) {
                        reaction.uid = newReactionId
                    }
                    return reaction
                })
            }
        },

    }
});

export const {
    createOrUpdateChatCommentBody,
    addChatCommentPreviewFiles,
    addChatCommentUploadedFiles,
    updateChatCommentPreviewFiles,
    updateChatCommentPreviewFilesUUID,
    deleteChatCommentPreviewFiles,
    removeChatCommentUploadedFiles,
    clearChatCommentInputState,
    addChatComments,
    removeChatComment,
    createChatComment,
    updateChatCommentReaction,
    updateChatCommentReactionByCommentId,
    createChatCommentReaction,
    createChatCommentReactionByCommentId,
    removeChatCommentReaction,
    removeChatCommentReactionByCommentId,
    removeChatCommentByCommentId,
    updateChatCommentByCommentId,
    updateChatCommentReactionId
} =chatCommentSlice.actions