"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useFetch } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";
import { useToast } from "@/hooks/use-toast";
import {
    Plus,
    Trash2,
    MessageSquare,
    ListTodo,
    Loader2,
    X,
    EyeOff,
    Shield,
    Flag,
    UserPlus,
    MessageCircle,
    Sparkles,
} from "@/lib/icons";
import { ChannelInfoInterface, ChannelInfoListInterfaceResp } from "@/types/channel";
import { ProjectInfoInterface } from "@/types/project";
import { isZeroEpoch } from "@/lib/utils/validation/isZeroEpoch";
import {
    Workflow,
    WorkflowAction,
    WorkflowActionType,
    WorkflowTriggerType,
    WorkflowFormValues,
    parseWorkflow,
    createWorkflow,
    updateWorkflow,
    draftWorkflow,
} from "@/services/workflowService";

interface Props {
    open: boolean;
    workflow: Workflow | null; // null = create
    onClose: () => void;
    onSaved: () => void;
}

const NO_CHANNEL = "__any__";
const MAX_ACTIONS = 5;

// Action palette metadata — label + icon + which triggers it's available on.
const ACTION_META: Record<
    WorkflowActionType,
    { label: string; icon: React.ComponentType<{ className?: string }>; messageOnly?: boolean }
> = {
    reply: { label: "Reply in the channel", icon: MessageSquare },
    reply_ephemeral: { label: "Send a private message", icon: EyeOff },
    create_task: { label: "Create a task", icon: ListTodo },
    warn_user: { label: "Warn the person (private)", icon: Shield, messageOnly: true },
    delete_message: { label: "Delete the message", icon: Trash2, messageOnly: true },
    flag_to_channel: { label: "Flag to a review channel", icon: Flag, messageOnly: true },
};

function emptyAction(type: WorkflowActionType): WorkflowAction {
    switch (type) {
        case "create_task":
            return { type, project_id: "", priority: "medium" };
        case "flag_to_channel":
            return { type, target_channel_id: "" };
        case "delete_message":
            return { type };
        default:
            return { type, text: "" };
    }
}

