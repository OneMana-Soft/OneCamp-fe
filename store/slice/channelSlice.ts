import { createSlice } from "@reduxjs/toolkit";
import {CancelTokenSource} from "axios";
import { isTombstoned, markTombstone, pruneTombstones, reconcileLatestWindow, type LatestWindowAuthority, type TombstoneMap } from "@/lib/utils/deletionTombstone";
import {PostsRes} from "@/types/post";
import {UserProfileDataInterface} from "@/types/user";
import {AttachmentMediaReq, AttachmentType} from "@/types/attachment";
import {GroupedReaction} from "@/types/reaction";
import {CommentInfoInterface} from "@/types/comment";
import {ChatInfo} from "@/types/chat";


// postContentDiffers reports whether a freshly-fetched server post differs
// from the loaded copy in a way the reconcile should apply (edit, reaction
// change, comment-count change). Cheap field comparison — avoids a deep
// equality pass on every reconcile while still catching the mutations a
// "latest" window can carry. Reaction/comment changes also flow over MQTT,
// but a missed-while-idle edit is exactly what the reconcile exists to fix.
function postContentDiffers(a: PostsRes, b: PostsRes): boolean {
    if (a.post_text !== b.post_text) return true;
    if ((a.post_comment_count || 0) !== (b.post_comment_count || 0)) return true;
    if ((a.post_reactions?.length || 0) !== (b.post_reactions?.length || 0)) return true;
    if ((a.post_attachments?.length || 0) !== (b.post_attachments?.length || 0)) return true;
    return false;
}


export interface FilePreview {
    key: string,
    fileName: string,
    progress: number,
    cancelSource: CancelTokenSource
    attachmentType: AttachmentType
    uuid?: string,
}

export interface MessageInputState {
    inputTextHTML: string,
    filesUploaded: AttachmentMediaReq[]
    filePreview: FilePreview[]
    // Discord-style reply target: when set, the next message sent in this
    // channel is an inline reply to this message (rendered as a composer pill).
    replyToUuid?: string
    replyToAuthorName?: string
    replyToText?: string
}

export interface ChannelScrollPosition {
    [key: string]:  number;
}
export interface  ExtendedPosts {
    [key: string]:  PostsRes[];
}
export interface ExtendedInputState {
    [key: string]:  MessageInputState;
}

export interface ExtendedCallStatus {
    [key: string]: callActiveStatus
}

export interface ExtendedScrollToBottom {
    [key: string]: ScrollToBottom
}

export interface ScrollToBottom {
    shouldScrollToBottom: boolean;
}

interface UpdateScrollToBottom {
    channelId: string
    scrollToBottom: boolean
}

interface UpdateChannelCallStatus {
    channelId: string
    callStatus: boolean
}

interface UpdateReplyCountInterface {
    channelId: string
    messageId: string
    comment: CommentInfoInterface
}

interface callActiveStatus {
    active: boolean
}

interface AddInputText {
    channelId: string,
    inputTextHTML: string
}

interface AddUploadedFiles {
    channelId: string,
    filesUploaded: AttachmentMediaReq
}

interface AddPreviewFiles {
    channelId: string,
    filesUploaded: FilePreview
}

interface RemoveUploadedFiles {
    channelId: string,
    key: string
}

interface ClearInputState {
    channelId: string,
}

interface UpdatePreviewFiles {
    channelId: string,
    key: string,
    progress: number
}

interface UpdatePreviewFilesUUID {
    channelId: string,
    key: string,
    uuid: string
}

interface UpdateChannelPosts extends LatestWindowAuthority {
    channelId: string,
    posts: PostsRes[]
}

interface UpdatePostReaction {
    channelId: string
    reactionId: string,
    postIndex: number,
    emojiId: string
}

interface UpdatePostReactionByPostId {
    channelId: string
    reactionId: string,
    postId: string,
    emojiId: string
}

interface UpdatePostReactionId {
    channelId: string
    postId: string
    oldReactionId: string
    newReactionId: string
}

interface RemovePostReaction {
    channelId: string
    reactionId: string,
    postIndex: number,
}

interface RemovePostReactionByPostId {
    channelId: string
    reactionId: string,
    postId: string,
}

interface UpdatePost {
    channelId: string
    postIndex: number
    htmlText: string
}

interface UpdatePostCommentCount {
    postId: string
    channelId: string
}

interface UpdatePostByPostId {
    channelId: string
    postId: string
    htmlText: string
}

interface RemovePost {
    channelId: string
    postIndex: number
}

