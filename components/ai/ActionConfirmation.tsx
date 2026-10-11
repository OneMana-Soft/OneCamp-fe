"use client";

/**
 * What the assistant proposes to do as you, asked in place (hub.md AI9).
 *
 * It was a modal of grey boxes, one Confirm per action. Now it is a card in the
 * answer's own column: the agent's top edge, "OneCamp AI wants to" with "Acts
 * as you", a title that names the verb and the count ("Create 3 tasks in Q4
 * launch"), the actions as compact rows, the provenance line, and ONE primary
 * button that repeats the verb and the count. Then it says the outcome where it
 * was asked:
 *
 *   running     the button reads "Creating…" and each row ticks to moss as its
 *               result arrives, in order;
 *   done        the card folds to one 40 px row, "Created 3 tasks in Q4 launch";
 *   refused     the frame stays, with an agent-tint band naming the reason and
 *               saying nothing was changed: a refusal is the permission system
 *               working, never the danger red;
 *   partial     the rows that failed carry a danger-ink x with the reason on
 *               hover, and "2 of 3 created · Retry 1" retries only those;
 *   cancelled   a 32 px ink-3 line, "Cancelled · nothing was changed". The
 *               assistant's words above are never rewritten.
 *
 * ⌘↵ (Ctrl+Enter) confirms while the card has focus.
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useExecuteAction, type ProposedAction } from "@/services/aiService";
import { createPostLocally, updateChannelScrollToBottom } from "@/store/slice/channelSlice";
import { createListForTaskInfo, updateTaskDueDateInTaskList, updateTaskStatusInTaskList, updateTaskAssigneeInTaskList } from "@/store/slice/taskInfoSlice";
import { createChat } from "@/store/slice/chatSlice";
import { createGroupChat } from "@/store/slice/groupChatSlice";
import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";
import { UserProfileInterface } from "@/types/user";
import { ArrowUpRight, Bell, Calendar, Check, FileText, Github, Mail, Megaphone, MessageSquare, Shield, Users, X, Zap } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { StatusGlyph } from "@/components/ui/graphics/glyphs";
import { springPop } from "@/lib/celebrate";
import { AiMark } from "@/components/ai/AiMark";

interface ActionConfirmationProps {
    actions: ProposedAction[];
    /** Called when the card is cancelled or dismissed. The message's own text is never touched. */
    onClose?: () => void;
    onActionComplete?: (toolName: string, success: boolean, message: string) => void;
}

/** The verb, the noun and the tenses of each tool, for the title and the button. */
const TOOL_WORDS: Record<string, { verb: string; noun: [string, string]; done: string; running: string }> = {
    create_task: { verb: "Create", noun: ["task", "tasks"], done: "Created", running: "Creating" },
    create_doc: { verb: "Create", noun: ["doc", "docs"], done: "Created", running: "Creating" },
    create_project: { verb: "Create", noun: ["project", "projects"], done: "Created", running: "Creating" },
    send_message: { verb: "Post", noun: ["message", "messages"], done: "Posted", running: "Posting" },
    send_dm: { verb: "Send", noun: ["message", "messages"], done: "Sent", running: "Sending" },
    send_group_chat: { verb: "Send", noun: ["message", "messages"], done: "Sent", running: "Sending" },
    set_reminder: { verb: "Set", noun: ["reminder", "reminders"], done: "Set", running: "Setting" },
    gmail_send: { verb: "Send", noun: ["email", "emails"], done: "Sent", running: "Sending" },
    calendar_create_event: { verb: "Add", noun: ["event", "events"], done: "Added", running: "Adding" },
    github_comment: { verb: "Post", noun: ["comment", "comments"], done: "Posted", running: "Posting" },
    update_task_status: { verb: "Update", noun: ["task", "tasks"], done: "Updated", running: "Updating" },
    set_task_due_date: { verb: "Reschedule", noun: ["task", "tasks"], done: "Rescheduled", running: "Rescheduling" },
    assign_task: { verb: "Assign", noun: ["task", "tasks"], done: "Assigned", running: "Assigning" },
};

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    create_doc: FileText,
    send_message: Megaphone,
    send_dm: MessageSquare,
    send_group_chat: Users,
    set_reminder: Bell,
    gmail_send: Mail,
    calendar_create_event: Calendar,
    github_comment: Github,
};

