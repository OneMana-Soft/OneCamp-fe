"use client";

import React, { useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SettingsSection, sectionActionClass } from "@/components/ui/settingsSection";
import { StatusWord } from "@/components/ui/statusWord";
import { Tile } from "@/components/ui/graphics/Tile";
import { cn } from "@/lib/utils/helpers/cn";
import { apiErrorMessage } from "@/lib/utils/apiError";
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues";
import { WORKFLOWS_DESCRIPTION, WorkflowsListSkeleton } from "@/components/admin/workflowsParts";
import type { CampHue } from "@/lib/campHue";
import { Switch } from "@/components/ui/switch";
import { useFetch } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import { Plus, Trash2, Pencil, MessageSquare, ListTodo, EyeOff, Shield, Flag, LayoutTemplate, Zap, UserPlus } from "@/lib/icons";
import {
    Workflow,
    WorkflowActionType,
    parseWorkflow,
    setWorkflowActive,
    deleteWorkflow,
} from "@/services/workflowService";
import { WorkflowEditDialog } from "./WorkflowEditDialog";
import { PublishTemplateDialog } from "@/components/marketplace/PublishTemplateDialog";

// actionLabel renders a compact badge body for an action type: a 14px icon,
// the dense chip's size, and the action in words.
function actionLabel(type: WorkflowActionType): React.ReactNode {
    switch (type) {
        case "reply":
            return <><MessageSquare className="h-3.5 w-3.5" /> Reply</>;
        case "reply_ephemeral":
            return <><EyeOff className="h-3.5 w-3.5" /> Private reply</>;
        case "create_task":
            return <><ListTodo className="h-3.5 w-3.5" /> Create task</>;
        case "warn_user":
            return <><Shield className="h-3.5 w-3.5" /> Warn</>;
        case "delete_message":
            return <><Trash2 className="h-3.5 w-3.5" /> Delete</>;
        case "flag_to_channel":
            return <><Flag className="h-3.5 w-3.5" /> Flag</>;
        default:
            return type;
    }
}

/**
 * `hue` is the colour of the place it is shown in: the admin page's AI and
 * automation group by default; a settings page passes its own section's.
 *
 * `withTitle` false is the settings page's variant: the page's h1 already says
 * "Workflows" and holds New workflow, so the card draws no title or button of
 * its own (it repeated both under the h1), and the page opens the editor
 * through `creating`.
 */