interface RemovePostPostId {
    channelId: string
    postId: string
}
interface CreatePost {
    postId: string
    postText: string
    postCreatedAt: string
    postBy: UserProfileDataInterface
    channelId: string
    fwdPost?: PostsRes
    fwdChat?: ChatInfo
    replyTo?: PostsRes
    attachments: AttachmentMediaReq[]
}


interface CreatePostLocally {
    postUUID: string
    postText: string
    postCreatedAt: string
    postBy: UserProfileDataInterface
    channelId: string
    attachments: AttachmentMediaReq[]
    replyTo?: PostsRes
}

interface SetChannelReplyTarget {
    channelId: string
    uuid: string
    authorName: string
    text: string
}
interface UpdateCreatedPostLocally {
    postId: string
    createdAt: string
    postTempId: string
    channelId: string
}

interface UpdatePostAsSeen {
    channelId: string
}

interface UpdateChannelScrollPosition {
    channelId: string
    scrollTop: number
}

interface CreatePostReaction {
    channelId: string
    reactionId: string,
    postIndex: number,
    emojiId: string
    addedBy: UserProfileDataInterface
}

interface CreatePostReactionByPostId {
    channelId: string
    reactionId: string,
    postId: string,
    emojiId: string
    addedBy: UserProfileDataInterface
}

const initialState = {
    channelInputState: {} as ExtendedInputState,
    channelPosts: {} as ExtendedPosts,
    channelScrollPosition: {} as ChannelScrollPosition,
    channelScrollToBottom: {} as ExtendedScrollToBottom,
    channelCallStatus: {} as ExtendedCallStatus,
    // channelId -> post_uuid -> deleted-at ms. Keeps a just-deleted post from
    // being resurrected by a merge whose window was fetched before the delete.
    deletedPosts: {} as TombstoneMap,
}

