import {createSlice} from "@reduxjs/toolkit";
import {AttachmentMediaReq} from "@/types/attachment";
import {FilePreview} from "@/store/slice/channelSlice";
import {CommentInfoInterface} from "@/types/comment";
import {GroupedReaction} from "@/types/reaction";
import {UserProfileDataInterface} from "@/types/user";

interface createOrUpdateCommentBody {
    body: string
    threadId: string
}

interface AddPreviewFiles {
    filesUploaded: FilePreview
    threadId: string
}

interface RemoveUploadedFile {
    key: string,
    threadId: string
}

interface ClearInputState {
    threadId: string,
    /** The keys of the files the reply took; a file still uploading stays. */
    sent?: (string | undefined)[],
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
    key: string,
    uuid: string,
    threadId: string
}

interface UpdatePostComment {
    postId: string,
    comments: CommentInfoInterface[]
}

interface UpdateCommentReaction {
    postId: string
    reactionId: string,
    commentIndex: number,
    emojiId: string
}


interface UpdateCommentReactionByCommentId {
    postId: string
    reactionId: string,
    commentId: string,
    emojiId: string
}


interface CreateCommentReaction {
    postId: string
    reactionId: string,
    commentIndex: number,
    emojiId: string
    addedBy: UserProfileDataInterface
}

interface CreateCommentReactionByCommentId {
    postId: string
    reactionId: string,
    commentId: string,
    emojiId: string
    addedBy: UserProfileDataInterface
}

interface RemoveCommentReaction {
    postId: string
    reactionId: string,
    commentIndex: number,
}

interface RemoveCommentReactionByCommentId {
    postId: string
    reactionId: string,
    commentId: string,
}

interface UpdateChannelCommentReactionId {
    postId: string
    commentIndex: number
    oldReactionId: string
    newReactionId: string
}

interface UpdateComment {
    postId: string
    commentIndex: number
    htmlText: string
}

interface UpdateCommentByCommentUUID {
    postId: string
    commentUUID: string
    htmlText: string
}

interface RemoveComment {
    postId: string
    commentIndex: number
}

interface RemoveCommentByCommentUUID {
    postId: string
    commentUUID: string
}

interface CreateComment {
    commentId: string
    commentText: string
    commentCreatedAt: string
    commentBy: UserProfileDataInterface
    postId: string
    attachments: AttachmentMediaReq[]
}

interface commentInputState {
    commentMsgBody: string,
    filesUploaded: AttachmentMediaReq[],
    filesPreview: FilePreview[],
    /** "Also send to #channel", ticked for this reply. */
    alsoSendToChannel?: boolean,
}
export interface  ExtendedComments {
    [key: string]:  CommentInfoInterface[];
}

// A thread reply's unsent draft (its text, the mentions in it, its files),
// keyed by the thread: the uuid of the post the thread hangs from. It was
// keyed by the channel, so every thread in a channel shared one draft: a reply
// typed in thread A showed in thread B, and Enter posted it under B (MC-BUG-1).
// store/slice/threadDrafts.test.ts holds it.
interface ExtendedChannelCommentInputState {
    [threadId: string]: commentInputState;
}

const emptyDraft = (): commentInputState => ({ commentMsgBody: '', filesUploaded: [], filesPreview: [] })

const draftOf = (state: { commentInputState: ExtendedChannelCommentInputState }, threadId: string): commentInputState =>
    (state.commentInputState[threadId] ??= emptyDraft())

const initialState: {commentInputState:ExtendedChannelCommentInputState, postComments:ExtendedComments} = {
    commentInputState: {} as ExtendedChannelCommentInputState,
    postComments: {} as ExtendedComments,
}