const WorkflowsCard = ({
    hue = ADMIN_GROUP_HUE.ai,
    withTitle = true,
    creating: creatingProp,
    onCreatingChange,
}: {
    hue?: CampHue;
    withTitle?: boolean;
    creating?: boolean;
    onCreatingChange?: (open: boolean) => void;
} = {}) => {
    const { data, isLoading, isError, mutate } = useFetch<{ data: Workflow[] }>(GetEndpointUrl.GetAllWorkflows);
    const { toast } = useToast();
    const confirm = useConfirm();
    const [editing, setEditing] = useState<Workflow | null>(null);
    const [creatingHere, setCreatingHere] = useState(false);
    const creating = creatingProp ?? creatingHere;
    const setCreating = onCreatingChange ?? setCreatingHere;
    const [publishing, setPublishing] = useState<Workflow | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const workflows = data?.data || [];

    const handleToggle = async (wf: Workflow, next: boolean) => {
        setBusyId(wf.id);
        try {
            await setWorkflowActive(wf.id, next);
            toast({ title: next ? "Workflow enabled" : "Workflow paused" });
            mutate();
        } catch {
            // axios interceptor surfaces the error toast
        } finally {
            setBusyId(null);
        }
    };

    const handleDelete = async (wf: Workflow) => {
        confirm({
            title: `Delete the workflow "${wf.name}"?`,
            description: "It stops running and is removed. This can't be undone.",
            confirmText: "Delete workflow",
            destructive: true,
            onConfirm: async () => {
                setBusyId(wf.id);
                try {
                    await deleteWorkflow(wf.id);
                    toast({ title: "Workflow deleted" });
                    mutate();
                } catch {
                    // handled by interceptor
                } finally {
                    setBusyId(null);
                }
            },
        });
    };

    // Build the portable template payload (the workflow's create body) the
    // templates gallery replays on install. Workspace-specific ids (the bound channel
    // and any per-action targets) are stripped so the template installs cleanly
    // anywhere; the installer rebinds them.
    const workflowTemplatePayload = (wf: Workflow) => {
        const { keywords, actions } = parseWorkflow(wf);
        let triggerConfig: Record<string, unknown> = {};
        try {
            triggerConfig = wf.trigger_config ? JSON.parse(wf.trigger_config) : {};
        } catch {
            triggerConfig = {};
        }
        return {
            name: wf.name,
            is_active: false,
            trigger_type: wf.trigger_type,
            trigger_config: triggerConfig,
            bot_name: wf.bot_name || "",
            channel_id: "",
            keywords,
            match_type: wf.match_type,
            actions: actions.map((a) => ({ ...a, target_channel_id: "", project_id: "" })),
        };
    };

    const list = isLoading ? (
        <WorkflowsListSkeleton />
    ) : isError ? (
        // Checked before the empty case: a failed read used to say "No
        // workflows yet", a claim about the workspace with no way to try again.
        <ErrorState compact subject="the workflows" detail={apiErrorMessage(isError) || undefined} onRetry={() => void mutate()} />
    ) : workflows.length === 0 ? (
        <EmptyState
            icon={Zap}
            hue={hue}
            title="No workflows yet"
            description="For example: when a message mentioning “bug” is posted in #support, create a task and reply “Thanks, we’re on it.”"
        />
    ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
            {workflows.map((wf) => {
                const { keywords, actions } = parseWorkflow(wf);
                const joins = wf.trigger_type === "user_joined_channel";
                return (
                    <div key={wf.id} data-workflow-row="" className="flex items-start gap-3 px-4 py-3">
                        {/* What sets it off, on a tile in the place's hue, as
                            Archive's rules lead with their kind. */}
                        <Tile hue={hue} size="md">{joins ? <UserPlus /> : <MessageSquare />}</Tile>
                        <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span className="truncate text-sm font-medium">{wf.name}</span>
                                {!wf.is_active && <StatusWord className="text-xs">Paused</StatusWord>}
                                {wf.last_error && <StatusWord tone="danger" className="text-xs">Last run failed</StatusWord>}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {joins ? (
                                    <>When someone joins the channel →</>
                                ) : (
                                    <>
                                        When a message
                                        {keywords.length > 0 ? (
                                            <> mentioning{" "}
                                                <span className="text-foreground font-medium">
                                                    {keywords.slice(0, 3).join(", ")}
                                                    {keywords.length > 3 ? "…" : ""}
                                                </span>
                                                {" "}({wf.match_type === "all" ? "all" : "any"})
                                            </>
                                        ) : (
                                            <> (any message)</>
                                        )}{" "}
                                        is posted →
                                    </>
                                )}
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                                {actions.map((a, i) => (
                                    <Badge key={i} variant="outline" className="gap-1 text-2xs font-normal">
                                        {actionLabel(a.type)}
                                    </Badge>
                                ))}
                                <span className="text-2xs text-muted-foreground">
                                    · ran {wf.run_count} {wf.run_count === 1 ? "time" : "times"}
                                </span>
                            </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                            <Switch
                                checked={wf.is_active}
                                disabled={busyId === wf.id}
                                onCheckedChange={(v) => handleToggle(wf, v)}
                                aria-label={`Run ${wf.name}`}
                                className="mr-1"
                            />
                            <Button variant="ghost" size="icon" aria-label="Edit this workflow" className="h-8 w-8" onClick={() => setEditing(wf)} title="Edit">
                                <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Save as a template"
                                className="h-8 w-8"
                                onClick={() => setPublishing(wf)}
                                title="Save as a template"
                            >
                                <LayoutTemplate className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Delete this workflow"
                                className="h-8 w-8 text-danger-ink hover:text-danger-ink"
                                disabled={busyId === wf.id}
                                onClick={() => handleDelete(wf)}
                                title="Delete"
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                );
            })}
        </div>
    );

    const dialogs = (
        <>
            {(creating || editing) && (
                <WorkflowEditDialog
                    workflow={editing}
                    open={creating || !!editing}
                    onClose={() => {
                        setCreating(false);
                        setEditing(null);
                    }}
                    onSaved={() => {
                        setCreating(false);
                        setEditing(null);
                        mutate();
                    }}
                />
            )}

            {publishing && (
                <PublishTemplateDialog
                    open={!!publishing}
                    onOpenChange={(o) => !o && setPublishing(null)}
                    kind="workflow"
                    payload={workflowTemplatePayload(publishing)}
                    defaultName={publishing.name}
                />
            )}
        </>
    );

    if (!withTitle) {
        return (
            <div className="space-y-3">
                {list}
                {dialogs}
            </div>
        );
    }

    // The admin tab's section: like every other tab, an h2 and its one action
    // on the title's row at the shared height.
    return (
        <SettingsSection
            title="Workflows"
            description={WORKFLOWS_DESCRIPTION}
            action={
                <Button size="sm" className={cn(sectionActionClass, "gap-1.5")} onClick={() => setCreating(true)}>
                    <Plus className="h-4 w-4" />
                    New workflow
                </Button>
            }
        >
            {list}
            {dialogs}
        </SettingsSection>
    );
};

export default WorkflowsCard;
