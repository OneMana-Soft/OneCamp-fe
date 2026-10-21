// Mock MqttService for demonstration purposes
import type { FieldValue } from "@/lib/tasks/fields"
import {AttachmentMediaReq} from "@/types/attachment";
import {PostsRes} from "@/types/post";
import {ChatInfo} from "@/types/chat";
import {UserEmojiStatus} from "@/types/user";

export enum MqttMessageType {
    Post = 0,
    Post_Reaction,
    Post_Comment_Reaction,
    Channel_Typing,
    Chat,
    Chat_Reaction,
    Chat_Comment_Reaction,
    Chat_Typing,
    Post_Comment,
    Chat_Comment,
    User_Emoji_Status,
    User_Status,
    User_Device,
    Task_Comment_reaction,
    Task_Comment,
    Doc_Comment,
    Doc_Comment_reaction,
    Activity,
    Channel_call,
    Chat_call,
    GitHub_Sync,
    Archive_Job_Status,
    Slack_Import_Progress,
    Command_Ephemeral,
    AI_Nudge,
    // Channel_Update mirrors the backend MESSAGE_CHANNEL_UPDATE code.
    Channel_Update,
    // Table_Row mirrors backend MESSAGE_TABLE_ROW. Not handled on the FE yet,
    // kept here only to keep the numeric values aligned with the Go iota enum.
    Table_Row,
    // AI_Pending_Action mirrors backend MESSAGE_AI_PENDING_ACTION: a durable
    // in-thread write approval was created or resolved.
    AI_Pending_Action,
    // AI_Agent_Work mirrors backend MESSAGE_AI_AGENT_WORK: a durable agent job
    // started, was asked to stop, or finished. It is what makes the in-thread
    // "working… / Stop" strip live without a timer.
    AI_Agent_Work,
    // Saved_Item_Due mirrors backend MESSAGE_SAVED_ITEM_DUE: something the member
    // saved for later has come due. MUST stay last to keep the numeric values
    // aligned with the Go iota enum.
    Saved_Item_Due,
    // Poll_Update mirrors backend MESSAGE_POLL_UPDATE: a poll's votes or state
    // changed; open views of it revalidate.
    Poll_Update,
    // Scheduled_Message mirrors backend MESSAGE_SCHEDULED_MESSAGE: one of the
    // member's scheduled messages was sent, failed, or changed.
    Scheduled_Message,
    // Task_Dates mirrors backend MESSAGE_TASK_DATES: a task's dates changed;
    // open boards, lists, timelines and its panel show the new ones.
    Task_Dates,
    // Task_Field mirrors backend MESSAGE_TASK_FIELD: a task's value of one of
    // its project's own fields changed; lists, boards and its panel show it.
    Task_Field,
    // Chat_Seen mirrors backend MESSAGE_CHAT_SEEN: someone has seen a DM or
    // group chat up to a time; its read receipts show it.
    Chat_Seen,
    // Content_IO_Job mirrors backend MESSAGE_CONTENT_IO_JOB: an import or
    // export the person started got further; an open import dialog shows it.
    Content_IO_Job,
    // Doc_Meta mirrors backend MESSAGE_DOC_META, on a doc's topic: it was
    // renamed, deleted, restored, moved, or its access or lock changed
    // (lib/docMeta, hooks/useDocMetaEvents).
    Doc_Meta,
    // Notice mirrors backend MESSAGE_NOTICE, on a member's own topic: an inbox
    // item of a kind the feed has no other type for (types/activity NoticeItem).
    Notice,
    // Conversation_Access mirrors backend MESSAGE_CONVERSATION_ACCESS, on the
    // member's own topic: a conversation became theirs (a DM or group started,
    // a channel made, joined or added to; a group's new id when it took
    // someone in) or stopped being theirs (removed from a channel, or left
    // it). The app fetches its topics again (lib/mqtt/conversationAccess).
    Conversation_Access = 38,
    // Desktop_Notice mirrors backend MESSAGE_DESKTOP_NOTICE, on the member's
    // own topic: a notification for the desktop app to raise, sent beside
    // every push (lib/desktopNotices). A browser tab ignores it: it has push.
    Desktop_Notice,
    // Task_Changed mirrors backend MESSAGE_TASK_CHANGED, on a task's project's
    // topic: its name, status or assignee changed, or it was made, deleted
    // or restored. Live task chips and a doc's task lists read it again
    // (lib/liveEntity).
    Task_Changed,
    // Someone joined by invitation (lib/invitationLive).
    Invitation_Accepted = 44,
    // Numbers past Task_Changed (40) are allotted by the integrator, because
    // branches add them in parallel and the enum is positional. Taken so far:
    // 41 MESSAGE_PIN (chat), 42 MESSAGE_CALL_STATE (calls), 43
    // MESSAGE_PROJECT_STATUSES (board columns, lib/board/statusesMessage), 44 an
    // invitation accepted (BE-FOUND F7), 45 a task's timer (projects PR3), 46
    // MESSAGE_READ_MOVED (chat A3).
    // Ask for the next one; never take it here first.
    // Pin mirrors backend MESSAGE_PIN, on a conversation's message topic: a
    // message was pinned or unpinned (chat B25); the conversation's pins are
    // read again (lib/conversation/conversationPath pinsKey).
    Pin = 41,
    Call_State = 42,
    // ReadMoved mirrors backend MESSAGE_READ_MOVED, on your own activity
    // topic: your read marker moved in one conversation (a read in another tab
    // or device, a Mark unread), with its unread count and first unread
    // message (lib/conversation/readMoved).
    ReadMoved = 46,
}

