"use client"

// GuestAccessCard — admin governance for scoped guest access.
//
// Guest access is OFF by default. While off, no guest link can be created or
// used; the links already made are kept, listed here, and work again when it
// is turned back on, so turning it on says how many first. Admins can see and
// revoke links either way. Guests are never members and never appear in
// rosters, search, or memory.

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Tile } from "@/components/ui/graphics/Tile"
import { SettingsList, SettingsSection, SwitchRow } from "@/components/ui/settingsSection"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { Clock, FileText, Table as TableIcon, Video, Kanban, ExternalLink, Hash, FolderKanban, Link2 } from "@/lib/icons"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { useWorkspaceSettings, type WorkspaceSettings } from "@/services/settingsService"
import { setGuestAccess, listGuestGrants, revokeGuestGrant, type GuestGrant } from "@/services/guestService"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { formatDistanceToNow } from "date-fns"

// Per-resource-type display: a friendly label, an icon, and (for resources that
// have an in-app page) a link an admin can open to see what was shared.
const RESOURCE_META: Record<
    string,
    { label: string; Icon: typeof FileText; href?: (id: string) => string }
> = {
    doc: { label: "Document", Icon: FileText, href: (id) => `/app/doc/${id}` },
    board: { label: "Board", Icon: Kanban, href: (id) => `/app/board/${id}` },
    table: { label: "Table", Icon: TableIcon, href: (id) => `/app/tables/${id}` },
    meeting: { label: "Meeting", Icon: Video },
    channel: { label: "Channel", Icon: Hash, href: (id) => `/app/channel/${id}` },
    project: { label: "Project", Icon: FolderKanban, href: (id) => `/app/project/${id}` },
}

function resourceMeta(type: string) {
    return RESOURCE_META[type] || { label: type, Icon: FileText }
}

/** What a link lets its holder do, from their side: "Can comment", not "comment". */
const CAPABILITY: Record<string, string> = {
    view: "Can read",
    read: "Can read",
    comment: "Can comment",
    post: "Can post",
    approve: "Can approve",
}
const capabilityLabel = (c: string) => CAPABILITY[c] ?? `Can ${c}`

/** The links' list: hairline rows, the admin page's one list. */
const LIST = "divide-y divide-border rounded-lg border border-border"

// The rows' own shape: a 32px tile, two lines, and the two buttons.
function GrantsSkeleton() {
    return (
        <ul aria-busy="true" aria-label="Loading the guest links" className={LIST}>
            {Array.from({ length: 2 }).map((_, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3" aria-hidden="true">
                    <Skeleton className="size-8 shrink-0 rounded-lg" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-3.5 w-36" />
                        <Skeleton className="h-3 w-28" />
                    </div>
                    <Skeleton className="h-8 w-36 shrink-0" />
                </li>
            ))}
        </ul>
    )
}

