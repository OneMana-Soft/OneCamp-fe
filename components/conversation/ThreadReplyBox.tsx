"use client"

import { memo } from "react"
import { useDispatch, useSelector } from "react-redux"
import type { Dispatch, UnknownAction } from "@reduxjs/toolkit"
import type { RootState } from "@/store/store"
import { THREAD_COMPOSER_PLACEHOLDER } from "@/lib/utils/composerPlaceholders"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { useUploadFile } from "@/hooks/useUploadFile"
import { useStableCallback } from "@/hooks/useStableCallback"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import MinimalTiptapTextInput from "@/components/textInput/textInput"
import { Checkbox } from "@/components/ui/checkbox"
import { ChannelCommentFileUpload } from "@/components/fileUpload/channelCommentFileUpload"
import { ChatCommentFileUpload } from "@/components/fileUpload/chatCommentFileUpload"
import { GroupChatCommentFileUpload } from "@/components/fileUpload/groupChatCommentFileUpload"
import { SendHorizontal } from "@/lib/icons"
import { removeEmptyPTags } from "@/lib/utils/removeEmptyPTags"
import { getGroupingId } from "@/lib/utils/getGroupingId"
import { followsOnReply } from "@/lib/conversation/threadFollow"
import { mentionPlaceAttrs } from "@/lib/conversation/mentionPlace"
import { ThreadCommandSurface, threadSurfaceKey } from "@/components/command/ThreadCommandSurface"
import { openUI } from "@/store/slice/uiSlice"
import {
    clearChannelCommentMsgInputState, createChannelComment, createOrUpdateChannelCommentMsg, setChannelCommentAlsoSend,
} from "@/store/slice/channelCommentSlice"
import { clearChatCommentInputState, createChatComment, createOrUpdateChatCommentBody } from "@/store/slice/chatCommentSlice"
import { updateChannelMessageReplyIncrement } from "@/store/slice/channelSlice"
import { updateChatMessageReplyIncrement } from "@/store/slice/chatSlice"
import { updateGroupChatMessageReplyIncrement } from "@/store/slice/groupChatSlice"
import type { AttachmentMediaReq } from "@/types/attachment"
import type { CreateCommentResInterface, CreateUpdateCommentReqInterface } from "@/types/comment"
import type { UserProfileDataInterface, UserProfileInterface } from "@/types/user"

/** A thread's kind: the kind of conversation it is in. */
export type ThreadKind = "channel" | "dm" | "group"

/** What the box reads of a thread's draft, whichever slice holds it. */
interface ThreadDraft {
    body: string
    files: AttachmentMediaReq[]
    /** A channel thread's "Also send to #channel". */
    alsoSend: boolean
}

/** The reply that was just sent, as the lists show it until the server's answer is read again. */
interface SentReply {
    thread: string
    conversation: string
    body: string
    files: AttachmentMediaReq[]
    me: UserProfileDataInterface
    answer: CreateCommentResInterface
}

/** How one kind of thread keeps its draft and sends its reply (today's slices and endpoints). */
interface ThreadKindAdapter {
    draft(state: RootState, thread: string): ThreadDraft
    setBody(thread: string, body: string): UnknownAction
    endpoint: PostEndpointUrl
    payload(thread: string, body: string, files: AttachmentMediaReq[], alsoSend: boolean): CreateUpdateCommentReqInterface
    sent(dispatch: Dispatch, reply: SentReply): void
    clear(thread: string, files: AttachmentMediaReq[]): UnknownAction
    upload(uploads: ReturnType<typeof useUploadFile>, files: FileList, conversation: string, thread: string, me: string): Promise<unknown>
    uploadKey: "channelCommentFileUpload" | "chatCommentFileUpload" | "groupChatCommentFileUpload"
}