/** MESSAGE_DOC_META's data: what happened to a doc, for the tabs that have it open. */
export interface msgDocMetaInterface {
    /** The event's kind: "doc.renamed", "doc.deleted", "doc.access_changed", … */
    kind: string
    doc_uuid: string
    actor_uuid?: string
    agent_uuid?: string
    at: string
    /** What a tab acts on: the new title, the new parent, whether it's private now. */
    data?: Record<string, string>
}

/** MESSAGE_TASK_FIELD's data: a task's value of a field now (null once taken off), and who set it. */
export interface msgTaskFieldInterface {
    task_uuid: string
    project_uuid: string
    field_id: string
    value: FieldValue | null
    by: string
}

/** MESSAGE_TASK_DATES' data: a task's dates now, "" for an unset one, and who changed them. */
export interface msgTaskDatesInterface {
    task_uuid: string
    project_uuid: string
    task_start_date: string
    task_due_date: string
    by: string
}

export enum MqttActionType {
    Create = 0,
    Update,
    Delete
}

export interface msgType{
    type: MqttMessageType
}

interface msgUserEmojiStatusInterface {
    type: MqttActionType
    user_emoji_status: UserEmojiStatus
    user_uuid: string
}

interface msgUserStatusInterface {
    type: MqttActionType
    user_status: string
    user_uuid: string
}

interface msgUserDeviceInterface {
    type: MqttActionType
    user_device_connected: number
    user_uuid: string
}

interface msgChatInterface {
    type: MqttActionType
    chat_uuid: string
    chat_html_text: string
    user_uuid: string
    chat_grp_id: string
    chat_created_at: string
    chat_updated_at: string
    user_profile_object_key: string
    user_full_name: string
    is_bot?: boolean
    chat_fwd_msg_post?: PostsRes
    chat_fwd_msg_chat?: ChatInfo
    chat_reply_to?: ChatInfo
    chat_attachments: AttachmentMediaReq[]
    /** As a ChatInfo's chat_kind and chat_system: a system line and its facts. */
    chat_kind?: string
    chat_system?: string
}
interface msgPostInterface {
    type: MqttActionType
    post_uuid: string
    post_html_text: string
    user_uuid: string
    post_channel_uuid: string
    post_created_at: string
    post_updated_at: string
    user_profile_object_key: string
    user_full_name: string
    is_bot?: boolean
    post_fwd_msg_post?: PostsRes
    post_fwd_msg_chat?: ChatInfo
    post_reply_to?: PostsRes
    post_attachments: AttachmentMediaReq[]
    /** As a PostsRes's post_kind and post_system: a system line and its facts. */
    post_kind?: string
    post_system?: string
}


interface msgTaskCommentInterface {
    type: MqttActionType
    comment_uuid: string
    task_id: string
    user_uuid: string
    user_profile_object_key: string
    user_name: string
    comment_attachments: AttachmentMediaReq[]
    created_at: string
    updated_at: string
    body_text: string
}

interface msgDocCommentInterface {
    type: MqttActionType
    comment_uuid: string
    /** The doc, as every doc payload names it. */
    doc_uuid?: string
    /** The same, by its old name: older servers send only this one. */
    doc_id: string
    user_uuid: string
    user_profile_object_key: string
    user_name: string
    comment_attachments: AttachmentMediaReq[]
    created_at: string
    updated_at: string
    body_text: string
}

interface msgChatReactionInterface {
    type: MqttActionType
    reaction_emoji_id: string
    user_uuid: string
    user_name: string
    chat_uuid: string
    chat_grp_id: string
    reaction_id: string
}

interface msgChatCommentReactionInterface {
    type: MqttActionType
    reaction_emoji_id: string
    user_uuid: string
    user_name: string
    message_uuid: string
    reaction_id: string
    comment_uuid: string

}

