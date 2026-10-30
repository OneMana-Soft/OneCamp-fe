import {UserProfileDataInterface} from "@/types/user";
import {ProjectInfoInterface} from "@/types/project";
import {AttachmentMediaReq} from "@/types/attachment";
import {TeamInfoInterface} from "@/types/team";
import {CommentInfoInterface} from "@/types/comment";
import type {FieldValues} from "@/lib/tasks/fields";
import type {TaskAccess} from "@/lib/work/types";
import type {DependencyFacets} from "@/lib/tasks/dependency";

/** A task on the other end of a dependency, as a task's panel reads it, with how the dependency works. */
export interface DependencyTask extends DependencyFacets {
    task_uuid: string;
    task_name: string;
    task_status: string;
    task_custom_status?: string;
    task_custom_status_name?: string;
    task_hidden?: boolean;
    task_restricted?: boolean;
}

export interface TaskInfoInterface {
    uid: string;
    task_uuid: string;
    id: string;
    task_name: string;
    task_priority: string;
    task_project: ProjectInfoInterface
    task_team: TeamInfoInterface
    task_status: string;
    /** The project's own status the task is in, if any; task_status is then its category. */
    task_custom_status?: string;
    task_custom_status_name?: string;
    task_sub_tasks: TaskInfoInterface[]
    task_parent_task: TaskInfoInterface
    task_label: string;
    task_deleted_at: string;
    task_comments: CommentInfoInterface[]
    task_description: string;
    task_activities: TaskActivityInterface[]
    /** Every history line the task has; task_activities holds the newest of them (PROJ-BUG-8). */
    task_activity_count?: number
    /** Older lines than task_activities holds exist (GetTaskActivityList pages them). */
    task_activity_has_more?: boolean
    task_assignee?: UserProfileDataInterface;
    task_collaborators: UserProfileDataInterface[];
    task_due_date: string;
    /** A date a task that repeats on a schedule comes due next, drawn on the calendar before it exists (calendar head 9). */
    task_ahead?: boolean;
    task_created_at: string
    /** When it entered its status, for "time in status" on a board. */
    task_status_since?: string
    task_sub_task_count: number
    task_comment_count: number
    task_start_date: string;
    task_attachments: AttachmentMediaReq[]
    task_created_by: UserProfileDataInterface;
    task_access?: TaskAccess;
    task_github_issue_number?: number;
    task_github_issue_url?: string;
    task_github_pr_number?: number;
    task_github_pr_url?: string;
    task_github_branch?: string;
    task_github_pr_state?: string;
    task_github_pr_check_status?: string;
    task_github_pr_review_state?: string;
    task_github_pr_is_draft?: boolean;
    /** What it waits on and what waits on it (the task's panel), and how many it waits on are still open (boards, lists). */
    task_blocked_by?: DependencyTask[];
    task_blocks?: DependencyTask[];
    task_blocked_open?: number;
    /** How long the task should take, in minutes; none or 0 is no estimate. */
    task_estimate_minutes?: number;
    /** Its points on its project's estimate scale (linear-05); none when unset. */
    task_estimate_points?: number;
    /** Its values of the project's custom fields, by field id; see lib/tasks/fields. */
    task_fields?: FieldValues;
    /** "Q4-12" */
    task_key?: string;
    /** None for a plain Task. */
    task_work_type?: TaskWorkType;
    task_restricted?: boolean;
    /** Its open request for approval, on a board's read (a held move's target, or "" for an ask). */
    task_waiting?: TaskWaiting;
    task_hidden?: boolean;
}

/** A task's open request for approval, as a board reads it (business/Approvals MarkWaiting). */
export interface TaskWaiting {
    approval_id: string;
    to_status: string;
}

/** Built in (builtin) or the project's own. */
export interface TaskWorkType {
    id: string;
    builtin?: string;
    name: string;
    icon: string;
}
export interface TaskInfoRawInterface {
    data: TaskInfoInterface;
    msg: string;
}

export type NewSubTaskDraft = {
    task_name: string
    task_due_date?: Date
    task_start_date?: Date
    task_assignee?: UserProfileDataInterface
    task_assignee_uuid?: string
}

export interface TaskActivityInterface {
    activity_uuid?: string;
    activity_by: UserProfileDataInterface
    activity_type: string
    activity_time: string
    activity_prev_state: string
    activity_next_state: string

}

export interface CreateTaskInterface {
    task_uuid?: string;
    task_name?: string;
    task_status?: string;
    task_priority?: string;
    task_description?: string;
    task_due_date?: string;
    task_project_uuid?: string;
    task_assignee_uuid?: string;
    task_label?: string;
    task_start_date?: string;
    task_attachments?: AttachmentMediaReq[];
    task_github_issue_url?: string;
}

export interface CreateTaskCommentInterface {
    task_comment_uuid?: string;
    task_comment_body?: string;
    task_uuid?: string;
    task_comment_attachments?: AttachmentMediaReq[];
}

export interface RemoveTaskAttachmentInterface {
    attachment_obj_key: string
    task_uuid: string
}

export { NO_PRIORITY, TASK_PRIORITIES, taskPriorityOptions, taskStatusLabel, taskStatusOptions } from "@/types/taskScale"
