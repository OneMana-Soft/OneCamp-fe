import axiosInstance from "@/lib/axiosInstance";
import { PostEndpointUrl } from "@/services/endPoints";

/**
 * Workflow Builder admin client. Workflows are event-triggered automation
 * rules ("when a message matching X is posted in #channel → reply / create a
 * task"). All endpoints are admin-guarded on the backend.
 */

export type WorkflowActionType =
    | "reply"
    | "reply_ephemeral"
    | "create_task"
    | "delete_message"
    | "warn_user"
    | "flag_to_channel";

export type WorkflowTriggerType = "message_posted" | "user_joined_channel" | "meeting_ended" | "task_status_changed";

/** task_status_changed: which moves count. Both optional; the server stores to_status as a key or id. */
export interface TaskStatusTriggerConfig {
    project_id?: string;
    to_status?: string;
}

export interface WorkflowAction {
    type: WorkflowActionType;
    // reply / reply_ephemeral / warn_user
    text?: string;
    // create_task
    project_id?: string;
    task_name?: string;
    priority?: "low" | "medium" | "high" | "";
    description?: string;
    // flag_to_channel
    target_channel_id?: string;
}

export interface Workflow {
    id: string;
    name: string;
    is_active: boolean;
    created_by: string;
    trigger_type: string;
    trigger_config?: string; // raw JSON object string from BE
    bot_name?: string | null;
    channel_id?: string | null;
    keywords: string; // raw JSON string from BE
    match_type: "any" | "all";
    actions: string; // raw JSON string from BE
    run_count: number;
    last_run_at?: string | null;
    last_error?: string | null;
    created_at: string;
    updated_at: string;
}

export interface WorkflowFormValues {
    name: string;
    is_active: boolean;
    trigger_type: WorkflowTriggerType;
    bot_name: string;
    channel_id: string;
    keywords: string[];
    match_type: "any" | "all";
    actions: WorkflowAction[];
    trigger_config?: TaskStatusTriggerConfig;
}

/** A saved workflow's task_status_changed config, or {} for anything else. */
export function parseTaskStatusConfig(w: Workflow): TaskStatusTriggerConfig {
    if (w.trigger_type !== "task_status_changed" || !w.trigger_config) return {};
    try {
        const c = JSON.parse(w.trigger_config) as TaskStatusTriggerConfig;
        return { project_id: c.project_id || undefined, to_status: c.to_status || undefined };
    } catch {
        return {};
    }
}

// parseWorkflow expands the raw JSON string fields into typed values for the UI.
export function parseWorkflow(w: Workflow): {
    keywords: string[];
    actions: WorkflowAction[];
} {
    let keywords: string[] = [];
    let actions: WorkflowAction[] = [];
    try {
        keywords = w.keywords ? JSON.parse(w.keywords) : [];
    } catch {
        keywords = [];
    }
    try {
        actions = w.actions ? JSON.parse(w.actions) : [];
    } catch {
        actions = [];
    }
    return { keywords, actions };
}

export async function createWorkflow(values: WorkflowFormValues): Promise<Workflow> {
    const res = await axiosInstance.post(PostEndpointUrl.CreateWorkflow, values);
    return res.data?.data as Workflow;
}

export async function updateWorkflow(id: string, values: WorkflowFormValues): Promise<Workflow> {
    const res = await axiosInstance.put(`${PostEndpointUrl.UpdateWorkflow}/${id}`, values);
    return res.data?.data as Workflow;
}

export async function setWorkflowActive(id: string, isActive: boolean): Promise<void> {
    await axiosInstance.post(`${PostEndpointUrl.SetWorkflowActive}/${id}/active`, { is_active: isActive });
}

export async function deleteWorkflow(id: string): Promise<void> {
    await axiosInstance.delete(`${PostEndpointUrl.DeleteWorkflow}/${id}`);
}

// A draft workflow generated from a natural-language prompt. Ids are
// intentionally absent (the user selects channels/projects in the form).
interface WorkflowDraft {
    name: string;
    trigger_type: WorkflowTriggerType;
    keywords: string[];
    match_type: "any" | "all";
    actions: WorkflowAction[];
    /** task_status_changed: a status as the person named it, e.g. "QA". */
    trigger_config?: { to_status?: string };
    notes?: string;
}

export async function draftWorkflow(prompt: string): Promise<WorkflowDraft> {
    const res = await axiosInstance.post(PostEndpointUrl.DraftWorkflow, { prompt });
    return res.data?.data as WorkflowDraft;
}