interface msgPostReactionInterface {
    type: MqttActionType
    reaction_emoji_id: string
    user_uuid: string
    user_name: string
    user_profile_object_key: string
    post_uuid: string
    channel_id: string
    reaction_id: string
}

interface msgPostCommentReactionInterface {
    type: MqttActionType
    reaction_emoji_id: string
    user_uuid: string
    user_name: string
    post_uuid: string
    comment_uuid: string
    reaction_id: string
}

interface msgTaskCommentReactionInterface {
    type: MqttActionType
    reaction_emoji_id: string
    user_uuid: string
    user_name: string
    task_uuid: string
    comment_uuid: string
    reaction_id: string
}

interface msgDocCommentReactionInterface {
    type: MqttActionType
    reaction_emoji_id: string
    user_uuid: string
    user_name: string
    doc_uuid: string
    comment_uuid: string
    reaction_id: string
}

export interface msgActivityInterface {
    user_uuid: string
    activity: any // UnifiedActivityItem
}

interface msgChannelTypingInterface {
    user_uuid: string
    user_profile: string
    user_name: string
    channel_uuid: string
    /** Set only when a bot is typing, with its kind (lib/botCopy), so an AI's line says "is working". */
    is_bot?: boolean
    user_bot_kind?: string
}

interface msgChannelUpdateInterface {
    type: MqttActionType
    channel_uuid: string
    action?: string
}

interface rawMsgChannelUpdateInterface {
    type: number
    data: msgChannelUpdateInterface
}

interface msgChatComment {
    type: number
    message_id: string
    chat_grp_id: string
    created_at: string
    body_text: string
    comment_uuid: string
    user_uuid: string
    user_name: string
    user_profile_object_key: string
    comment_attachments: AttachmentMediaReq[]
    is_bot?: boolean
}

interface msgPostCommentInterface {
    type: number
    post_id: string
    channel_id: string
    created_at: string
    body_text: string
    comment_uuid: string
    user_uuid: string
    user_name: string
    user_profile_object_key: string
    comment_attachments: AttachmentMediaReq[]
    is_bot?: boolean
}
interface msgDmTypingInterface {
    user_uuid: string
    user_profile: string
    user_name: string
    chat_grp_id: string
    /** As on msgChannelTypingInterface. */
    is_bot?: boolean
    user_bot_kind?: string
}
interface rawMsgPostReactionInterface {
    type: number
    data: msgPostReactionInterface
}

interface rawMsgPostCommentReactionInterface {
    type: number
    data: msgPostCommentReactionInterface
}

interface rawMsgTaskCommentReactionInterface {
    type: number
    data: msgTaskCommentReactionInterface
}

interface rawMsgDocCommentReactionInterface {
    type: number
    data: msgDocCommentReactionInterface
}

interface rawMsgChatReactionInterface {
    type: number
    data: msgChatReactionInterface
}

interface rawMsgChatCommentReactionInterface {
    type: number
    data: msgChatCommentReactionInterface
}

interface rawMsgPostInterface {
    type: number
    data: msgPostInterface
}

interface rawMsgTaskCommentInterface {
    type: number
    data: msgTaskCommentInterface
}

interface rawMsgDocCommentInterface {
    type: number
    data: msgDocCommentInterface
}

interface rawMsgChatInterface {
    type: number
    data: msgChatInterface
}

interface rawMsgUserEmojiStatusInterface {
    type: number
    data: msgUserEmojiStatusInterface
}

interface rawMsgUserStatusInterface {
    type: number
    data: msgUserStatusInterface
}

interface rawMsgUserDeviceConnectedInterface {
    type: number
    data: msgUserDeviceInterface
}

interface rawMsgChannelTypingInterface {
    type: number
    data: msgChannelTypingInterface
}

interface rawMsgChatCallStatusInterface {
    data: msgChatCallStatusInterface
}

interface rawMsgChannelCallStatusInterface {
    data: msgChannelCallStatusInterface
}

interface rawMsgChatTypingInterface {
    type: number
    data: msgDmTypingInterface
}


interface rawMsgPostCommentInterface {
    type: number
    data: msgPostCommentInterface
}

interface msgChatCallStatusInterface {
    call_status: boolean
    grpId: string
}

interface msgChannelCallStatusInterface {
    call_status: boolean
    channel_uuid: string
}

interface rawMsgChatComment {
    type: number
    data: msgChatComment
}
interface rawMsgActivityInterface {
    type: number
    data: msgActivityInterface
}