export default function GuestAccessCard() {
    const { toast } = useToast()
    const confirm = useConfirm()

    // The workspace's settings, read once for every card that shows a part of
    // them. The switch is never drawn from a guess: a failed read used to leave
    // it at off, its default, beside a toast that soon left, and an admin would
    // "turn on" something already on.
    const { settings, isLoading, isError, mutate } = useWorkspaceSettings()
    // The value being saved, shown at once; null once the server has answered.
    const [pending, setPending] = useState<boolean | null>(null)
    const [saving, setSaving] = useState(false)
    const enabled = pending ?? (settings ? !!settings.guest_access_enabled : null)
    const failed = isError || (!isLoading && !settings)
    const [grants, setGrants] = useState<GuestGrant[]>([])
    const [grantsLoading, setGrantsLoading] = useState(false)
    const [grantsFailed, setGrantsFailed] = useState(false)
    const [revoking, setRevoking] = useState<string | null>(null)

    const loadGrants = () => {
        setGrantsLoading(true)
        listGuestGrants()
            .then((list) => {
                setGrants(list)
                setGrantsFailed(false)
            })
            .catch(() => setGrantsFailed(true))
            .finally(() => setGrantsLoading(false))
    }

    useEffect(() => {
        loadGrants()
    }, [])

    const apply = async (next: boolean) => {
        setSaving(true)
        setPending(next)
        try {
            const applied = await setGuestAccess(next)
            await mutate(
                (d) => (d?.data ? { ...d, data: { ...d.data, guest_access_enabled: applied } as WorkspaceSettings } : d),
                { revalidate: false },
            )
            toast({ title: applied ? "Guest access on" : "Guest access off" })
            if (applied) loadGrants()
        } catch (e) {
            toast({ title: "Couldn't change guest access", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
        } finally {
            // Back to what the server holds: the saved value, or the old one.
            setPending(null)
            setSaving(false)
        }
    }

    // Turning it back on wakes every link made before, so it says how many.
    const toggle = (next: boolean) => {
        const waking = grants.length
        if (!next || (waking === 0 && !grantsFailed)) {
            void apply(next)
            return
        }
        confirm({
            title: "Turn guest access back on?",
            description: grantsFailed
                ? "Any guest links made before will work again."
                : `${waking} guest ${waking === 1 ? "link" : "links"} made before will work again. Revoke any you no longer want first.`,
            confirmText: "Turn on",
            onConfirm: () => void apply(true),
        })
    }

    const revoke = (id: string) => {
        confirm({
            title: "Revoke this guest link?",
            description: "Anyone holding it loses access immediately. This can't be undone, but you can make a new link.",
            confirmText: "Revoke link",
            destructive: true,
            onConfirm: async () => {
                setRevoking(id)
                try {
                    await revokeGuestGrant(id)
                    setGrants((prev) => prev.filter((g) => g.id !== id))
                    toast({ title: "Guest link revoked" })
                } catch (e) {
                    toast({ title: "Couldn't revoke the link", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
                } finally {
                    setRevoking(null)
                }
            },
        })
    }

    return (
        <SettingsSection
            title="Guest access"
            description={
                <>
                    Let members share one doc, board, table, channel, project or meeting with people outside the workspace
                    (clients, contractors) through a link. Whoever shares it chooses what the link allows (reading,
                    commenting, posting in a channel, approving tasks) and when it ends, if ever. Guests get no account and
                    never appear in your workspace. Off by default. Changes save as you make them.
                </>
            }
        >
            {failed ? (
                <ErrorState compact subject="the guest access setting" onRetry={() => void mutate()} />
            ) : enabled === null ? (
                <SettingsList>
                    <div aria-busy="true" aria-label="Loading the guest access setting" className="flex items-start justify-between gap-4 px-4 py-3">
                        <div className="space-y-1.5">
                            <Skeleton className="h-4 w-36" />
                            <Skeleton className="h-3 w-72 max-w-full" />
                        </div>
                        <Skeleton className="mt-0.5 h-5 w-9" />
                    </div>
                </SettingsList>
            ) : (
                <>
                    <SettingsList>
                        <SwitchRow
                            label="Allow guest links"
                            description="When off, no guest link can be created or used. Links already made are kept, and work again when it's turned back on."
                            checked={enabled}
                            disabled={saving}
                            onChange={toggle}
                        />
                    </SettingsList>

                    {/* A section of its own under the switch, in sentence case. */}
                    <SettingsSection level={3} title={enabled ? "Active guest links" : "Guest links, paused while guest access is off"} className="pt-3">
                        {grantsLoading && grants.length === 0 ? (
                            <GrantsSkeleton />
                        ) : grantsFailed ? (
                            <ErrorState compact subject="the guest links" onRetry={loadGrants} />
                        ) : grants.length === 0 ? (
                            <EmptyState
                                icon={Link2}
                                hue={ADMIN_GROUP_HUE.workspace}
                                title={enabled ? "No active guest links" : "No guest links"}
                                description="A link a member shares shows here, with what it allows and when it ends, so you can revoke it."
                            />
                        ) : (
                            <ul className={LIST}>
                                {grants.map((g) => {
                                    const meta = resourceMeta(g.resource_type)
                                    const Icon = meta.Icon
                                    const href = meta.href?.(g.resource_id)
                                    return (
                                        <li key={g.id} className="flex items-center justify-between gap-3 px-4 py-3">
                                            <div className="flex min-w-0 items-center gap-3">
                                                {/* The workspace group's hue, as the admin menu draws Security. */}
                                                <Tile hue={ADMIN_GROUP_HUE.workspace} size="md">
                                                    <Icon />
                                                </Tile>
                                                <div className="min-w-0 space-y-0.5">
                                                    <div className="flex items-center gap-2 text-sm">
                                                        <span className="font-medium">{meta.label}</span>
                                                        <Badge variant="secondary" size="sm" className="rounded-sm">
                                                            {capabilityLabel(g.capability)}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                        <Clock className="h-3 w-3" aria-hidden="true" />
                                                        {g.expires_at
                                                            ? `Expires ${formatDistanceToNow(new Date(g.expires_at), { addSuffix: true })}`
                                                            : "Doesn't expire"}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-2">
                                                {href && (
                                                    <Button asChild variant="outline" size="sm" className="h-8 gap-1.5">
                                                        <a
                                                            href={href}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            title={`Open this ${meta.label.toLowerCase()}`}
                                                        >
                                                            <ExternalLink aria-hidden="true" /> Open
                                                        </a>
                                                    </Button>
                                                )}
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8"
                                                    disabled={revoking === g.id}
                                                    onClick={() => revoke(g.id)}
                                                >
                                                    {revoking === g.id ? "Revoking…" : "Revoke"}
                                                </Button>
                                            </div>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                    </SettingsSection>
                </>
            )}
        </SettingsSection>
    )
}
