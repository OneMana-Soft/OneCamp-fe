"use client";

import React, { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import { SettingsList, SettingsSection, sectionActionClass, useShake } from "@/components/ui/settingsSection";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUserAvatar } from "@/hooks/useUserAvatar";
import { getNameInitials } from "@/lib/utils/getNameInitials";
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor";
import { displayNameOf } from "@/lib/personName";
import { prefersReducedMotion } from "@/lib/reducedMotion";
import type { UserListResponseInterface, UserProfileDataInterface, UserProfileInterface } from "@/types/user";
import { SavedTick, useSaveStatus } from "@/components/ui/saveStatus";
import { Switch } from "@/components/ui/switch";
import { SpotPlug } from "@/components/ui/graphics";
import { cn } from "@/lib/utils/helpers/cn";
import { apiErrorMessage } from "@/lib/utils/apiError";
import { isZeroEpoch } from "@/lib/utils/validation/isZeroEpoch";
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues";
import { RowMenu, StateWord } from "@/components/admin/connectParts";
import {
    EXAMPLE_SENTENCE,
    WORKFLOWS_DESCRIPTION,
    WorkflowSentence,
    WorkflowsListSkeleton,
    workflowSentence,
    type SentenceNames,
} from "@/components/admin/workflowsParts";
import type { CampHue } from "@/lib/campHue";
import { useFetch } from "@/hooks/useFetch";
import { useEveryChannel } from "@/components/admin/useEveryChannel"
import { GetEndpointUrl } from "@/services/endPoints";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import { Plus, Trash2, Pencil, LayoutTemplate } from "@/lib/icons";
import type { ProjectInfoInterface } from "@/types/project";
import {
    Workflow,
    parseWorkflow,
    parseTaskStatusConfig,
    setWorkflowActive,
    deleteWorkflow,
} from "@/services/workflowService";
import { WorkflowEditDialog } from "./WorkflowEditDialog";
import { PublishTemplateDialog } from "@/components/marketplace/PublishTemplateDialog";

/** "1 run", "3 runs": every run so far (the server counts no week). */
function runsLabel(n: number): string {
    return `${n.toLocaleString("en")} ${n === 1 ? "run" : "runs"}`;
}

/** How many people the owner lookup reads in one go: the admin list's own page size. */
const OWNER_PAGE_SIZE = 100;

/**
 * Who made a workflow, on the admin page: a 20px avatar and their name, from
 * the admin users list. Nothing when they aren't in it (the list is read one
 * page at a time and a departed person may be gone).
 */
function WorkflowOwner({ user }: { user: UserProfileDataInterface }) {
    const { src } = useUserAvatar(user.user_profile_object_key);
    const name = displayNameOf(user);
    return (
        <span data-workflow-owner={user.user_uuid} className="hidden min-w-0 max-w-40 items-center gap-1.5 sm:inline-flex" title={`Made by ${name}`}>
            <Avatar className="size-5 shrink-0">
                <AvatarImage src={src} alt="" />
                <AvatarFallback className={cn("text-3xs font-semibold", getAvatarFallbackClass(name))}>{getNameInitials(name).slice(0, 1)}</AvatarFallback>
            </Avatar>
            <span className="truncate text-xs text-muted-foreground">{name}</span>
        </span>
    );
}

/** How long a failed switch's row stays tinted when motion is reduced (the shake's still version). */
const FLASH_MS = 900;

/**
 * One workflow as a 64px row of the settings card (design v3, admin A16): its
 * name and state, the sentence of what it does with its nouns as neutral
 * tokens, then how often it has run, a switch that saves on change (the saved
 * tick beside the name; on failure the switch springs back and the reason sits
 * under the sentence), and ⋯ for Edit, Save as a template and Delete.
 */
function WorkflowRow({
    wf,
    names,
    onEdit,
    onPublish,
    onDelete,
    onChanged,
    busy,
    owner,
}: {
    wf: Workflow;
    owner?: UserProfileDataInterface;
    names: SentenceNames;
    onEdit: () => void;
    onPublish: () => void;
    onDelete: () => void;
    onChanged: () => void;
    busy: boolean;
}) {
    const { status, run } = useSaveStatus();
    // A failed switch shakes its row (x ±3px twice, §1.6); with reduced motion
    // the row is tinted for a moment instead, held by a timer because the
    // global backstop cuts every animation to nothing.
    const { shake, onAnimationEnd } = useShake(status);
    const [flash, setFlash] = useState(false);
    const failures = status.failures ?? 0;
    useEffect(() => {
        if (!failures || !prefersReducedMotion()) return;
        setFlash(true);
        const t = setTimeout(() => setFlash(false), FLASH_MS);
        return () => clearTimeout(t);
    }, [failures]);
    const [on, setOn] = useState(wf.is_active);
    useEffect(() => setOn(wf.is_active), [wf.is_active]);
    const { keywords, actions } = parseWorkflow(wf);
    const tc = parseTaskStatusConfig(wf);
    const parts = workflowSentence(
        { trigger_type: wf.trigger_type, channel_id: wf.channel_id, keywords, match_type: wf.match_type, actions, task: tc },
        names,
    );
    const toggle = async (next: boolean) => {
        setOn(next);
        const held = await run(() => setWorkflowActive(wf.id, next));
        if (held) onChanged();
        else setOn(!next);
    };
    return (
        <div
            data-workflow-row=""
            data-shake={shake ? "true" : undefined}
            data-flash={flash ? "true" : undefined}
            onAnimationEnd={onAnimationEnd}
            className="set-row cx-wf-row"
        >
            <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5">
                    <span className="min-w-0 truncate text-sm font-medium text-foreground">{wf.name}</span>
                    {!on && <StateWord tone="neutral">Paused</StateWord>}
                    {wf.last_error && <StateWord tone="danger">Last run failed</StateWord>}
                    <SavedTick status={status} />
                </div>
                <WorkflowSentence parts={parts} className="mt-1" />
                {status.state === "error" && status.error && (
                    <p className="mt-1 text-xs text-danger-ink text-pretty">{status.error}</p>
                )}
            </div>
            <div className="flex shrink-0 items-center gap-2 self-center">
                {owner && <WorkflowOwner user={owner} />}
                <span className="hidden text-2xs tabular-nums text-muted-foreground sm:inline">{runsLabel(wf.run_count ?? 0)}</span>
                <Switch
                    checked={on}
                    disabled={busy || status.state === "saving"}
                    aria-busy={status.state === "saving" || undefined}
                    onCheckedChange={(v) => void toggle(v)}
                    aria-label={`Run ${wf.name}`}
                />
                <RowMenu
                    label={`Actions for ${wf.name}`}
                    items={[
                        { label: "Edit", icon: Pencil, onSelect: onEdit },
                        { label: "Save as a template", icon: LayoutTemplate, onSelect: onPublish },
                        { label: "Delete", icon: Trash2, onSelect: onDelete, destructive: true, disabled: busy, separated: true },
                    ]}
                />
            </div>
        </div>
    );
}