const NO_FILES: AttachmentMediaReq[] = []
// One value per draft, read again only when the draft changes: the selector
// answers the same object for the same draft (a fresh one per call would
// redraw the box on every store change).
const drafts = new WeakMap<object, ThreadDraft>()
const EMPTY: ThreadDraft = { body: "", files: NO_FILES, alsoSend: false }
function readDraft(raw: object | undefined, body: string | undefined, files: AttachmentMediaReq[] | undefined, alsoSend?: boolean): ThreadDraft {
    if (!raw) return EMPTY
    let d = drafts.get(raw)
    if (!d) {
        d = { body: body ?? "", files: files ?? NO_FILES, alsoSend: !!alsoSend }
        drafts.set(raw, d)
    }
    return d
}

const sentAt = (a: CreateCommentResInterface) => a.comment_created_at || new Date().toISOString()

const chatThread = (kind: "dm" | "group"): ThreadKindAdapter => ({
    draft: (state, thread) => {
        const raw = state.chatComments.chatCommentInputState[thread]
        return readDraft(raw, raw?.commentBody, raw?.filesUploaded)
    },
    setBody: (thread, body) => createOrUpdateChatCommentBody({ threadId: thread, body }),
    endpoint: PostEndpointUrl.CreateChatComment,
    payload: (thread, body, files) => ({ chat_id: thread, comment_attachments: files, comment_text_html: body }),
    sent: (dispatch, r) => {
        dispatch(createChatComment({ commentId: r.answer.comment_id, commentCreatedAt: r.answer.comment_created_at, commentText: r.body, chatId: r.thread, commentBy: r.me, attachments: r.files }))
        const comment = { comment_uuid: r.answer.comment_id, comment_created_at: sentAt(r.answer), comment_text: "", comment_by: r.me }
        dispatch(kind === "dm"
            ? updateChatMessageReplyIncrement({ messageId: r.thread, chatId: r.conversation, comment })
            : updateGroupChatMessageReplyIncrement({ messageId: r.thread, grpId: r.conversation, comment }))
    },
    clear: (thread, files) => clearChatCommentInputState({ threadId: thread, sent: files.map((f) => f.attachment_obj_key) }),
    upload: (uploads, files, conversation, thread, me) => kind === "dm"
        ? uploads.makeRequestToUploadToChatComment(files, thread, getGroupingId(conversation, me))
        : uploads.makeRequestToUploadToGroupChatComment(files, conversation, thread),
    uploadKey: kind === "dm" ? "chatCommentFileUpload" : "groupChatCommentFileUpload",
})

const ADAPTERS: Record<ThreadKind, ThreadKindAdapter> = {
    channel: {
        draft: (state, thread) => {
            const raw = state.channelComment.commentInputState[thread]
            return readDraft(raw, raw?.commentMsgBody, raw?.filesUploaded, raw?.alsoSendToChannel)
        },
        setBody: (thread, body) => createOrUpdateChannelCommentMsg({ threadId: thread, body }),
        endpoint: PostEndpointUrl.CreatePostComment,
        payload: (thread, body, files, alsoSend) => ({ post_id: thread, comment_attachments: files, comment_text_html: body, also_send_to_channel: alsoSend }),
        sent: (dispatch, r) => {
            dispatch(createChannelComment({ commentId: r.answer.comment_id, commentCreatedAt: r.answer.comment_created_at, commentText: r.body, postId: r.thread, commentBy: r.me, attachments: r.files }))
            dispatch(updateChannelMessageReplyIncrement({ channelId: r.conversation, messageId: r.thread, comment: { comment_uuid: r.answer.comment_id, comment_created_at: sentAt(r.answer), comment_text: "", comment_by: r.me } }))
        },
        clear: (thread, files) => clearChannelCommentMsgInputState({ threadId: thread, sent: files.map((f) => f.attachment_obj_key) }),
        upload: (uploads, files, conversation, thread) => uploads.makeRequestToUploadToChannelComment(files, conversation, thread),
        uploadKey: "channelCommentFileUpload",
    },
    dm: chatThread("dm"),
    group: chatThread("group"),
}

/**
 * A thread's reply box, for a channel's, a DM's or a group's thread (chat A1:
 * one composer for every thread, ahead of CHAT-A1B folding the thread panels
 * in). Its own component because it is the only part of a thread that changes
 * as someone types: the draft is read here, so the thread's message and every
 * reply above it no longer re-render on each keystroke (a long thread drew
 * 11,484 components a key, scripts/fluidity's chat scenario).
 *
 * conversation is the channel's uuid, a DM's other person or a group's id, as
 * today's routes and slices name them; thread is the root message's id.
 * channelName names a channel for "Also send to #channel".
 */