export const channelSlice = createSlice({
    name: 'channel',
    initialState,
    reducers: {
        updateChannelInputText: (state, action: {payload: AddInputText}) => {
            const { channelId, inputTextHTML } = action.payload;
            if (!state.channelInputState[channelId]) {
                state.channelInputState[channelId] = { inputTextHTML: '', filesUploaded: [], filePreview: [] };
            }
            state.channelInputState[channelId].inputTextHTML = inputTextHTML;
        },

        // setChannelReplyTarget arms the composer to reply to a specific post.
        setChannelReplyTarget: (state, action: {payload: SetChannelReplyTarget}) => {
            const { channelId, uuid, authorName, text } = action.payload;
            if (!state.channelInputState[channelId]) {
                state.channelInputState[channelId] = { inputTextHTML: '', filesUploaded: [], filePreview: [] };
            }
            state.channelInputState[channelId].replyToUuid = uuid;
            state.channelInputState[channelId].replyToAuthorName = authorName;
            state.channelInputState[channelId].replyToText = text;
        },

        // clearChannelReplyTarget dismisses the reply pill without clearing the draft.
        clearChannelReplyTarget: (state, action: {payload: { channelId: string }}) => {
            const { channelId } = action.payload;
            const s = state.channelInputState[channelId];
            if (s) {
                s.replyToUuid = undefined;
                s.replyToAuthorName = undefined;
                s.replyToText = undefined;
            }
        },

        addChannelPreviewFiles: (state, action: {payload: AddPreviewFiles}) => {
            const { channelId, filesUploaded } = action.payload;
            if (!state.channelInputState[channelId]) {
                state.channelInputState[channelId] = { inputTextHTML: '', filesUploaded: [], filePreview: [] };
            }
            state.channelInputState[channelId].filePreview.push(filesUploaded);
        },

        deleteChannelPreviewFiles: (state, action: {payload: RemoveUploadedFiles}) => {
            const { channelId, key } = action.payload;
            if (state.channelInputState[channelId]) {
                state.channelInputState[channelId].filePreview = state.channelInputState[channelId].filePreview.filter((media) => {
                    if (media.key === key) {
                        if(media.progress != 100 && typeof media.cancelSource.cancel === 'function') {
                            media.cancelSource.cancel(`Stopping file upload: ${media.fileName}`);
                        }
                        return false;
                    } else {
                        return true;
                    }
                });
            }
        },

        updateChannelPreviewFiles: (state, action: {payload: UpdatePreviewFiles}) => {
            const { channelId, key, progress } = action.payload;
            if (state.channelInputState[channelId]) {
                state.channelInputState[channelId].filePreview = state.channelInputState[channelId].filePreview.map((item) => {
                    return item.key === key ? { ...item, progress } : item;
                });
            }
        },

        updateChannelPreviewFilesUUID: (state, action: {payload: UpdatePreviewFilesUUID}) => {
            const { channelId, key, uuid } = action.payload;
            if (state.channelInputState[channelId]) {
                state.channelInputState[channelId].filePreview = state.channelInputState[channelId].filePreview.map((item) => {
                    return item.key === key ? { ...item, uuid } : item;
                });
            }
        },


        addChannelUploadedFiles: (state, action: {payload: AddUploadedFiles}) => {
            const { channelId, filesUploaded } = action.payload;
            if (!state.channelInputState[channelId]) {
                state.channelInputState[channelId] = { inputTextHTML: '', filesUploaded: [], filePreview: [] };
            }
            state.channelInputState[channelId].filesUploaded.push(filesUploaded);
        },

        removeChannelUploadedFiles: (state, action: {payload: RemoveUploadedFiles}) => {
            const { channelId, key } = action.payload;
            if (state.channelInputState[channelId]) {
                state.channelInputState[channelId].filesUploaded = state.channelInputState[channelId].filesUploaded.filter((media) => media.attachment_obj_key!== key);
            }
        },
        clearChannelInputState: (state, action: {payload: ClearInputState}) => {
            const { channelId } = action.payload;
            state.channelInputState[channelId] = { inputTextHTML: '', filesUploaded: [], filePreview: [] };
        },

        updateChannelPosts: (state, action: {payload: UpdateChannelPosts}) => {
            const { channelId, posts } = action.payload;

            state.channelPosts[channelId] = [...posts];

        },

        // SYNC (window-reconcile): reconcile the loaded conversation against a
        // freshly-fetched "latest" window after an idle gap (MQTT reconnect or
        // tab foreground). Within the contiguous time-range the window covers,
        // the server is authoritative, so this applies the THREE things an
        // add-only merge misses:
        //   • adds    — posts created while idle appear,
        //   • edits   — a post whose server copy changed is refreshed in place,
        //   • deletes — a post removed while idle (absent from the window but
        //               inside its time-range) is dropped.
        // Everything OUTSIDE the window's range is untouched: older paginated
        // history is preserved, and optimistic local posts (post_added_locally,
        // or newer than the window) are never removed — so there's no empty
        // flash and no lost unconfirmed sends. Reference-stable: an idle
        // reconnect with nothing changed is a no-op.
        mergeChannelPosts: (state, action: {payload: UpdateChannelPosts}) => {
            const { channelId, posts, authoritativeThrough } = action.payload;
            if (!posts) return;

            pruneTombstones(state.deletedPosts, channelId);
            const existing = state.channelPosts[channelId] || [];
            const next = reconcileLatestWindow({
                existing,
                incoming: posts,
                authoritativeThrough,
                getId: (post) => post.post_uuid,
                getCreatedAt: (post) => post.post_created_at,
                contentDiffers: postContentDiffers,
                isOptimistic: (post) => !!post.post_added_locally,
                shouldAcceptIncoming: (post) => !post.post_uuid || !isTombstoned(state.deletedPosts, channelId, post.post_uuid),
                // A server copy with the same UUID confirms the local send.
                mergeMatched: (current, server) => ({ ...current, ...server, post_added_locally: false }),
                sort: (a, b) => new Date(a.post_created_at).getTime() - new Date(b.post_created_at).getTime(),
            });

            if (next !== existing) state.channelPosts[channelId] = next;
        },

        updatePostReaction: (state, action: {payload: UpdatePostReaction}) => {
            const { channelId, postIndex, emojiId, reactionId } = action.payload;

            if (postIndex > -1 && postIndex < state.channelPosts[channelId].length) {
                state.channelPosts[channelId][postIndex].post_reactions = state.channelPosts[channelId][postIndex].post_reactions?.map((reaction) => {
                    if (reaction.uid == reactionId) {
                        reaction.reaction_emoji_id = emojiId
                    }
                    return reaction
                })
            }
        },

        updatePostReactionPostId: (state, action: {payload: UpdatePostReactionByPostId}) => {
            const { channelId, postId, emojiId, reactionId } = action.payload;

            if (!state.channelPosts[channelId]) {
                return
            }

            state.channelPosts[channelId] = state.channelPosts[channelId].map((post) => {
                if(post.post_uuid == postId) {

                    post.post_reactions = post.post_reactions?.map((reaction) => {
                        if (reaction.uid == reactionId) {
                            reaction.reaction_emoji_id = emojiId
                        }
                        return reaction
                    })
                }

                return post
            })

        },

        updatePostReactionId: (state, action: {payload: UpdatePostReactionId}) => {
            const { channelId, postId, oldReactionId, newReactionId } = action.payload;

            if (!state.channelPosts[channelId]) {
                return
            }

            state.channelPosts[channelId] = state.channelPosts[channelId].map((post) => {
                if(post.post_uuid == postId) {
                    post.post_reactions = post.post_reactions?.map((reaction) => {
                        if (reaction.uid == oldReactionId) {
                            reaction.uid = newReactionId
                        }
                        return reaction
                    })
                }
                return post
            })
        },

        createPostReaction: (state, action: {payload: CreatePostReaction}) => {
            const { channelId, postIndex, emojiId, reactionId , addedBy} = action.payload;

            if (!state.channelPosts[channelId]) return
            if (postIndex > -1 && postIndex < state.channelPosts[channelId].length) {

                if(!state.channelPosts[channelId][postIndex].post_reactions) {
                    state.channelPosts[channelId][postIndex].post_reactions = [] as GroupedReaction[]
                }
                state.channelPosts[channelId][postIndex].post_reactions?.push({
                    reaction_emoji_id: emojiId,
                    uid: reactionId,
                    reaction_added_by: addedBy,
                    reaction_added_at: new Date().toISOString(),
                    reaction_on_content_added_by: addedBy
                })
            }
        },

        createPostReactionPostId: (state, action: {payload: CreatePostReactionByPostId}) => {
            const { channelId, postId, emojiId, reactionId , addedBy} = action.payload;
            if (!state.channelPosts[channelId]) return

            state.channelPosts[channelId] = state.channelPosts[channelId].map((post) => {
                if(post.post_uuid == postId) {
                    if(!post.post_reactions) {
                        post.post_reactions = [] as GroupedReaction[]
                    }
                    // Idempotent: a user can only hold one reaction per emoji
                    // on a given post. Match an existing (user, emoji) entry
                    // and upgrade its uid (handles temp -> real swap)
                    // instead of pushing a duplicate.
                    const existingIdx = post.post_reactions.findIndex(
                        (r) =>
                            r.reaction_emoji_id === emojiId &&
                            r.reaction_added_by?.user_uuid === addedBy?.user_uuid,
                    )
                    if (existingIdx > -1) {
                        if (post.post_reactions[existingIdx].uid !== reactionId) {
                            post.post_reactions[existingIdx].uid = reactionId
                        }
                    } else {
                        post.post_reactions.push({
                            reaction_emoji_id: emojiId,
                            uid: reactionId,
                            reaction_added_by: addedBy,
                            reaction_added_at: new Date().toISOString(),
                            reaction_on_content_added_by: addedBy
                        })
                    }
                }

                return post
            })

        },

        removePostReaction: (state, action: {payload: RemovePostReaction}) => {
            const { channelId, postIndex, reactionId } = action.payload;

            if (!state.channelPosts[channelId]) return
            if (postIndex > -1 && postIndex < state.channelPosts[channelId].length) {
                state.channelPosts[channelId][postIndex].post_reactions =  state.channelPosts[channelId][postIndex].post_reactions?.filter((reaction) => {
                    return reaction.uid !== reactionId
                })
            }

        },

        removePostReactionByPostId: (state, action: {payload: RemovePostReactionByPostId}) => {
            const { channelId, postId, reactionId } = action.payload;
            if (!state.channelPosts[channelId]) return

            state.channelPosts[channelId] = state.channelPosts[channelId].map((post) => {

                if(post.post_uuid == postId) {
                    post.post_reactions = post.post_reactions?.filter((reaction) => {
                        return reaction.uid !== reactionId
                    })
                }
                return post
            })
        },

        // incrementPostCommentCountByPostID: (state, action: {payload: UpdatePostCommentCount}) => {
        //     const { postId , channelId} = action.payload;
        //
        //     state.channelPosts[channelId].map((post)=> {
        //         if(post.post_uuid == postId) {
        //             post.post_comment_count++
        //         }
        //         return post
        //     })
        //
        // },

        // decrementPostCommentCountByPostID: (state, action: {payload: UpdatePostCommentCount}) => {
        //     const { postId , channelId} = action.payload;
        //
        //     state.channelPosts[channelId].map((post)=> {
        //         if(post.post_uuid == postId) {
        //             post.post_comment_count--
        //         }
        //         return post
        //     })
        //
        // },

        updatePost: (state, action: {payload: UpdatePost}) => {
            const { channelId, postIndex, htmlText } = action.payload;
            if (postIndex > -1 && postIndex < state.channelPosts[channelId].length) {
                state.channelPosts[channelId][postIndex].post_text = htmlText
            }

        },

        updatePostByPostId: (state, action: {payload: UpdatePostByPostId}) => {
            const { channelId, postId, htmlText } = action.payload;
            if (!state.channelPosts[channelId]) return
            state.channelPosts[channelId] = state.channelPosts[channelId].map((post) => {
                if(postId == post.post_uuid) {
                    post.post_text = htmlText
                }

                return post
            })
        },

        removePost: (state, action: {payload: RemovePost}) => {
            const { channelId, postIndex } = action.payload;
            if (!state.channelPosts[channelId]) return
            if (postIndex > -1 && postIndex < state.channelPosts[channelId].length) {
                state.channelPosts[channelId].splice(postIndex, 1);
            }
        },

        removePostByPostId: (state, action: {payload: RemovePostPostId}) => {
            const { channelId, postId } = action.payload;
            // Tombstone first so a merge from a pre-delete window can't re-add
            // it, even if the conversation isn't currently loaded.
            markTombstone(state.deletedPosts, channelId, postId);
            if (!state.channelPosts[channelId]) return
            state.channelPosts[channelId] = state.channelPosts[channelId].filter((post) => {
                return post.post_uuid !== postId
            })
        },

        createPostLocally: (state, action: {payload: CreatePostLocally}) => {
            const { postText, postCreatedAt, channelId, postBy, attachments, postUUID, replyTo} = action.payload;
            if(!state.channelPosts[channelId]) {
                state.channelPosts[channelId] = [] as PostsRes[]
            }
            // Dedup by post_uuid so an MQTT echo (same user, second device) or
            // a reorder doesn't add the same post twice.
            if (postUUID && state.channelPosts[channelId].some(p => p.post_uuid === postUUID)) return;
            state.channelPosts[channelId].push({
                post_by: postBy,
                post_uuid: postUUID,
                post_created_at: postCreatedAt,
                post_text: postText,
                post_added_locally: true, // not seen by user yet
                post_attachments: attachments,
                post_reply_to: replyTo,
                post_comment_count: 0
            })
        },

        createPost: (state, action: {payload: CreatePost}) => {
            const {postId, postText, postCreatedAt, channelId, postBy, fwdPost, fwdChat, replyTo, attachments} = action.payload;
            // MQTT delivery is not guaranteed to be ordered. A create that
            // arrives after its delete must not resurrect the soft-deleted row.
            if (postId && isTombstoned(state.deletedPosts, channelId, postId)) return;
            if(!state.channelPosts[channelId]) {
                state.channelPosts[channelId] = [] as PostsRes[]
            }
            // Dedup by post_uuid so the MQTT echo for a post the current user
            // sent (from another device or this same one) doesn't duplicate.
            if (postId && state.channelPosts[channelId].some(p => p.post_uuid === postId)) return;
            state.channelPosts[channelId].push({
                post_uuid: postId,
                post_by: postBy,
                post_created_at: postCreatedAt,
                post_text: postText,
                post_added_locally: false,
                post_attachments: attachments,
                post_fwd_msg_post: fwdPost,
                post_fwd_msg_chat: fwdChat,
                post_reply_to: replyTo,
                post_comment_count: 0,
            })

            state.channelPosts[channelId].sort((a, b) =>
                new Date(a.post_created_at).getTime() - new Date(b.post_created_at).getTime()
            );
        },

        addUUIDToLocallyCreatedPost: (state, action: {payload: UpdateCreatedPostLocally}) => {
            const { channelId, postTempId, postId, createdAt } = action.payload;
            if (!state.channelPosts[channelId]) return
            state.channelPosts[channelId] = state.channelPosts[channelId].map((post) => {
                if(postTempId == post.post_temp_id) {
                    post.post_uuid = postId
                    post.post_created_at = createdAt
                }

                return post
            }).sort((a, b) => {
                // Assuming post_created_at is a string (e.g., ISO date) or number (timestamp)
                return new Date(a.post_created_at).getTime() - new Date(b.post_created_at).getTime()
            });
        },

        updatePostAddedLocallyToSeen: (state, action: {payload: UpdatePostAsSeen}) =>{
            const {channelId} = action.payload;
            if(state.channelPosts[channelId]) {
                state.channelPosts[channelId][state.channelPosts[channelId].length-1].post_added_locally = false
            }
        },

        updateChannelScrollPosition: (state, action: {payload: UpdateChannelScrollPosition}) =>{
            const {channelId, scrollTop} = action.payload;
            state.channelScrollPosition[channelId] = scrollTop
        },

        updateChannelScrollToBottom: (state, action: {payload: UpdateScrollToBottom}) => {

            const {channelId, scrollToBottom} = action.payload;

            if(!state.channelScrollToBottom[channelId]) {
                state.channelScrollToBottom[channelId] = {} as ScrollToBottom
            }

            state.channelScrollToBottom[channelId].shouldScrollToBottom = scrollToBottom

        },

        updateChannelMessageReplyIncrement: (state, action: {payload: UpdateReplyCountInterface}) => {

            const {channelId, messageId, comment} = action.payload;
            if (!state.channelPosts[channelId]) return

            state.channelPosts[channelId] = state.channelPosts[channelId].map((post) => {

                if(post.post_uuid === messageId) {
                    post.post_comments = post.post_comments || [];
                    // Dedup by comment_uuid so an MQTT echo (same user, second
                    // device) doesn't double-push and double-count the reply.
                    const alreadyTracked = post.post_comments.some(
                        (c) => c.comment_uuid === comment.comment_uuid
                    );
                    if (!alreadyTracked) {
                        post.post_comments.push(comment);
                        post.post_comment_count = (post.post_comment_count || 0) + 1
                    }
                }

                return post
            })
        },

        updateChannelMessageReplyDecrement: (state, action: {payload: UpdateReplyCountInterface}) => {

            const {channelId, messageId, comment} = action.payload;
            if (!state.channelPosts[channelId]) return

            state.channelPosts[channelId] = state.channelPosts[channelId].map((post) => {

                if(post.post_uuid === messageId) {
                    post.post_comments = post.post_comments || [];
                    // Only decrement when the comment was actually tracked.
                    // Without this guard, a duplicate MQTT delete event (echo
                    // from a second device) would shave another count off
                    // post_comment_count even though the entry has already
                    // been filtered out.
                    const wasTracked = post.post_comments.some(
                        (c) => c.comment_uuid === comment.comment_uuid
                    );
                    if (wasTracked) {
                        post.post_comments = post.post_comments.filter((c) => c.comment_uuid != comment.comment_uuid)
                        post.post_comment_count = Math.max(0, (post.post_comment_count || 0) - 1)
                    }
                }

                return post
            })
        },

        updateChannelCallStatus: (state, action: {payload: UpdateChannelCallStatus}) => {
            const {channelId, callStatus} = action.payload;
            state.channelCallStatus[channelId] = {active:callStatus}
        },
        batchUpdateChannelCallStatus: (state, action: {payload: {channelIds: string[], callStatus: boolean}}) => {
            const {channelIds, callStatus} = action.payload;
            for (const channelId of channelIds) {
                state.channelCallStatus[channelId] = {active:callStatus}
            }
        },

        // SYNC: Clear all loaded channel posts to force API refetch after stale reconnection
        invalidateChannelPosts: (state) => {
            state.channelPosts = {} as ExtendedPosts
        }
    }
});

export const {
    updateChannelPreviewFiles,
    addChannelPreviewFiles,
    deleteChannelPreviewFiles,
    updateChannelPreviewFilesUUID,
    updateChannelInputText,
    setChannelReplyTarget,
    clearChannelReplyTarget,
    addChannelUploadedFiles,
    removeChannelUploadedFiles,
    clearChannelInputState,
    updateChannelPosts,
    updatePostReaction,
    updatePostReactionPostId,
    createPostReaction,
    createPostReactionPostId,
    removePostReaction,
    removePostReactionByPostId,
    updatePost,
    updatePostByPostId,
    removePost,
    removePostByPostId,
    createPost,
    createPostLocally,
    addUUIDToLocallyCreatedPost,
    updatePostAddedLocallyToSeen,
    updateChannelScrollPosition,
    updateChannelScrollToBottom,
    updateChannelMessageReplyIncrement,
    updateChannelMessageReplyDecrement,
    updateChannelCallStatus,
    batchUpdateChannelCallStatus,
    updatePostReactionId,
    invalidateChannelPosts,
    mergeChannelPosts

} = channelSlice.actions

export default channelSlice;
