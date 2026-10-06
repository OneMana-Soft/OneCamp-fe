import {UserProfileDataInterface} from "@/types/user";
import {TaskInfoInterface} from "@/types/task";
import {AttachmentMediaReq} from "@/types/attachment";
import {TeamInfoInterface} from "@/types/team";

export interface ProjectInfoInterface {
    uid: string;
    project_uuid: string;
    id?: string;
    project_name: string;
    notification_type: string
    project_member_count: number
    project_status: string;
    project_team: TeamInfoInterface;
    project_tasks: TaskInfoInterface[];
    project_tasks_todo?: TaskInfoInterface[];
    project_tasks_in_progress?: TaskInfoInterface[];
    project_tasks_backlog?: TaskInfoInterface[];
    project_tasks_in_review?: TaskInfoInterface[];
    project_tasks_canceled?: TaskInfoInterface[];
    project_tasks_done?: TaskInfoInterface[];
    /** Totals of the closed columns; a board loads only the newest of them. */
    project_tasks_done_count?: number
    project_tasks_canceled_count?: number
    project_attachments: AttachmentMediaReq[];
    project_task_count: number;
    project_is_admin: boolean;
    project_is_member: boolean;
    project_members: UserProfileDataInterface[];
    project_admins: UserProfileDataInterface[];
    project_created_by: UserProfileDataInterface;
    project_created_at: string;
    project_updated_at: string;
    project_deleted_at: string;
}

export interface ProjectInfoRawInterface {
    msg: string;
    pageCount?: number;
    data: ProjectInfoInterface;
}

export interface ProjectInfoListRawInterface {
    msg: string;
    data: ProjectInfoInterface[];
}


export interface ProjectMemberAddOrRemoveInterface {
    project_uuid: string;
    user_uuid: string
}

export interface ProjectAddOrRemoveInterface {
    project_uuid: string;
}

export interface ProjectRemoveAttachmentInterface {
    attachment_obj_key: string;
}

export interface ProjectAddAttachmentInterface {
    project_uuid: string;
    project_attachments: AttachmentMediaReq[]
}

export interface ProjectNotificationInterface {
    notification_type: string,
    project_id: string
}