export const ThreadReplyBox = memo(function ThreadReplyBox({ kind, conversation, thread, channelName }: {
    kind: ThreadKind
    conversation: string
    thread: string
    channelName?: string
}) {
    const adapter = ADAPTERS[kind]
    const dispatch = useDispatch()
    // The reply being written: this thread's own draft (MC-BUG-1).
    const draft = useSelector((state: RootState) => adapter.draft(state, thread))
    // Moves as a draft kept elsewhere is put in the box (lib/conversation/draftRestores).
    const revision = useSelector((state: RootState) => state.draftRestores?.[`${kind === "channel" ? "post" : "chat"}-thread:${thread}`])
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const uploads = useUploadFile()
    const post = usePost()

    const send = useStableCallback((latestContent?: string) => {
        // The thread this reply was written in: its draft is the one emptied
        // once the server answers, whichever thread is open by then.
        const files = draft.files
        const body = removeEmptyPTags(latestContent ?? draft.body)
        if (!body && files.length === 0) return
        post.makeRequest<CreateUpdateCommentReqInterface, CreateCommentResInterface>({
            apiEndpoint: adapter.endpoint,
            payload: adapter.payload(thread, body, files, draft.alsoSend),
        }).then((answer) => {
            const me = selfProfile.data?.data
            if (answer?.comment_id && me) {
                adapter.sent(dispatch, { thread, conversation, body, files, me, answer })
                // Replying follows the thread (chat P2): its bell says so at once.
                followsOnReply(thread)
            }
            dispatch(adapter.clear(thread, files))
        })
    })
    const onChange = useStableCallback((content: unknown) => {
        dispatch(adapter.setBody(thread, content as string))
    })
    const onActionFiles = useStableCallback(async (files: File[]) => {
        if (!files?.length) return
        await adapter.upload(uploads, files as unknown as FileList, conversation, thread, selfProfile.data?.data.user_uuid || "")
    })
    const openUpload = useStableCallback(() => {
        dispatch(openUI({ key: adapter.uploadKey }))
    })

    return (
        <div className="shrink-0 px-3 pb-3 pt-1" data-command-surface={threadSurfaceKey(thread)} {...mentionPlaceAttrs(kind, kind === "dm" ? getGroupingId(conversation, selfProfile.data?.data?.user_uuid || "") : conversation, true)}>
            <ThreadCommandSurface kind={kind} conversation={conversation} thread={thread} />
            <MinimalTiptapTextInput
                throttleDelay={300}
                attachmentOnclick={openUpload}
                onActionFiles={onActionFiles}
                ButtonIcon={SendHorizontal}
                hasAttachments={draft.files.length > 0}
                buttonOnclick={send}
                variant="chat"
                compact
                output="html"
                placeholder={THREAD_COMPOSER_PLACEHOLDER}
                editable={true}
                editorClassName="focus:outline-none"
                onChange={onChange}
                content={draft.body || null}
                contentRevision={revision}
            >
                {kind === "channel" ? <ChannelCommentFileUpload channelId={conversation} threadId={thread} />
                    : kind === "dm" ? <ChatCommentFileUpload chatUUID={conversation} chatMessageUUID={thread} />
                        : <GroupChatCommentFileUpload grpId={conversation} chatMessageUUID={thread} />}
            </MinimalTiptapTextInput>

            {kind === "channel" && (
                <label className="mt-2 flex h-5 cursor-pointer select-none items-center gap-2 px-1 text-ui-sm text-ink-2">
                    <Checkbox
                        checked={draft.alsoSend}
                        onCheckedChange={(v) => dispatch(setChannelCommentAlsoSend({ threadId: thread, on: v === true }))}
                    />
                    {channelName ? `Also send to #${channelName}` : "Also send to channel"}
                </label>
            )}
        </div>
    )
})
