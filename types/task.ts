import {UserProfileDataInterface} from "@/types/user";
import {ProjectInfoInterface} from "@/types/project";
import {AttachmentMediaReq} from "@/types/attachment";
import {TeamInfoInterface} from "@/types/team";
import {CommentInfoInterface} from "@/types/comment";
import {z} from "zod";

export interface TaskInfoInterface {
    uid: string;
    task_uuid: string;
    id: string;
    task_name: string;
    task_priority: string;
    task_project: ProjectInfoInterface
    task_team: TeamInfoInterface
    task_status: string;
    task_sub_tasks: TaskInfoInterface[]
    task_parent_task: TaskInfoInterface
    task_label: string;
    task_deleted_at: string;
    task_comments: CommentInfoInterface[]
    task_description: string;
    task_activities: TaskActivityInterface[]
    task_assignee?: UserProfileDataInterface;
    task_collaborators: UserProfileDataInterface[];
    task_due_date: string;
    task_created_at: string
    task_sub_task_count: number
    task_comment_count: number
    task_start_date: string;
    task_attachments: AttachmentMediaReq[]
    task_created_by: UserProfileDataInterface;
    task_github_issue_number?: number;
    task_github_issue_url?: string;
    task_github_pr_number?: number;
    task_github_pr_url?: string;
    task_github_branch?: string;
    task_github_pr_state?: string;
    task_github_pr_check_status?: string;
    task_github_pr_review_state?: string;
    task_github_pr_is_draft?: boolean;
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

export const taskPriorityOptions = [
    { id: "high", label: "High" },
    { id: "medium", label: "Medium" },
    { id: "low", label: "Low" },
]

export const taskStatusOptions = [
    { id: "backlog", label: "Backlog" },
    { id: "todo", label: "To Do" },
    { id: "inProgress", label: "In Progress" },
    { id: "inReview", label: "In Review"},
    { id: "done", label: "Done" },
    { id: "canceled", label: "Canceled" },
]

export const createTaskFormSchema = z.object({
    task_name: z
        .string()
        .trim()
        .min(4, "Task name must be at least 4 characters")
        .max(100, "Task name must be at most 100 characters"),
    task_assignee_uuid: z
        .string()
        .optional(),
    task_description: z
        .string()
        .optional(),
    task_project_uuid: z
        .string()
        .min(1, "Please select a project"),
    task_attachments: z
        .array(z.custom<AttachmentMediaReq>())
        .optional(),
    task_due_date: z
        .date({ message: "Please select a valid due date" })
        .optional(),
    task_start_date: z
        .date({ message: "Please select a valid start date" })
        .optional(),
    task_label: z
        .string()
        .trim()
        .optional(),
    task_priority: z
        .string()
        .min(1, "Please select a priority")
        .optional(),
    task_github_issue_url: z
        .string()
        .url("Must be a valid GitHub URL")
        .regex(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(issues|pull)\/\d+$/, "Must be a GitHub issue or PR URL")
        .optional()
        .or(z.literal("")),
});

export type CreateTaskFormData = z.infer<typeof createTaskFormSchema>;
