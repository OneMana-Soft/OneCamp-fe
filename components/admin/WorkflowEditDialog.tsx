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
    PhoneOff,
    MessageCircle,
    Sparkles,
} from "@/lib/icons";
import { ChannelInfoInterface, ChannelInfoListInterfaceResp } from "@/types/channel";
import { ProjectInfoInterface } from "@/types/project";
import { isZeroEpoch } from "@/lib/utils/validation/isZeroEpoch";
import { TaskMoveFilterFields, ANY_MOVE, type TaskMoveFilter } from "@/components/task/TaskMoveFilterFields";
import { HUE_CLASS } from "@/components/ui/graphics/hues";
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues";
import { cn } from "@/lib/utils/helpers/cn";
import {
    Workflow,
    WorkflowAction,
    WorkflowActionType,
    WorkflowTriggerType,
    WorkflowFormValues,
    parseWorkflow,
    parseTaskStatusConfig,
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

/**
 * Every trigger this build knows how to edit.
 *
 * Narrowing against this rather than a chain of ternaries matters when the
 * server learns a new trigger before the client does: the old code reopened
 * anything unfamiliar as "a message is posted" and saved it back that way,
 * silently rewriting a workflow the user never touched.
 */
const KNOWN_TRIGGERS: WorkflowTriggerType[] = ["message_posted", "user_joined_channel", "meeting_ended", "task_status_changed"];

/** A type guard, because Array.includes does not narrow and both call sites need it to. */
function isKnownTrigger(t: string): t is WorkflowTriggerType {
    return (KNOWN_TRIGGERS as string[]).includes(t);
}

/**
 * One line under the trigger picker saying what the chosen event actually hands
 * the workflow.
 *
 * Keyed by trigger rather than written inline so a new trigger cannot ship
 * without one: Record<WorkflowTriggerType, string> refuses to compile until the
 * entry exists, the same way KNOWN_TRIGGERS above refuses to forget it.
 *
 * meeting_ended earns the longest note. It fires for every call that ends,
 * recorded or not, and it carries no transcript, so someone expecting it to
 * hand them what was said should hear that before building the workflow rather
 * than after watching it post nothing useful.
 */
const TRIGGER_HELP: Record<WorkflowTriggerType, string> = {
    message_posted: "Runs when a message is posted. Add keywords below to narrow which ones.",
    user_joined_channel: "Runs once for each person who joins the channel.",
    meeting_ended:
        "Runs when a call in the channel ends, whether or not it was recorded. The workflow knows the call happened, not what was said in it.",
    task_status_changed:
        "Runs when a task moves into the status you pick, or on every move. A reply can say {by} moved {task} to {status} (from {from}) in {project}, with {link} to the task.",
};

export function WorkflowEditDialog({ open, workflow, onClose, onSaved }: Props) {
    const { toast } = useToast();
    const isEdit = !!workflow;
    // What stops a save, said where it is: the name under the name (with the
    // cursor there), anything about the actions in the Then section. It was a
    // "Can't save yet" toast in the corner, tied to no field.
    const [nameError, setNameError] = useState<string | null>(null);
    const [actionsError, setActionsError] = useState<string | null>(null);
    const nameRef = React.useRef<HTMLInputElement>(null);
    const actionsRef = React.useRef<HTMLDivElement>(null);

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
    // task_status_changed: which moves count.
    const [taskMove, setTaskMove] = useState<TaskMoveFilter>(ANY_MOVE);

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
    const isTaskTrigger = triggerType === "task_status_changed";

    // Hydrate form on open / when target workflow changes.
    useEffect(() => {
        if (!open) return;
        if (workflow) {
            const { keywords: kw, actions: acts } = parseWorkflow(workflow);
            setName(workflow.name);
            setIsActive(workflow.is_active);
            // Narrowed against the known set rather than a chain of ternaries, so a
            // trigger added on the server does not silently reopen as "a message is
            // posted" and get saved back as the wrong kind.
            setTriggerType(isKnownTrigger(workflow.trigger_type) ? workflow.trigger_type : "message_posted");
            setBotName(workflow.bot_name || "");
            setChannelId(workflow.channel_id || NO_CHANNEL);
            setKeywords(kw);
            setMatchType(workflow.match_type === "all" ? "all" : "any");
            setActions(acts.length ? acts : []);
            const tc = parseTaskStatusConfig(workflow);
            setTaskMove({ projectId: tc.project_id || "", toStatus: tc.to_status || "" });
        } else {
            setName("");
            setIsActive(true);
            setTriggerType("message_posted");
            setBotName("");
            setChannelId(NO_CHANNEL);
            setKeywords([]);
            setMatchType("any");
            setActions([{ type: "reply", text: "" }]);
            setTaskMove(ANY_MOVE);
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
                isKnownTrigger(d.trigger_type) ? d.trigger_type : "message_posted";
            const msgTrigger = trig === "message_posted";
            if (!name.trim() && d.name) setName(d.name);
            setTriggerType(trig);
            setKeywords(msgTrigger ? (d.keywords || []).filter(Boolean) : []);
            setMatchType(d.match_type === "all" ? "all" : "any");
            // A status as the draft named it; the server resolves it once a project is picked.
            if (trig === "task_status_changed") setTaskMove((m) => ({ ...m, toStatus: d.trigger_config?.to_status?.trim() || "" }));
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
                return "Write the message for each reply.";
            if (a.type === "create_task" && !a.project_id) return "Choose a project for each new task.";
            if (a.type === "create_task" && !isMessageTrigger && !a.task_name?.trim())
                return "Give each new task a name: this trigger has no message to name it from.";
            if (a.type === "flag_to_channel" && !a.target_channel_id)
                return "Choose the review channel for each flag.";
            if (a.type === "reply" && isTaskTrigger && channelId === NO_CHANNEL)
                return "Choose the channel the reply posts in.";
        }
        return null;
    };

    const handleSave = async () => {
        const err = validate();
        if (err) {
            if (!name.trim()) {
                setNameError(err);
                setActionsError(null);
                nameRef.current?.focus();
            } else {
                setNameError(null);
                setActionsError(err);
                actionsRef.current?.scrollIntoView({ block: "nearest" });
            }
            return;
        }
        setNameError(null);
        setActionsError(null);
        const values: WorkflowFormValues = {
            name: name.trim(),
            is_active: isActive,
            trigger_type: triggerType,
            bot_name: botName.trim(),
            channel_id: channelId === NO_CHANNEL ? "" : channelId,
            keywords: isMessageTrigger ? keywords : [],
            match_type: matchType,
            actions,
            trigger_config: isTaskTrigger
                ? {
                      project_id: taskMove.projectId || undefined,
                      to_status: taskMove.toStatus || undefined,
                  }
                : undefined,
        };
        setSaving(true);
        try {
            if (isEdit && workflow) {
                await updateWorkflow(workflow.id, values);
                toast({ title: `${name.trim()} saved` });
            } else {
                await createWorkflow(values);
                toast({ title: `${name.trim()} created` });
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
                        // In the AI and automation group's tint: it was an orange
                        // panel, the colour of the one action a view asks for.
                        <div className={cn(HUE_CLASS[ADMIN_GROUP_HUE.ai], "space-y-2 rounded-xl border border-hue/30 bg-hue-tint/60 p-3")}>
                            <Label htmlFor="wf-describe" className="flex items-center gap-1.5 text-sm text-hue-ink">
                                <Sparkles className="h-4 w-4" aria-hidden="true" /> Describe it in plain English
                            </Label>
                            <Textarea
                                id="wf-describe"
                                value={draftPrompt}
                                onChange={(e) => setDraftPrompt(e.target.value)}
                                placeholder="When someone posts “help” in a channel, reply that support will follow up and create a high-priority task…"
                                className="min-h-[64px] resize-none bg-background text-sm"
                                maxLength={2000}
                            />
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-xs text-muted-foreground">
                                    The AI fills in the form below. You check it and pick the channels and projects before saving.
                                </p>
                                <Button type="button" size="sm" variant="outline" onClick={handleDraft} disabled={drafting || !draftPrompt.trim()} className="shrink-0 gap-1.5">
                                    {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                                    Generate
                                </Button>
                            </div>
                            {draftNote && <p className="text-xs text-hue-ink">{draftNote}</p>}
                        </div>
                    )}

                    {/* Name */}
                    <div className="space-y-1.5">
                        <Label htmlFor="wf-name">Name</Label>
                        <Input
                            ref={nameRef}
                            id="wf-name"
                            value={name}
                            aria-invalid={nameError ? true : undefined}
                            aria-describedby={nameError ? "wf-name-error" : undefined}
                            onChange={(e) => {
                                setName(e.target.value);
                                if (nameError) setNameError(null);
                            }}
                            placeholder="Support auto-reply…"
                            maxLength={120}
                            autoComplete="off"
                        />
                        {nameError && <p id="wf-name-error" className="text-xs font-medium text-danger-ink">{nameError}</p>}
                    </div>

                    {/* Bot label */}
                    <div className="space-y-1.5">
                        <Label htmlFor="wf-bot" className="flex items-center gap-1.5">Sender name <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                        <Input
                            id="wf-bot"
                            value={botName}
                            onChange={(e) => setBotName(e.target.value)}
                            placeholder="Its messages come from this name; it's the workflow's name if empty…"
                            maxLength={80}
                            autoComplete="off"
                        />
                    </div>

                    {/* Trigger */}
                    <div className="space-y-3 rounded-xl border border-border/60 p-3">
                        <h3 id="wf-when" className="text-sm font-medium">When</h3>

                        <Select value={triggerType} onValueChange={(v) => setTriggerType(v as WorkflowTriggerType)}>
                            <SelectTrigger aria-labelledby="wf-when">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="message_posted">
                                    <span className="inline-flex items-center gap-2"><MessageCircle className="h-4 w-4" /> A message is posted</span>
                                </SelectItem>
                                <SelectItem value="user_joined_channel">
                                    <span className="inline-flex items-center gap-2"><UserPlus className="h-4 w-4" /> Someone joins a channel</span>
                                </SelectItem>
                                <SelectItem value="meeting_ended">
                                    <span className="inline-flex items-center gap-2"><PhoneOff className="h-4 w-4" /> A call in this channel ends</span>
                                </SelectItem>
                                <SelectItem value="task_status_changed">
                                    <span className="inline-flex items-center gap-2"><ListTodo className="h-4 w-4" /> A task changes status</span>
                                </SelectItem>
                            </SelectContent>
                        </Select>

                        <p className="text-xs text-muted-foreground text-pretty">{TRIGGER_HELP[triggerType]}</p>

                        {isTaskTrigger && <TaskMoveFilterFields value={taskMove} onChange={setTaskMove} projects={projects} />}

                        <div className="space-y-1.5">
                            <Label htmlFor="wf-channel" className="text-sm font-normal">
                                {isMessageTrigger ? "In channel" : isTaskTrigger ? "Reply in" : "Channel"}
                            </Label>
                            <Select value={channelId} onValueChange={setChannelId}>
                                <SelectTrigger id="wf-channel">
                                    <SelectValue placeholder="Any channel" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NO_CHANNEL}>{isTaskTrigger ? "No channel" : "Any channel"}</SelectItem>
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
                                <Label htmlFor="wf-keyword" className="text-sm font-normal">Containing keywords (optional)</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="wf-keyword"
                                        value={keywordInput}
                                        onChange={(e) => setKeywordInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                addKeyword();
                                            }
                                        }}
                                        placeholder="Type a word and press Enter…"
                                        autoComplete="off"
                                        maxLength={80}
                                    />
                                    <Button aria-label="Add keyword" type="button" variant="outline" size="icon" onClick={addKeyword} className="shrink-0">
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </div>
                                {keywords.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                        {keywords.map((kw) => (
                                            <span key={kw} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
                                                {kw}
                                                <button type="button" aria-label={`Remove keyword ${kw}`} onClick={() => removeKeyword(kw)} className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70">
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {keywords.length > 1 && (
                                    <div className="flex items-center gap-2 pt-1">
                                        <Label htmlFor="wf-match" className="text-xs font-normal text-muted-foreground">Match</Label>
                                        <Select value={matchType} onValueChange={(v) => setMatchType(v as "any" | "all")}>
                                            <SelectTrigger id="wf-match" className="h-8 w-auto gap-1">
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
                                    <p className="text-xs text-muted-foreground">
                                        With no keywords, it runs on every message in that channel.
                                    </p>
                                )}
                            </div>
                        )}
                        {!isMessageTrigger && (
                            <p className="text-xs text-muted-foreground">
                                Write <code className="rounded bg-muted px-1">{"{user}"}</code> in a message to greet the person who joined.
                            </p>
                        )}
                    </div>

                    {/* Actions */}
                    <div ref={actionsRef} className="space-y-3 rounded-xl border border-border/60 p-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-medium">Then</h3>
                            <span className="text-xs text-muted-foreground">{actions.length} of {MAX_ACTIONS}</span>
                        </div>
                        {actionsError && (
                            <p role="alert" className="text-xs font-medium text-danger-ink">{actionsError}</p>
                        )}

                        {actions.map((a, idx) => {
                            const meta = ACTION_META[a.type];
                            const Icon = meta.icon;
                            return (
                                <div key={idx} className="rounded-lg border border-border/60 p-3 space-y-2 relative">
                                    <div className="flex items-center justify-between">
                                        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                                            <Icon className="h-4 w-4 text-muted-foreground" /> {meta.label}
                                        </span>
                                        <Button aria-label={`Remove ${meta.label.toLowerCase()} (action ${idx + 1})`} variant="ghost" size="icon" className="h-8 w-8 text-danger-ink hover:text-danger-ink" onClick={() => removeAction(idx)}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>

                                    {(a.type === "reply" || a.type === "reply_ephemeral" || a.type === "warn_user") && (
                                        <Input
                                            aria-label={`Message for action ${idx + 1}`}
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
                                                <SelectTrigger aria-label={`Project for action ${idx + 1}`}>
                                                    <SelectValue placeholder="Choose a project" />
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
                                                <p className="text-xs text-warning-ink">
                                                    You can only create tasks in projects you administer.
                                                </p>
                                            )}
                                            <Input
                                                aria-label={`Task name for action ${idx + 1}`}
                                                value={a.task_name || ""}
                                                onChange={(e) => updateAction(idx, { task_name: e.target.value })}
                                                placeholder={isMessageTrigger ? "Task name (defaults to the message text)" : "Task name"}
                                                maxLength={200}
                                            />
                                            <Select value={a.priority || "medium"} onValueChange={(v) => updateAction(idx, { priority: v as WorkflowAction["priority"] })}>
                                                <SelectTrigger aria-label={`Priority for action ${idx + 1}`} className="h-9">
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
                                            <SelectTrigger aria-label={`Review channel for action ${idx + 1}`}>
                                                <SelectValue placeholder="Choose a review channel" />
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
                                        <p className="text-xs text-muted-foreground">
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
                            <Label htmlFor="wf-active" className="text-sm">Turned on</Label>
                            <p id="wf-active-help" className="text-xs text-muted-foreground">While it’s off it keeps its settings but doesn’t run.</p>
                        </div>
                        <Switch id="wf-active" aria-describedby="wf-active-help" checked={isActive} onCheckedChange={setIsActive} />
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
