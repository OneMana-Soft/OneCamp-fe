"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useFetch } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import { Plus, Trash2, Pencil, Zap, MessageSquare, ListTodo, Loader2, EyeOff, Shield, Flag, Rocket } from "@/lib/icons";
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

const WorkflowsCard = () => {
    const { data, isLoading, mutate } = useFetch<{ data: Workflow[] }>(GetEndpointUrl.GetAllWorkflows);
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
            title: "Delete workflow",
            description: `Delete workflow "${wf.name}"? This can't be undone.`,
            confirmText: "Delete",
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
        <Card className="border-border/60">
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Zap className="h-5 w-5 text-violet-500" />
                        Workflows
                    </CardTitle>
                    <CardDescription className="max-w-xl">
                        Automate the busywork. When a message matches your rule, OneCamp can
                        reply automatically or turn it into a task — no code, runs forever.
                    </CardDescription>
                </div>
                <Button onClick={() => setCreating(true)} className="shrink-0">
                    <Plus className="h-4 w-4 mr-1.5" />
                    New workflow
                </Button>
            </CardHeader>

            <CardContent>
                {isLoading ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                ) : workflows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center py-12 px-4 gap-3">
                        <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-violet-500/10">
                            <Zap className="h-6 w-6 text-violet-500" />
                        </div>
                        <div className="space-y-1 max-w-sm">
                            <p className="text-sm font-medium">No workflows yet</p>
                            <p className="text-sm text-muted-foreground">
                                Try: when a message containing “bug” is posted in #support, create a
                                task and reply “Thanks — we’re on it.”
                            </p>
                        </div>
                        <Button variant="outline" onClick={() => setCreating(true)}>
                            <Plus className="h-4 w-4 mr-1.5" />
                            Create your first workflow
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {workflows.map((wf) => {
                            const { keywords, actions } = parseWorkflow(wf);
                            return (
                                <div
                                    key={wf.id}
                                    className="flex items-start justify-between gap-4 rounded-xl border border-border/60 p-4 hover:border-border transition-colors"
                                >
                                    <div className="min-w-0 space-y-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-medium truncate">{wf.name}</span>
                                            {!wf.is_active && (
                                                <Badge variant="secondary" className="text-[10px]">Paused</Badge>
                                            )}
                                            {wf.last_error && (
                                                <Badge variant="destructive" className="text-[10px]">Last run failed</Badge>
                                            )}
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
                                                <Badge key={i} variant="outline" className="gap-1 text-[11px] font-normal">
                                                    {actionLabel(a.type)}
                                                </Badge>
                                            ))}
                                            <span className="text-[11px] text-muted-foreground">
                                                · ran {wf.run_count} {wf.run_count === 1 ? "time" : "times"}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0">
                                        <Switch
                                            checked={wf.is_active}
                                            disabled={busyId === wf.id}
                                            onCheckedChange={(v) => handleToggle(wf, v)}
                                            aria-label="Toggle workflow"
                                        />
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(wf)} title="Edit">
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => setPublishing(wf)}
                                            title="Save as template"
                                        >
                                            <Rocket className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-destructive hover:text-destructive"
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
