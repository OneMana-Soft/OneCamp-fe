import type {TaskInfoInterface} from "@/types/task";
import {TeamInfoInterface} from "@/types/team";
import {ProjectInfoInterface} from "@/types/project";
import {ChannelInfoInterface} from "@/types/channel";
import {AttachmentMediaReq} from "@/types/attachment";
import {ChatInfo} from "@/types/chat";
import {RecordingInfoInterface} from "@/types/recording";
import {DocSidebarInfo} from "@/types/doc";
import {BoardSidebarInfo} from "@/types/board";
import type {Role} from "@/lib/work/types";

export interface UserProfileDataInterface {
    uid?: string;
    user_uuid: string;
    id?: string;
    user_email_id?: string;
    user_name: string;
    user_full_name?: string;
    /** Their @handle; only on their own profile. */
    user_handle?: string;
    user_project_role?: Role;
    user_tasks?: TaskInfoInterface[];
    user_tasks_todo?: TaskInfoInterface[];
    user_tasks_in_progress?: TaskInfoInterface[];
    user_tasks_backlog?: TaskInfoInterface[];
    user_tasks_in_review?: TaskInfoInterface[];
    user_tasks_canceled?: TaskInfoInterface[];
    user_tasks_done?: TaskInfoInterface[];
    user_tasks_done_count?: number
    user_tasks_canceled_count?: number
    /** My Tasks' board count per column, by category (PROJ-BUG-8; lib/board/columnTotals). */
    user_column_counts?: Record<string, number>
    user_channels?: ChannelInfoInterface[];
    user_fav_channels?: ChannelInfoInterface[];
    user_task_count?: number;
    user_incomplete_task_count?: number;
    user_overdue_task_count?: number;
    user_teams?: TeamInfoInterface[];
    user_projects?: ProjectInfoInterface[];
    user_docs?: DocSidebarInfo[];
    user_boards?: BoardSidebarInfo[];
    user_app_lang?: string;
    user_hobbies?: string
    user_profile_object_key: string;
    user_is_admin?: boolean;
    /** On your own profile only: you are the public demo's shared visitor (the server's helpers.IsDemoVisitor). */
    user_demo_visitor?: boolean;
    user_job_title?: string;
    user_deleted_at?: string;
    user_notifications_paused?: boolean
    user_notification_pause_expires_at?: string | null
    user_status?: string
    user_device_connected?: number
    notification_type ?: string
    user_call_active?: boolean
    user_emoji_statuses?:UserEmojiStatus[]
    user_custom_notification?: NotificationSchedule
    user_dms?: UserDMInterface[]
    user_total_unread_activity_count?: number
    user_theme_color?: string
    user_theme_mode?: string
    is_external?: boolean
    is_bot?: boolean
    /** Which kind of bot: see lib/botCopy.ts. Absent for people, and for a server older than the field. */
    user_bot_kind?: string
}

export interface UserDMSearchTextInterface {
    search_text: string
}

export interface GenericSearchTextInterface {
    search_text: string
    page_index?: number
    page_size?: number
}

export const USER_STATUS_ONLINE = "online"
export const USER_STATUS_OFFLINE = "offline"

export interface UserDMInterface {
    dm_grouping_id: string
    dm_name?: string
    dm_chats?: ChatInfo[]
    dm_unread: number
    dm_participants: UserProfileDataInterface[]
    dm_notification_type: string
    dm_call_active?: boolean
    dm_recording?: RecordingInfoInterface[]
}
export interface RawUserDMInterface {
    data: UserDMInterface;
}

export interface UserProfileInterface {
    data: UserProfileDataInterface;
}

export interface UserProfileUpdateInterface {
    user_name: string
    user_full_name: string
    /** Sent only when it changes. */
    user_handle?: string
    user_job_title: string
    user_profile_object_key: string
    user_hobbies: string
    user_status: string
    user_app_lang: string
}

export type StatusTime = '30m' | '1h' | '4h' | 'today' | 'this_week' | 'custom';

type CustomNotificationSchedule = {
    days: ('Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday')[]
    start_time: string
    end_time: string
}

export type NotificationSchedule = {
    type: 'none' | 'custom'
    custom: CustomNotificationSchedule | null
}

export interface UserStatusRespInterface {
    data: UserEmojiStatus[]
}

export interface UserListInterfaceResp {
    users: UserProfileDataInterface[],
    msg: string
}

export interface UserListResponseInterface {
    data: UserProfileDataInterface[]
    has_more: boolean;
}

export interface AdminListResponseInterface {
    data: UserProfileDataInterface[]
    has_more: boolean;
}

export interface Invitation {
    id: string;
    email: string;
    invited_by: string;
    /** sent (or pending, from before tokens) while it can be used; expired once its link has run out; joined once used. */
    status: string;
    token?: string;
    token_expires_at?: string;
    /** Days its link has left, rounded up, while it can still be used. */
    expires_in_days?: number;
    /** The link it was sent with, while it can still be used. */
    invite_link?: string;
    created_at: string;
}

export interface InvitationListResponseInterface {
    data: Invitation[]
    status: string;
}


export interface UserActivateOrDeactivateInterface {
    user_uuid: string
}

export interface AdminCreateOrRemoveInterface {
    user_uuid: string
}

export interface ChannelAndUserListInterfaceResp {
    type: string
    user_uuid: string
    user_dgraph_uid: string
    user_profile_object_key: string
    user_name: string
    user_handle?: string
    channel_uuid: string
    channel_dgraph_uid: string
    channel_name: string
    grp_id?: string
    grp_dgraph_uid?: string
    grp_name?: string
}

export interface MessageFwdReq {
    fwd_text: string
    fwd_chat_uuid: string
    fwd_post_uuid: string
    fwd_channel_uuid: string
    fwd_attachments: AttachmentMediaReq[]
    fwd_list: ChannelAndUserListInterfaceResp[]
}

export interface ChannelAndUserListInterfaceReq {
    search_text: string
}

export interface UserEmojiStatus {
    status_user_emoji_id: string
    status_user_emoji_desc: string
    status_user_emoji_expiry_at?: string
    status_user_emoji_expiry_in?: StatusTime
}

export interface UserInfoRawInterface {
    msg: string;
    pageCount?: number;
    data: UserProfileDataInterface;
}

export interface UpdateUserEmojiStatusReq {
    emoji_id: string
    emoji_status_desc: string
    emoji_expiry_time_at: string
    emoji_expiry_time_in: string
    emoji_timezone: string
}

export interface CallTokenResponseInterface {
    token: string
}

export const chat_forward_type = "chat"