const channelCommentSlice = createSlice({
    name: 'channelComment',
    initialState,
    reducers: {

        createOrUpdateChannelCommentMsg: (state, action: {payload: createOrUpdateCommentBody}) => {
            const { body, threadId } = action.payload;
            draftOf(state, threadId).commentMsgBody = body;
        },

        addChannelCommentMsgPreviewFiles: (state, action: {payload: AddPreviewFiles}) => {
            const { filesUploaded, threadId } = action.payload;
            draftOf(state, threadId).filesPreview.push(filesUploaded);
        },

        deleteChannelCommentMsgPreviewFiles: (state, action: {payload: RemoveUploadedFile}) => {
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

        updateChannelCommentMsgPreviewFiles: (state, action: {payload: UpdatePreviewFiles}) => {
            const { key, progress, threadId } = action.payload;
            const draft = draftOf(state, threadId)
            draft.filesPreview = draft.filesPreview.map((item) => {
                return item.key === key ? { ...item, progress } : item;
            });
        },

        updateChannelCommentMsgPreviewFilesUUID: (state, action: {payload: UpdatePreviewFilesUUID}) => {
            const {  key, uuid, threadId } = action.payload;
            const draft = draftOf(state, threadId)
            draft.filesPreview = draft.filesPreview.map((item) => {
                return item.key === key ? { ...item, uuid } : item;
            });
        },

        // An upload joins the thread it was picked in, and only while its
        // preview is still there: one removed, or sent, meanwhile is dropped,
        // never attached unseen to the next reply.
        addChannelCommentMsgUploadedFiles: (state, action: {payload: AddUploadedFiles}) => {
            const { filesUploaded, threadId } = action.payload;
            const draft = state.commentInputState[threadId]
            if (draft?.filesPreview.some((p) => p.key === filesUploaded.attachment_obj_key)) draft.filesUploaded.push(filesUploaded);
        },

        removeChannelCommentMsgUploadedFiles: (state, action: {payload: RemoveUploadedFile}) => {
            const { key, threadId} = action.payload;
            const draft = draftOf(state, threadId)
            draft.filesUploaded = draft.filesUploaded.filter((media) => media.attachment_obj_key !== key);
        },

        setChannelCommentAlsoSend: (state, action: {payload: {threadId: string, on: boolean}}) => {
            draftOf(state, action.payload.threadId).alsoSendToChannel = action.payload.on;
        },

        // Sending a reply empties its own thread's draft of what it sent, and
        // no other draft; a file still uploading stays for the next reply.
        clearChannelCommentMsgInputState: (state, action: {payload: ClearInputState}) => {
            const { threadId, sent } = action.payload;
            const draft = state.commentInputState[threadId]
            if (!draft) return
            const gone = new Set(sent ?? draft.filesUploaded.map((f) => f.attachment_obj_key))
            state.commentInputState[threadId] = {
                ...emptyDraft(),
                filesUploaded: draft.filesUploaded.filter((f) => !gone.has(f.attachment_obj_key)),
                filesPreview: draft.filesPreview.filter((p) => !gone.has(p.key)),
            };
        },

        addChannelComments: (state, action: {payload: UpdatePostComment}) => {
            const { postId, comments } = action.payload;

            state.postComments[postId] = [...comments];

        },

        updateChannelComment: (state, action: {payload: UpdateComment}) => {
            const { postId, commentIndex, htmlText } = action.payload;
            if (state.postComments[postId] && commentIndex > -1 && commentIndex < state.postComments[postId].length) {
                state.postComments[postId][commentIndex].comment_text = htmlText
            }

        },

        updateChannelCommentByCommentUUID: (state, action: {payload: UpdateCommentByCommentUUID}) => {
            const { postId, commentUUID, htmlText } = action.payload;
            state.postComments[postId] = state.postComments[postId]?.map((comment)=> {
                if(comment.comment_uuid == commentUUID) {
                    comment.comment_text = htmlText
                }
                return comment
            })

        },

        removeChannelComment: (state, action: {payload: RemoveComment}) => {
            const { postId, commentIndex } = action.payload;
            if (state.postComments[postId] && commentIndex > -1 && commentIndex < state.postComments[postId].length) {
                state.postComments[postId].splice(commentIndex, 1);
            }
        },

        removeChannelCommentByCommentUUID: (state, action: {payload: RemoveCommentByCommentUUID}) => {
            const { postId, commentUUID } = action.payload;
            state.postComments[postId] = state.postComments[postId]?.filter((comment) => {
                return comment.comment_uuid !== commentUUID
            })
        },

        createChannelComment: (state, action: {payload: CreateComment}) => {
            const {postId, commentText, commentCreatedAt, commentId, commentBy, attachments} = action.payload;
            if(!state.postComments[postId]) {
                state.postComments[postId] = [] as CommentInfoInterface[]
            }
            // Dedup by comment_uuid so an MQTT echo (same user, second
            // device) doesn't add the comment twice.
            if (commentId && state.postComments[postId].some((c) => c.comment_uuid === commentId)) return;
            state.postComments[postId].push({
                comment_updated_at: "",
                comment_by: commentBy,
                comment_created_at: commentCreatedAt,
                comment_text: commentText,
                comment_uuid: commentId,
                comment_added_locally: true, // not seen by user yet
                comment_attachments: attachments
            })
        },



        updateChannelCommentReaction: (state, action: {payload: UpdateCommentReaction}) => {
            const { postId, commentIndex, emojiId, reactionId } = action.payload;

            if (state.postComments[postId] && commentIndex > -1 && commentIndex < state.postComments[postId].length) {
                state.postComments[postId][commentIndex].comment_reactions = state.postComments[postId][commentIndex].comment_reactions?.map((reaction) => {
                    if (reaction.uid == reactionId) {
                        reaction.reaction_emoji_id = emojiId
                    }
                    return reaction
                })
            }
        },

        updateChannelCommentReactionByCommentId: (state, action: {payload: UpdateCommentReactionByCommentId}) => {
            const { postId, commentId, emojiId, reactionId } = action.payload;

            state.postComments[postId] = state.postComments[postId]?.map((c) => {
                if(c.comment_uuid == commentId) {
                    c.comment_reactions = c.comment_reactions?.map((r) => {
                        if (r.uid == reactionId) {
                            r.reaction_emoji_id = emojiId
                        }
                        return r
                    })
                }
                return c
            })

        },

        createChannelCommentReaction: (state, action: {payload: CreateCommentReaction}) => {
            const { postId, commentIndex, emojiId, reactionId , addedBy} = action.payload;

            if (commentIndex > -1 && commentIndex < state.postComments[postId].length) {

                if(!state.postComments[postId][commentIndex].comment_reactions) {
                    state.postComments[postId][commentIndex].comment_reactions = [] as GroupedReaction[]
                }
                state.postComments[postId][commentIndex].comment_reactions?.push({
                    reaction_emoji_id: emojiId,
                    uid: reactionId,
                    reaction_added_by: addedBy,
                    reaction_added_at: new Date().toISOString(),
                    reaction_on_content_added_by: addedBy
                })
            }
        },

        createChannelCommentReactionByCommentId: (state, action: {payload: CreateCommentReactionByCommentId}) => {
            const { postId, commentId, emojiId, reactionId , addedBy} = action.payload;

            state.postComments[postId] = state.postComments[postId]?.map((c) => {

                if(c.comment_uuid == commentId) {
                    if(!c.comment_reactions) {
                        c.comment_reactions = [] as GroupedReaction[]
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
                            reaction_on_content_added_by: addedBy
                        })
                    }
                }
                return c
            })
        },

        removeChannelCommentReaction: (state, action: {payload: RemoveCommentReaction}) => {
            const { postId, commentIndex, reactionId } = action.payload;

            if (state.postComments[postId] && commentIndex > -1 && commentIndex < state.postComments[postId].length) {
                state.postComments[postId][commentIndex].comment_reactions =  state.postComments[postId][commentIndex].comment_reactions?.filter((reaction) => {
                    return reaction.uid !== reactionId
                })
            }

        },

        removeChannelCommentReactionByReactionId: (state, action: {payload: RemoveCommentReactionByCommentId}) => {
            const { postId, commentId, reactionId } = action.payload;

            state.postComments[postId] = state.postComments[postId]?.map((c) => {

                if(c.comment_uuid == commentId) {

                    c.comment_reactions = c.comment_reactions?.filter((reaction) => {
                        return reaction.uid !== reactionId
                    })
                }
                return c
            })

        },

        updateChannelCommentReactionId: (state, action: {payload: UpdateChannelCommentReactionId}) => {
            const { postId, commentIndex, oldReactionId, newReactionId } = action.payload;

            if (commentIndex > -1 && commentIndex < state.postComments[postId].length) {
                state.postComments[postId][commentIndex].comment_reactions = state.postComments[postId][commentIndex].comment_reactions?.map((reaction) => {
                    if (reaction.uid == oldReactionId) {
                        reaction.uid = newReactionId
                    }
                    return reaction
                })
            }
        },

    }
})


export const {
    createOrUpdateChannelCommentMsg,
    addChannelCommentMsgPreviewFiles,
    deleteChannelCommentMsgPreviewFiles,
    updateChannelCommentMsgPreviewFilesUUID,
    addChannelCommentMsgUploadedFiles,
    removeChannelCommentMsgUploadedFiles,
    clearChannelCommentMsgInputState,
    setChannelCommentAlsoSend,
    updateChannelCommentMsgPreviewFiles,
    addChannelComments,
    updateChannelComment,
    updateChannelCommentByCommentUUID,
    removeChannelComment,
    removeChannelCommentByCommentUUID,
    createChannelComment,
    updateChannelCommentReaction,
    updateChannelCommentReactionByCommentId,
    createChannelCommentReaction,
    createChannelCommentReactionByCommentId,
    removeChannelCommentReaction,
    removeChannelCommentReactionByReactionId,
    updateChannelCommentReactionId
} = channelCommentSlice.actions

export default channelCommentSlice;