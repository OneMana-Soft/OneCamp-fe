"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/helpers/cn";
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues";
import type { CampHue } from "@/lib/campHue";
import { Switch } from "@/components/ui/switch";
import { useFetch } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import { Plus, Trash2, Pencil, MessageSquare, ListTodo, EyeOff, Shield, Flag, LayoutTemplate, Zap } from "@/lib/icons";
import {
    Workflow,
    WorkflowActionType,
    parseWorkflow,
    setWorkflowActive,
    deleteWorkflow,
} from "@/services/workflowService";
import { WorkflowEditDialog } from "./WorkflowEditDialog";
import { PublishTemplateDialog } from "@/components/marketplace/PublishTemplateDialog";

// actionLabel renders a compact badge body for an action type.
function actionLabel(type: WorkflowActionType): React.ReactNode {
    switch (type) {
        case "reply":
            return <><MessageSquare className="h-3 w-3" /> Reply</>;
        case "reply_ephemeral":
            return <><EyeOff className="h-3 w-3" /> Private reply</>;
        case "create_task":
            return <><ListTodo className="h-3 w-3" /> Create task</>;
        case "warn_user":
            return <><Shield className="h-3 w-3" /> Warn</>;
        case "delete_message":
            return <><Trash2 className="h-3 w-3" /> Delete</>;
        case "flag_to_channel":
            return <><Flag className="h-3 w-3" /> Flag</>;
        default:
            return type;
    }
}

/** A state is a dot and a word, not a filled badge. */
function StateWord({ tone, children }: { tone: "off" | "bad"; children: React.ReactNode }) {
    return (
        <span className={cn("inline-flex items-center gap-1.5 text-xs", tone === "bad" ? "text-danger-ink" : "text-muted-foreground")}>
            <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone === "bad" ? "bg-destructive" : "bg-faint-foreground")} />
            {children}
        </span>
    );
}

/**
 * `hue` is the colour of the place it is shown in: the admin page's AI and
 * automation group by default; a settings page passes its own section's.
 */
const WorkflowsCard = ({ hue = ADMIN_GROUP_HUE.ai }: { hue?: CampHue } = {}) => {
    const { data, isLoading, isError, mutate } = useFetch<{ data: Workflow[] }>(GetEndpointUrl.GetAllWorkflows);
    const { toast } = useToast();
    const confirm = useConfirm();
    const [editing, setEditing] = useState<Workflow | null>(null);
    const [creating, setCreating] = useState(false);
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

    return (
        // Borderless, like every other admin card: on the admin page it is the
        // tab's one card, and a bordered box with its own padding sat in a
        // different frame from Members or Webhooks.
        <Card className="w-full border-none bg-transparent shadow-none">
            <CardHeader className="flex flex-col gap-3 space-y-0 px-0 pb-6 pt-0 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                    <CardTitle className="text-base font-semibold">Workflows</CardTitle>
                    <CardDescription className="max-w-xl">
                        When a message in a channel matches a rule, OneCamp replies or turns it into a task.
                        The switches save as you make them.
                    </CardDescription>
                </div>
                <Button onClick={() => setCreating(true)} className="shrink-0 self-start">
                    <Plus className="mr-1.5 h-4 w-4" />
                    New workflow
                </Button>
            </CardHeader>

            <CardContent className="px-0">
                {isLoading ? (
                    <div role="status" aria-label="Loading workflows" className="py-1">
                        <SkeletonRows rows={3} />
                    </div>
                ) : isError ? (
                    // Checked before the empty case: a failed read used to say
                    // "No workflows yet", a claim about the workspace with no way
                    // to try again.
                    <ErrorState subject="the workflows" onRetry={() => void mutate()} />
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
                            return (
                                <div
                                    key={wf.id}
                                    className="flex items-start justify-between gap-4 px-4 py-3"
                                >
                                    <div className="min-w-0 space-y-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="truncate text-sm font-medium">{wf.name}</span>
                                            {!wf.is_active && <StateWord tone="off">Paused</StateWord>}
                                            {wf.last_error && <StateWord tone="bad">Last run failed</StateWord>}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {wf.trigger_type === "user_joined_channel" ? (
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
                                        <div className="flex items-center gap-2 flex-wrap">
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

                                    <div className="flex items-center gap-1 shrink-0">
                                        <Switch
                                            checked={wf.is_active}
                                            disabled={busyId === wf.id}
                                            onCheckedChange={(v) => handleToggle(wf, v)}
                                            aria-label={`Run ${wf.name}`}
                                        />
                                        <Button variant="ghost" size="icon" aria-label="Edit this workflow" className="h-8 w-8" onClick={() => setEditing(wf)} title="Edit">
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label="Save as a template"
                                            className="h-8 w-8"
                                            onClick={() => setPublishing(wf)}
                                            title="Save as a template"
                                        >
                                            <LayoutTemplate className="h-3.5 w-3.5" />
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
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>

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
        </Card>
    );
};

export default WorkflowsCard;
