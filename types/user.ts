import {TaskInfoInterface} from "@/types/task";
import {TeamInfoInterface} from "@/types/team";
import {ProjectInfoInterface} from "@/types/project";
import {ChannelInfoInterface} from "@/types/channel";
import {AttachmentMediaReq} from "@/types/attachment";
import {ChatInfo} from "@/types/chat";
import {RecordingInfoInterface} from "@/types/recording";

export interface UserProfileDataInterface {
    uid?: string;
    user_uuid: string;
    id?: string;
    user_email_id?: string;
    user_name: string;
    user_full_name?: string;
    user_tasks?: TaskInfoInterface[];
    user_tasks_todo?: TaskInfoInterface[];
    user_tasks_in_progress?: TaskInfoInterface[];
    user_tasks_backlog?: TaskInfoInterface[];
    user_tasks_in_review?: TaskInfoInterface[];
    user_tasks_canceled?: TaskInfoInterface[];
    user_tasks_done?: TaskInfoInterface[];
    user_channels?: ChannelInfoInterface[];
    user_task_count?: number;
    user_teams?: TeamInfoInterface[];
    user_projects?: ProjectInfoInterface[];
    user_overdue_task_count?: string;
    user_app_lang?: string;
    user_hobbies?: string
    user_profile_object_key: string;
    user_is_admin?: boolean;
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
}

export interface UserDMSearchTextInterface {
    search_text: string
}

export interface GenericSearchTextInterface {
    search_text: string
    page_index?: number
    page_size?: number
}

export enum UserStatus {
    online = "online",
    offline = "offline",
}

export const USER_STATUS_ONLINE = "online"
export const USER_STATUS_OFFLINE = "offline"

export interface UserDMInterface {
    dm_grouping_id: string
    dm_chats?: ChatInfo[]
    dm_unread: number
    dm_participants: UserProfileDataInterface[]
    dm_notification_type: string
    dm_call_active?: boolean
    dm_recording?: RecordingInfoInterface[]
}
export interface RawUserDMInterface {
    data: UserDMInterface;
    mag: string;
}

export interface UserProfileInterface {
    data: UserProfileDataInterface;
    mag: string;
}

export interface UserProfileUpdateInterface {
    user_name: string
    user_full_name: string
    user_job_title: string
    user_profile_object_key: string
    user_hobbies: string
    user_status: string
    user_app_lang: string
}

export type StatusTime = '30m' | '1h' | '4h' | 'today' | 'this_week' | 'custom';

export type CustomNotificationSchedule = {
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

export interface UserListInterfaceRawResp {
    data: UserProfileDataInterface[],
    msg: string
}

export interface UserListResponseInterface {
    data: UserProfileDataInterface[]
    mag: string;
    has_more: boolean;
}

export interface AdminListResponseInterface {
    data: UserProfileDataInterface[]
    mag: string;
    has_more: boolean;
}

export interface Invitation {
    id: string;
    email: string;
    invited_by: string;
    status: string;
    token?: string;
    token_expires_at?: string;
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
    channel_uuid: string
    channel_dgraph_uid: string
    channel_name: string
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

export interface UserEmojiStatusResp {
    data: UserEmojiStatus
    msg: string
}

export interface UserInfoRawInterface {
    msg: string;
    pageCount?: number;
    data: UserProfileDataInterface;
}

export interface UserSelectedOptionInterface {
    reactionId: string,
    emojiId: string
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
export const channel_forward_type = "channel"

interface langInterface {
    name: string
    code: string
}

interface langListInterface {
    [code: string]: langInterface;
}

export const appLangList:langListInterface = {
    'am': {
        name: "Arabic",
        code: "am"
    },
    'be': {
        name: "Belarusian",
        code: "be"
    },
    'bg': {
        name: "Bulgarian",
        code: "bg"
    },
    'ca': {
        name: "Catalan",
        code: "ca"
    },
    'cs': {
        name: "Czech",
        code: "cs"
    },
    'da': {
        name: "Danish",
        code: "da"
    },
    'de': {
        name: "German",
        code: "de"
    },
    'el': {
        name: "Greek",
        code: "el"
    },
    'en-AU': {
        name: "Australian English",
        code: "en-AU"
    },
    'en': {
        name: "English-US",
        code: "en"
    },
    'es': {
        name: "Spanish",
        code: "es"
    },
    'et': {
        name: "Estonian",
        code: "et"
    },
    'eu': {
        name: "Basque",
        code: "eu"
    },
    'fi': {
        name: "Finnish",
        code: "fi"
    },
    'fr': {
        name: "French",
        code: "fr"
    },
    'he': {
        name: "Hebrew",
        code: "he"
    },
    'hi': {
        name: "Hindi",
        code: "hi"
    },
    'it': {
        name: "Italian",
        code: "it"
    },
    'ja': {
        name: "Japanese",
        code: "ja"
    },
    'nl': {
        name: "Dutch",
        code: "nl"
    },
    'pt': {
        name: "Portuguese",
        code: "pt"
    },
    'ru': {
        name: "Russian",
        code: "ru"
    },
    'sv': {
        name: "Swedish",
        code: "sv"
    }
}