export function WorkflowEditDialog({ open, workflow, onClose, onSaved }: Props) {
    const { toast } = useToast();
    const isEdit = !!workflow;

    const [name, setName] = useState("");
    const [isActive, setIsActive] = useState(true);
    const [triggerType, setTriggerType] = useState<WorkflowTriggerType>("message_posted");
    const [botName, setBotName] = useState("");
    const [channelId, setChannelId] = useState<string>(NO_CHANNEL);
    const [keywordInput, setKeywordInput] = useState("");
    const [keywords, setKeywords] = useState<string[]>([]);
    const [matchType, setMatchType] = useState<"any" | "all">("any");
    const [actions, setActions] = useState<WorkflowAction[]>([]);
    const [saving, setSaving] = useState(false);

    // Natural-language draft (create mode only).
    const [draftPrompt, setDraftPrompt] = useState("");
    const [drafting, setDrafting] = useState(false);
    const [draftNote, setDraftNote] = useState<string | null>(null);

    const { data: channelsData } = useFetch<ChannelInfoListInterfaceResp>(GetEndpointUrl.GetAllActiveChannelList);
    const channels: ChannelInfoInterface[] = channelsData?.channels_list || [];

    const { data: projectData } = useFetch<{ data: ProjectInfoInterface[] }>(GetEndpointUrl.projectListByAdminUID);
    const projects: ProjectInfoInterface[] = (projectData?.data || []).filter(
        (p) => isZeroEpoch(p.project_deleted_at || ""),
    );

    const isMessageTrigger = triggerType === "message_posted";

    // Hydrate form on open / when target workflow changes.
    useEffect(() => {
        if (!open) return;
        if (workflow) {
            const { keywords: kw, actions: acts } = parseWorkflow(workflow);
            setName(workflow.name);
            setIsActive(workflow.is_active);
            setTriggerType(workflow.trigger_type === "user_joined_channel" ? "user_joined_channel" : "message_posted");
            setBotName(workflow.bot_name || "");
            setChannelId(workflow.channel_id || NO_CHANNEL);
            setKeywords(kw);
            setMatchType(workflow.match_type === "all" ? "all" : "any");
            setActions(acts.length ? acts : []);
        } else {
            setName("");
            setIsActive(true);
            setTriggerType("message_posted");
            setBotName("");
            setChannelId(NO_CHANNEL);
            setKeywords([]);
            setMatchType("any");
            setActions([{ type: "reply", text: "" }]);
        }
        setKeywordInput("");
        setDraftPrompt("");
        setDraftNote(null);
    }, [open, workflow]);

    // When switching to a non-message trigger, drop message-only actions +
    // keywords so the form can't hold an invalid combination.
    useEffect(() => {
        if (!isMessageTrigger) {
            setActions((prev) => prev.filter((a) => !ACTION_META[a.type].messageOnly));
            setKeywords([]);
        }
    }, [isMessageTrigger]);

    const addKeyword = () => {
        const v = keywordInput.trim();
        if (!v) return;
        if (!keywords.includes(v)) setKeywords((p) => [...p, v]);
        setKeywordInput("");
    };

    const removeKeyword = (kw: string) => setKeywords((p) => p.filter((k) => k !== kw));

    const addAction = (type: WorkflowActionType) => {
        if (actions.length >= MAX_ACTIONS) return;
        setActions((p) => [...p, emptyAction(type)]);
    };

    const updateAction = (idx: number, patch: Partial<WorkflowAction>) => {
        setActions((p) => p.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
    };

    const removeAction = (idx: number) => setActions((p) => p.filter((_, i) => i !== idx));

    // handleDraft asks the AI to scaffold the form from a plain-English prompt.
    const handleDraft = async () => {
        const p = draftPrompt.trim();
        if (!p) return;
        setDrafting(true);
        setDraftNote(null);
        try {
            const d = await draftWorkflow(p);
            const trig: WorkflowTriggerType =
                d.trigger_type === "user_joined_channel" ? "user_joined_channel" : "message_posted";
            const msgTrigger = trig === "message_posted";
            if (!name.trim() && d.name) setName(d.name);
            setTriggerType(trig);
            setKeywords(msgTrigger ? (d.keywords || []).filter(Boolean) : []);
            setMatchType(d.match_type === "all" ? "all" : "any");
            const acts = (d.actions || []).filter((a) => msgTrigger || !ACTION_META[a.type]?.messageOnly);
            if (acts.length) setActions(acts);
            setDraftNote(d.notes || "Draft ready. Review the fields and pick any channels or projects before saving.");
            toast({ title: "Draft ready", description: "Review and adjust before saving." });
        } catch {
            // interceptor surfaces the error
        } finally {
            setDrafting(false);
        }
    };

    // Available action types for the current trigger.
    const availableActions = (Object.keys(ACTION_META) as WorkflowActionType[]).filter(
        (t) => isMessageTrigger || !ACTION_META[t].messageOnly,
    );

    const validate = (): string | null => {
        if (!name.trim()) return "Give your workflow a name.";
        if (actions.length === 0) return "Add at least one action.";
        for (const a of actions) {
            if ((a.type === "reply" || a.type === "reply_ephemeral" || a.type === "warn_user") && !a.text?.trim())
                return "Message actions need text.";
            if (a.type === "create_task" && !a.project_id) return "Create-task actions need a project.";
            if (a.type === "create_task" && !isMessageTrigger && !a.task_name?.trim())
                return "Create-task needs a task name for this trigger.";
            if (a.type === "flag_to_channel" && !a.target_channel_id)
                return "Flag actions need a review channel.";
        }
        return null;
    };

    const handleSave = async () => {
        const err = validate();
        if (err) {
            toast({ title: "Can't save yet", description: err, variant: "destructive" });
            return;
        }
        const values: WorkflowFormValues = {
            name: name.trim(),
            is_active: isActive,
            trigger_type: triggerType,
            bot_name: botName.trim(),
            channel_id: channelId === NO_CHANNEL ? "" : channelId,
            keywords: isMessageTrigger ? keywords : [],
            match_type: matchType,
            actions,
        };
        setSaving(true);
        try {
            if (isEdit && workflow) {
                await updateWorkflow(workflow.id, values);
                toast({ title: "Workflow updated" });
            } else {
                await createWorkflow(values);
                toast({ title: "Workflow created" });
            }
            onSaved();
        } catch {
            // axios interceptor surfaces the server error message
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{isEdit ? "Edit workflow" : "New workflow"}</DialogTitle>
                    <DialogDescription>
                        Run actions automatically when something happens in your workspace.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-2">
                    {/* AI draft (create mode only) */}
                    {!isEdit && (
                        <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
                            <Label className="flex items-center gap-1.5 text-sm">
                                <Sparkles className="h-4 w-4 text-primary" /> Describe it in plain English
                            </Label>
                            <Textarea
                                value={draftPrompt}
                                onChange={(e) => setDraftPrompt(e.target.value)}
                                placeholder="e.g. When someone posts 'help' in a channel, reply that support will follow up and create a high-priority task."
                                className="min-h-[64px] resize-none bg-background text-sm"
                                maxLength={2000}
                            />
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] text-muted-foreground">
                                    The AI fills the form below. You review and pick channels/projects before saving.
                                </p>
                                <Button type="button" size="sm" variant="outline" onClick={handleDraft} disabled={drafting || !draftPrompt.trim()} className="shrink-0 gap-1.5">
                                    {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                                    Generate
                                </Button>
                            </div>
                            {draftNote && <p className="text-[11px] text-primary">{draftNote}</p>}
                        </div>
                    )}

                    {/* Name */}
                    <div className="space-y-1.5">
                        <Label>Name</Label>
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Support auto-acknowledge"
                            maxLength={120}
                        />
                    </div>

                    {/* Bot label */}
                    <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">Bot name <span className="text-[11px] font-normal text-muted-foreground">(optional)</span></Label>
                        <Input
                            value={botName}
                            onChange={(e) => setBotName(e.target.value)}
                            placeholder="Shown on automated messages (defaults to the workflow name)"
                            maxLength={80}
                        />
                    </div>

                    {/* Trigger */}
                    <div className="space-y-3 rounded-xl border border-border/60 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">When</p>

                        <Select value={triggerType} onValueChange={(v) => setTriggerType(v as WorkflowTriggerType)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="message_posted">
                                    <span className="inline-flex items-center gap-2"><MessageCircle className="h-4 w-4" /> A message is posted</span>
                                </SelectItem>
                                <SelectItem value="user_joined_channel">
                                    <span className="inline-flex items-center gap-2"><UserPlus className="h-4 w-4" /> Someone joins a channel</span>
                                </SelectItem>
                            </SelectContent>
                        </Select>

                        <div className="space-y-1.5">
                            <Label className="text-sm font-normal">
                                {isMessageTrigger ? "In channel" : "Channel"}
                            </Label>
                            <Select value={channelId} onValueChange={setChannelId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Any channel" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NO_CHANNEL}>Any channel</SelectItem>
                                    {channels.map((c) => (
                                        <SelectItem key={c.ch_uuid} value={c.ch_uuid}>
                                            #{c.ch_name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {isMessageTrigger && (
                            <div className="space-y-1.5">
                                <Label className="text-sm font-normal">Containing keywords (optional)</Label>
                                <div className="flex gap-2">
                                    <Input
                                        value={keywordInput}
                                        onChange={(e) => setKeywordInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                addKeyword();
                                            }
                                        }}
                                        placeholder="Type a word and press Enter"
                                        maxLength={80}
                                    />
                                    <Button type="button" variant="outline" size="icon" onClick={addKeyword} className="shrink-0">
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </div>
                                {keywords.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                        {keywords.map((kw) => (
                                            <span key={kw} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
                                                {kw}
                                                <button onClick={() => removeKeyword(kw)} className="text-muted-foreground hover:text-foreground">
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {keywords.length > 1 && (
                                    <div className="flex items-center gap-2 pt-1">
                                        <Label className="text-xs font-normal text-muted-foreground">Match</Label>
                                        <Select value={matchType} onValueChange={(v) => setMatchType(v as "any" | "all")}>
                                            <SelectTrigger className="h-8 w-auto gap-1">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="any">any keyword</SelectItem>
                                                <SelectItem value="all">all keywords</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                                {keywords.length === 0 && (
                                    <p className="text-[11px] text-muted-foreground">
                                        No keywords = the workflow runs on every message in the selected scope.
                                    </p>
                                )}
                            </div>
                        )}
                        {!isMessageTrigger && (
                            <p className="text-[11px] text-muted-foreground">
                                Tip: use <code className="rounded bg-muted px-1">{"{user}"}</code> in a message to greet the person who joined.
                            </p>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="space-y-3 rounded-xl border border-border/60 p-3">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Then</p>
                            <span className="text-[11px] text-muted-foreground">{actions.length}/{MAX_ACTIONS}</span>
                        </div>

                        {actions.map((a, idx) => {
                            const meta = ACTION_META[a.type];
                            const Icon = meta.icon;
                            return (
                                <div key={idx} className="rounded-lg border border-border/60 p-3 space-y-2 relative">
                                    <div className="flex items-center justify-between">
                                        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                                            <Icon className="h-4 w-4 text-muted-foreground" /> {meta.label}
                                        </span>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeAction(idx)}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>

                                    {(a.type === "reply" || a.type === "reply_ephemeral" || a.type === "warn_user") && (
                                        <Input
                                            value={a.text || ""}
                                            onChange={(e) => updateAction(idx, { text: e.target.value })}
                                            placeholder={
                                                a.type === "warn_user"
                                                    ? "Please keep it respectful."
                                                    : a.type === "reply_ephemeral"
                                                        ? "Only this person will see this."
                                                        : "Thanks! We’ll get back to you shortly."
                                            }
                                            maxLength={4000}
                                        />
                                    )}

                                    {a.type === "create_task" && (
                                        <div className="space-y-2">
                                            <Select value={a.project_id || ""} onValueChange={(v) => updateAction(idx, { project_id: v })}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select a project" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {projects.map((p) => (
                                                        <SelectItem key={p.project_uuid} value={p.project_uuid}>
                                                            {p.project_name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            {projects.length === 0 && (
                                                <p className="text-[11px] text-amber-600">
                                                    You can only create tasks in projects you administer.
                                                </p>
                                            )}
                                            <Input
                                                value={a.task_name || ""}
                                                onChange={(e) => updateAction(idx, { task_name: e.target.value })}
                                                placeholder={isMessageTrigger ? "Task name (defaults to the message text)" : "Task name"}
                                                maxLength={200}
                                            />
                                            <Select value={a.priority || "medium"} onValueChange={(v) => updateAction(idx, { priority: v as WorkflowAction["priority"] })}>
                                                <SelectTrigger className="h-9">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="low">Low priority</SelectItem>
                                                    <SelectItem value="medium">Medium priority</SelectItem>
                                                    <SelectItem value="high">High priority</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}

                                    {a.type === "flag_to_channel" && (
                                        <Select value={a.target_channel_id || ""} onValueChange={(v) => updateAction(idx, { target_channel_id: v })}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a review channel" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {channels.map((c) => (
                                                    <SelectItem key={c.ch_uuid} value={c.ch_uuid}>
                                                        #{c.ch_name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}

                                    {a.type === "delete_message" && (
                                        <p className="text-[11px] text-muted-foreground">
                                            Removes the matching message. Only works if you’re a moderator of the channel.
                                        </p>
                                    )}
                                </div>
                            );
                        })}

                        {actions.length < MAX_ACTIONS && (
                            <Select value="" onValueChange={(v) => addAction(v as WorkflowActionType)}>
                                <SelectTrigger className="h-9 text-muted-foreground">
                                    <span className="!flex items-center gap-1.5 text-sm">
                                        <Plus className="h-3.5 w-3.5 shrink-0" /> Add an action
                                    </span>
                                </SelectTrigger>
                                <SelectContent>
                                    {availableActions.map((t) => {
                                        const m = ACTION_META[t];
                                        const Icon = m.icon;
                                        return (
                                            <SelectItem key={t} value={t}>
                                                <span className="inline-flex items-center gap-2">
                                                    <Icon className="h-4 w-4" /> {m.label}
                                                </span>
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                        )}
                    </div>

                    {/* Active toggle */}
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-sm">Enabled</Label>
                            <p className="text-[11px] text-muted-foreground">Paused workflows keep their config but don’t run.</p>
                        </div>
                        <Switch checked={isActive} onCheckedChange={setIsActive} />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                        {isEdit ? "Save changes" : "Create workflow"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