const isTaskTool = (tool: string) => tool.includes("task");

/** What a row shows: the thing the action makes or touches, in its own words. */
export function actionTitle(a: ProposedAction): string {
    const p = a.params || {};
    return p.task_name || p.title || p.name || p.doc_title || p.subject || p.message || p.text || a.description || a.tool_name;
}

/** Where the actions land, when they all say the same: a project or a channel. */
function actionPlace(actions: ProposedAction[]): string {
    const places = new Set(actions.map((a) => a.params?.project_name || a.params?.project || (a.params?.channel_name ? `#${a.params.channel_name}` : "")));
    return places.size === 1 ? [...places][0] || "" : "";
}

export interface Headline {
    /** "Create 3 tasks". */
    label: string;
    /** "Created 3 tasks". */
    done: string;
    /** "Creating". */
    running: string;
    /** "Q4 launch", when every action names the same place. */
    place: string;
}

/** The title and the button's words: the verb and the count. Pure. */
export function actionHeadline(actions: ProposedAction[]): Headline {
    const n = actions.length;
    const tools = new Set(actions.map((a) => a.tool_name));
    const place = actionPlace(actions);
    const w = tools.size === 1 ? TOOL_WORDS[actions[0].tool_name] : undefined;
    if (w) {
        const noun = w.noun[n === 1 ? 0 : 1];
        return { label: `${w.verb} ${n} ${noun}`, done: `${w.done} ${n} ${noun}`, running: w.running, place };
    }
    const noun = n === 1 ? "action" : "actions";
    return { label: `Run ${n} ${noun}`, done: `Ran ${n} ${noun}`, running: "Running", place };
}

/** A refusal is the permission system answering, not a failure (hub.md AI9). */
export function isRefusal(message: string | undefined): boolean {
    return Boolean(message && /not allowed|not permitted|permission|not a member|forbidden|refused/i.test(message));
}

type Failed = { state: "failed"; message: string; refused: boolean };
type RowState = { state: "running" } | { state: "done"; message: string; resultId?: string } | Failed;