interface msgGitHubSyncInterface {
    task_uuid: string
    sync_type: string
    project_uuid: string
    payload?: {
        name?: string
        description?: string
        status?: string
        /** With status_synced: the project's own status the task moved to, or "" for none. */
        custom_status?: string
        custom_status_name?: string
        label?: string
        assignee_uuid?: string
        assignee_name?: string
        pr_state?: string
        pr_is_draft?: boolean
        check_status?: string
        branch?: string
        comment_uuid?: string
        body?: string
    }
}

interface rawMsgGitHubSyncInterface {
    type: number
    data: msgGitHubSyncInterface
}


class MqttService {
    parsePostMsg(messageStr: string) {

            const rawPost: rawMsgPostInterface = JSON.parse(messageStr)
            return rawPost

    }

    parseTaskCommentMsg(messageStr: string) {

        const rawPost: rawMsgTaskCommentInterface = JSON.parse(messageStr)
        return rawPost

    }

    parseChannelCallMsg(messageStr: string) {
        const rawPost: rawMsgChannelCallStatusInterface = JSON.parse(messageStr)
        return rawPost
    }


    parseChatCallMsg(messageStr: string) {
        const rawPost: rawMsgChatCallStatusInterface = JSON.parse(messageStr)
        return rawPost
    }
    parseDocCommentMsg(messageStr: string) {

        const rawPost: rawMsgDocCommentInterface = JSON.parse(messageStr)
        // doc_uuid is the name; doc_id is kept for a server a release older.
        if (rawPost?.data) rawPost.data.doc_id = rawPost.data.doc_uuid || rawPost.data.doc_id
        return rawPost

    }

    parsePostReactionMsg(messageStr: string) {
            const rawPost: rawMsgPostReactionInterface = JSON.parse(messageStr)
            return rawPost

    }

    parsePostCommentReactionMsg(messageStr: string) {
        const rawPost: rawMsgPostCommentReactionInterface = JSON.parse(messageStr)
        return rawPost

    }

    parseTaskCommentReactionMsg(messageStr: string) {
        const rawPost: rawMsgTaskCommentReactionInterface = JSON.parse(messageStr)
        return rawPost

    }

    parseDocCommentReactionMsg(messageStr: string) {
        const rawPost: rawMsgDocCommentReactionInterface = JSON.parse(messageStr)
        return rawPost

    }

    parsePostCommentMsg(messageStr: string) {

        const rawTypingInfo: rawMsgPostCommentInterface = JSON.parse(messageStr)
        return rawTypingInfo

    }

    parseChatMsg(messageStr: string) {
            const rawChat: rawMsgChatInterface = JSON.parse(messageStr)
            return rawChat

    }

    parseChatReactionMsg(messageStr: string) {
            const rawPost: rawMsgChatReactionInterface = JSON.parse(messageStr)
            return rawPost

    }

    parseChatCommentReactionMsg(messageStr: string) {
        const rawPost: rawMsgChatCommentReactionInterface = JSON.parse(messageStr)
        return rawPost

    }

    parseChatCommentMsg(messageStr: string) {
            const rawTypingInfo: rawMsgChatComment = JSON.parse(messageStr)
            return rawTypingInfo

    }

    parseChannelTypingMsg(messageStr: string) {
            const rawTypingInfo:  rawMsgChannelTypingInterface = JSON.parse(messageStr)
            return rawTypingInfo

    }

    parseChatTypingMsg(messageStr: string) {
            const rawTypingInfo: rawMsgChatTypingInterface = JSON.parse(messageStr)
            return rawTypingInfo

    }

    parseUserEmojiStatusMsg(messageStr: string) {
        const rawTypingInfo: rawMsgUserEmojiStatusInterface = JSON.parse(messageStr)
        return rawTypingInfo
    }

    parseUserStatusMsg(messageStr: string) {
        const rawTypingInfo: rawMsgUserStatusInterface = JSON.parse(messageStr)
        return rawTypingInfo
    }

    parseUserDeviceMsg(messageStr: string) {
        const rawTypingInfo: rawMsgUserDeviceConnectedInterface = JSON.parse(messageStr)
        return rawTypingInfo
    }

    parseActivityMsg(messageStr: string) {
        const rawActivity: rawMsgActivityInterface = JSON.parse(messageStr)
        return rawActivity
    }

    parseGitHubSyncMsg(messageStr: string) {
        const rawGitHubSync: rawMsgGitHubSyncInterface = JSON.parse(messageStr)
        return rawGitHubSync
    }

    parseChannelUpdateMsg(messageStr: string) {
        const rawChannelUpdate: rawMsgChannelUpdateInterface = JSON.parse(messageStr)
        return rawChannelUpdate
    }

}

const mqttService = new MqttService()
export default mqttService