/**
 * `hue` is the colour of the place it is shown in: the admin page's AI and
 * automation group by default; a settings page passes its own section's. It
 * colours the empty state's spot, the one hued thing in the list.
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
    scope = "all",
}: {
    hue?: CampHue;
    /**
     * "all" is the admin page: every workflow, each with who made it. "mine"
     * is the personal settings page: only the ones the signed-in person made
     * (the server answers an admin with everyone's).
     */
    scope?: "all" | "mine";
    withTitle?: boolean;
    creating?: boolean;
    onCreatingChange?: (open: boolean) => void;
} = {}) => {
    const { data, isLoading, isError, mutate } = useFetch<{ data: Workflow[] }>(GetEndpointUrl.GetAllWorkflows);
    // The names the sentences use: the editor reads the same two lists, so
    // they are usually cached already.
    // Every channel's name, not the list's first page of 20 (useEveryChannel).
    const { channels } = useEveryChannel();
    const { data: projectData } = useFetch<{ data: ProjectInfoInterface[] }>(GetEndpointUrl.projectListByAdminUID);
    const { toast } = useToast();
    const confirm = useConfirm();
    const [editing, setEditing] = useState<Workflow | null>(null);
    const [creatingHere, setCreatingHere] = useState(false);
    const creating = creatingProp ?? creatingHere;
    const setCreating = onCreatingChange ?? setCreatingHere;
    const [publishing, setPublishing] = useState<Workflow | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    // The admin page names each workflow's maker, from the admin users list;
    // the personal page needs only who is signed in.
    const { data: usersData } = useFetch<UserListResponseInterface>(
        scope === "all" ? `${GetEndpointUrl.GetAdminUserList}?pageIndex=0&pageSize=${OWNER_PAGE_SIZE}` : "",
    );
    const { data: selfData } = useFetch<UserProfileInterface>(scope === "mine" ? GetEndpointUrl.SelfProfile : "");
    const selfUuid = selfData?.data?.user_uuid;
    const owners = useMemo(() => {
        const m = new Map<string, UserProfileDataInterface>();
        for (const u of Array.isArray(usersData?.data) ? usersData.data : []) if (u?.user_uuid) m.set(u.user_uuid, u);
        return m;
    }, [usersData]);

    const all = data?.data || [];
    // Until the signed-in person is known, the personal page lists none rather
    // than someone else's.
    const workflows = scope === "mine" ? all.filter((w) => !!selfUuid && w.created_by === selfUuid) : all;

    const names = useMemo<SentenceNames>(() => {
        const ch = new Map<string, string>();
        for (const c of channels) ch.set(c.ch_uuid, c.ch_name);
        const pr = new Map<string, string>();
        const projects = Array.isArray(projectData?.data) ? projectData.data : [];
        for (const p of projects) if (p?.project_uuid && isZeroEpoch(p.project_deleted_at || "")) pr.set(p.project_uuid, p.project_name);
        return { channel: (id) => ch.get(id), project: (id) => pr.get(id) };
    }, [channels, projectData]);

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
        // The first time there are none: the 96px spot, and an example said
        // in the rows' own grammar, so the empty state teaches how one reads.
        <SettingsList>
            <EmptyState
                tone="accent"
                illustration={<SpotPlug hue={hue} />}
                title="Automate the busywork"
                description={
                    <span className="flex flex-col items-center gap-2">
                        <span>Rules that act when something happens, for example:</span>
                        <WorkflowSentence as="span" parts={EXAMPLE_SENTENCE} className="justify-center" />
                    </span>
                }
                descriptionClassName="max-w-md"
            />
        </SettingsList>
    ) : (
        <SettingsList aria-label="Workflows">
            {workflows.map((wf) => (
                <WorkflowRow
                    key={wf.id}
                    wf={wf}
                    names={names}
                    owner={scope === "all" ? owners.get(wf.created_by) : undefined}
                    busy={busyId === wf.id}
                    onEdit={() => setEditing(wf)}
                    onPublish={() => setPublishing(wf)}
                    onDelete={() => handleDelete(wf)}
                    onChanged={() => void mutate()}
                />
            ))}
        </SettingsList>
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