const ActionConfirmation: React.FC<ActionConfirmationProps> = ({ actions, onClose, onActionComplete }) => {
    const { executeAction } = useExecuteAction();
    const dispatch = useDispatch();
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile);
    const [rows, setRows] = useState<Record<number, RowState>>({});
    const [busy, setBusy] = useState(false);
    const [cancelled, setCancelled] = useState(false);
    const doneCheck = useRef<HTMLSpanElement>(null);
    const head = useMemo(() => actionHeadline(actions), [actions]);

    /** The local stores catch up with what the server just did, so the screen shows it without a reload. */
    const reflect = useCallback(
        (action: ProposedAction, data: Record<string, string> | undefined) => {
            const profileData = selfProfile?.data?.data;
            if (data?.tool === "send_message" && profileData) {
                const channelId = data.channel_uuid;
                dispatch(createPostLocally({ channelId, postUUID: data.post_uuid, postText: data.post_text, postCreatedAt: data.post_created_at, postBy: profileData, attachments: [] }));
                dispatch(updateChannelScrollToBottom({ channelId, scrollToBottom: true }));
            }
            if (data?.tool === "send_dm" && profileData) {
                dispatch(
                    createChat({
                        dmId: data.recipient_uuid,
                        chatId: data.chat_uuid,
                        chatText: data.chat_text,
                        chatCreatedAt: data.chat_created_at,
                        chatBy: profileData,
                        chatTo: { user_uuid: data.recipient_uuid, user_name: data.recipient_name, user_profile_object_key: "" },
                        attachments: [],
                    }),
                );
            }
            if (data?.tool === "send_group_chat" && profileData) {
                dispatch(createGroupChat({ grpId: data.grp_id, chatId: data.chat_uuid, chatText: data.chat_text, chatCreatedAt: data.chat_created_at, chatBy: profileData, attachments: [] }));
            }
            if (action.tool_name === "create_task") dispatch(createListForTaskInfo({ tasksInfo: [] }));
            // task_uuid in action_data is the server-reconciled id, so it always matches a row.
            if (data?.tool === "update_task_status" && data.task_uuid) dispatch(updateTaskStatusInTaskList({ taskId: data.task_uuid, value: data.status || "" }));
            if (data?.tool === "set_task_due_date" && data.task_uuid) dispatch(updateTaskDueDateInTaskList({ taskId: data.task_uuid, value: data.due_date || "" }));
            if (data?.tool === "assign_task" && data.task_uuid) {
                dispatch(
                    updateTaskAssigneeInTaskList({
                        taskId: data.task_uuid,
                        assignee: data.assignee_uuid
                            ? { user_uuid: data.assignee_uuid, user_name: data.assignee_name || data.assignee_full_name || "", user_profile_object_key: "" }
                            : undefined,
                    }),
                );
            }
            if (action.tool_name === "set_reminder" && action.params.task_uuid) {
                dispatch(updateTaskDueDateInTaskList({ taskId: action.params.task_uuid, value: action.params.due_date || "" }));
            }
        },
        [dispatch, selfProfile],
    );

    /** Runs the given actions one after another, ticking each row as its answer lands. */
    const run = useCallback(
        async (indexes: number[]) => {
            setBusy(true);
            for (const i of indexes) {
                const action = actions[i];
                setRows((r) => ({ ...r, [i]: { state: "running" } }));
                const result = await executeAction(action.tool_name, action.params);
                if (result?.success) {
                    setRows((r) => ({ ...r, [i]: { state: "done", message: result.message, resultId: result.result_uuid } }));
                    reflect(action, result.action_data);
                } else {
                    const message = result?.message || "Couldn't run this.";
                    setRows((r) => ({ ...r, [i]: { state: "failed", message, refused: isRefusal(message) } }));
                }
                onActionComplete?.(action.tool_name, Boolean(result?.success), result?.message || "");
            }
            setBusy(false);
        },
        [actions, executeAction, reflect, onActionComplete],
    );

    const all = useMemo(() => actions.map((_, i) => i), [actions]);
    const settled = actions.length > 0 && all.every((i) => rows[i] && rows[i].state !== "running");
    const failed = all.filter((i) => rows[i]?.state === "failed");
    const refusal = failed.map((i) => rows[i] as Failed).find((r) => r.refused);
    const retryable = failed.filter((i) => !(rows[i] as Failed).refused);
    const doneCount = all.filter((i) => rows[i]?.state === "done").length;
    const allDone = settled && doneCount === actions.length;

    React.useEffect(() => {
        if (allDone) springPop(doneCheck.current);
    }, [allDone]);

    if (actions.length === 0) return null;

    if (cancelled) {
        return (
            <div data-action-card="cancelled" className="mt-3 flex h-8 items-center gap-2 text-ui-sm text-ink-3">
                <X className="size-3.5" aria-hidden />
                Cancelled · nothing was changed
            </div>
        );
    }

    if (allDone) {
        const only = actions.length === 1 ? rows[0] : undefined;
        const openId = only?.state === "done" && isTaskTool(actions[0].tool_name) ? only.resultId : undefined;
        return (
            <div data-action-card="done" className="mt-3 flex h-10 items-center gap-2.5 rounded-lg px-3 text-ui font-medium shadow-e1" role="status">
                <span ref={doneCheck} className="grid size-4 shrink-0 place-items-center rounded-full bg-camp-moss text-white dark:text-frame">
                    <Check className="size-2.5" aria-hidden />
                </span>
                <span className="min-w-0 truncate">
                    {head.done}
                    {head.place ? ` in ${head.place}` : ""}
                </span>
                {openId ? (
                    <a href={`/app/task/${openId}`} className="ml-auto inline-flex items-center gap-1 text-meta text-ink-2 hover:text-foreground">
                        Open <ArrowUpRight className="size-3" aria-hidden />
                    </a>
                ) : null}
            </div>
        );
    }

    const confirm = () => {
        if (busy) return;
        void run(retryable.length > 0 ? retryable : all.filter((i) => !rows[i]));
    };

    const visible = actions.slice(0, 5);
    return (
        <div
            data-action-card="open"
            className="hub-pop relative mt-3 overflow-hidden rounded-lg bg-raised shadow-e2 before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-[linear-gradient(90deg,var(--agent-a1),var(--agent-a2))]"
            onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    if (!settled) confirm();
                }
            }}
        >
            <div className="flex items-center gap-2 px-3 pt-3 text-meta font-medium text-ink-3">
                <AiMark size={20} />
                OneCamp AI wants to
                <span className="ml-auto inline-flex items-center gap-1 font-normal">
                    <Shield className="size-3 text-agent" aria-hidden />
                    Acts as you
                </span>
            </div>
            <div className="px-3 pb-2.5 pt-1.5 text-body font-semibold leading-[22px] tracking-[-0.012em]" data-action-title="">
                {head.label}
                {head.place ? ` in ${head.place}` : ""}
            </div>
            <div className="mx-3 rounded-[10px] bg-sunken p-1 dark:bg-white/[0.03]">
                {visible.map((a, i) => {
                    const r = rows[i];
                    const Icon = TOOL_ICONS[a.tool_name] ?? Zap;
                    return (
                        <div
                            key={i}
                            data-action-row={r?.state ?? "pending"}
                            className="flex h-8 items-center gap-2.5 px-2 text-ui"
                            title={r?.state === "failed" ? r.message : undefined}
                        >
                            <span className="grid size-4 shrink-0 place-items-center">
                                {r?.state === "done" ? (
                                    <span className="grid size-3.5 place-items-center rounded-full bg-camp-moss text-white motion-safe:animate-spring dark:text-frame">
                                        <Check className="size-2.5" aria-hidden />
                                    </span>
                                ) : r?.state === "failed" ? (
                                    r.refused ? (
                                        <Shield className="size-3.5 text-agent-ink" aria-label="Refused" />
                                    ) : (
                                        <X className="size-3.5 text-danger-ink" aria-label="Failed" />
                                    )
                                ) : isTaskTool(a.tool_name) ? (
                                    <StatusGlyph status="todo" size={16} />
                                ) : (
                                    <Icon className="size-3.5 text-ink-3" />
                                )}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{actionTitle(a)}</span>
                            {a.params?.due_date ? <span className="shrink-0 text-meta text-ink-3">{a.params.due_date}</span> : null}
                        </div>
                    );
                })}
            </div>
            {actions.length > visible.length ? <p className="px-4 pt-1.5 text-meta text-ink-3">+{actions.length - visible.length} more</p> : null}
            <p className="flex items-center gap-1.5 px-3 pt-2 text-meta text-ink-3">
                <Shield className="size-3 text-agent" aria-hidden />
                Can do only what you can · written to your record
            </p>
            {refusal ? (
                <div data-refusal="" className="mt-3 flex items-start gap-2 bg-agent-muted px-3 py-2.5 text-ui-sm text-agent-ink" role="status">
                    <Shield className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>
                        Not allowed: {refusal.message.replace(/^not allowed:?\s*/i, "")}
                        {doneCount === 0 ? " Nothing was changed." : ""}
                    </span>
                </div>
            ) : null}
            <div className="flex items-center gap-2 p-3">
                {settled && failed.length > 0 ? (
                    <>
                        <span className="text-ui-sm text-ink-2" data-partial="">
                            {doneCount} of {actions.length} {head.done.split(" ")[0].toLowerCase()}
                        </span>
                        {retryable.length > 0 ? (
                            <Button size="sm" variant="secondary" onClick={confirm} disabled={busy}>
                                Retry {retryable.length}
                            </Button>
                        ) : null}
                        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onClose?.()}>
                            Dismiss
                        </Button>
                    </>
                ) : (
                    <>
                        <Button size="sm" onClick={confirm} disabled={busy} aria-keyshortcuts="Control+Enter Meta+Enter">
                            {busy ? `${head.running}…` : head.label}
                            {!busy ? <kbd className="kbd ml-1 hidden sm:inline-flex">⌘↵</kbd> : null}
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => {
                                setCancelled(true);
                                onClose?.();
                            }}
                        >
                            Cancel
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
};

export default ActionConfirmation;
