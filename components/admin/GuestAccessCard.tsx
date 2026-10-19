"use client"

// GuestAccessCard — admin governance for scoped guest access.
//
// Guest access is OFF by default. While off, no guest link can be created or
// used; the links already made are kept, listed here, and work again when it
// is turned back on, so turning it on says how many first. Admins can see and
// revoke links either way. Guests are never members and never appear in
// rosters, search, or memory.
//
// Design v3 (admin A8): one card. The switch row saves on change with the
// saved tick; the links are rows under it in the same card, and turning
// guest access on reveals them (fade and y −4, 30ms apart, no height
// animation). A link's type is a neutral 32px glyph tile on sunken, never a
// hue: a category is not identity (§1.5).
//
// The spec's sub-rows for a default guest expiry and "Guests can post" have
// no setting on the server: whoever shares a link chooses both per link.

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { SettingsCard, SettingsCardError, SettingsRowsSkeleton, SettingsSection, SwitchRow } from "@/components/ui/settingsSection"
import { useSaveStatus } from "@/components/ui/saveStatus"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { Clock, FileText, Table as TableIcon, Video, Kanban, ExternalLink, Hash, FolderKanban, Link2 } from "@/lib/icons"
import { useWorkspaceSettings, type WorkspaceSettings } from "@/services/settingsService"
import { setGuestAccess, listGuestGrants, revokeGuestGrant, type GuestGrant } from "@/services/guestService"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { formatDistanceToNow } from "date-fns"
import { NEUTRAL_TILE } from "@/components/admin/neutralTile"
import { tablePath } from "@/lib/tables/route"

// Per-resource-type display: a friendly label, an icon, and (for resources that
// have an in-app page) a link an admin can open to see what was shared.
const RESOURCE_META: Record<
    string,
    { label: string; Icon: typeof FileText; href?: (id: string) => string }
> = {
    doc: { label: "Document", Icon: FileText, href: (id) => `/app/doc/${id}` },
    board: { label: "Board", Icon: Kanban, href: (id) => `/app/board/${id}` },
    table: { label: "Table", Icon: TableIcon, href: (id) => tablePath(id) },
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
    const { status, run } = useSaveStatus()
    const enabled = pending ?? (settings ? !!settings.guest_access_enabled : null)
    const failed = isError || (!isLoading && !settings)
    const [grants, setGrants] = useState<GuestGrant[]>([])
    const [grantsLoading, setGrantsLoading] = useState(false)
    const [grantsFailed, setGrantsFailed] = useState(false)
    const [revoking, setRevoking] = useState<string | null>(null)
    // Set when the person turns it on here, so the rows step in; a page that
    // opens with it on shows them still.
    const [revealed, setRevealed] = useState(false)

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
        setPending(next)
        const ok = await run(async () => {
            const applied = await setGuestAccess(next)
            await mutate(
                (d) => (d?.data ? { ...d, data: { ...d.data, guest_access_enabled: applied } as WorkspaceSettings } : d),
                { revalidate: false },
            )
            if (applied) {
                setRevealed(true)
                loadGrants()
            }
        })
        if (!ok) setRevealed(false)
        // Back to what the server holds: the saved value, or the old one.
        setPending(null)
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

    const reveal = (i: number) =>
        revealed && enabled ? { className: "cfg-reveal", style: { "--i": i } as React.CSSProperties } : { className: "", style: undefined }

    let links: React.ReactNode
    if (grantsLoading && grants.length === 0) {
        links = (
            <div aria-busy="true" aria-label="Loading the guest links" className="contents">
                {[0, 1].map((i) => (
                    <div key={i} aria-hidden="true" className="set-row flex items-center gap-3">
                        <Skeleton className="size-8 shrink-0 rounded-md" />
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-3.5 w-36" />
                            <Skeleton className="h-3 w-28" />
                        </div>
                    </div>
                ))}
            </div>
        )
    } else if (grantsFailed) {
        links = <SettingsCardError what="the guest links" onRetry={loadGrants} />
    } else if (grants.length === 0) {
        links = (
            <div {...reveal(1)} data-guest-empty="" >
                <div className="set-row flex items-center gap-3">
                    <span aria-hidden="true" className={NEUTRAL_TILE}>
                        <Link2 className="size-4" />
                    </span>
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{enabled ? "No active guest links" : "No guest links"}</p>
                        <p className="text-xs text-muted-foreground text-pretty">A link a member shares shows here, with what it allows and when it ends.</p>
                    </div>
                </div>
            </div>
        )
    } else {
        links = (
            <ul aria-label="Guest links" className="set-rows">
                {grants.map((g, i) => {
                    const meta = resourceMeta(g.resource_type)
                    const Icon = meta.Icon
                    const href = meta.href?.(g.resource_id)
                    const r = reveal(i + 1)
                    return (
                        <li key={g.id} data-guest-link="" className={`set-row flex items-center justify-between gap-3 ${r.className}`} style={r.style}>
                            <div className="flex min-w-0 items-center gap-3">
                                <span aria-hidden="true" className={NEUTRAL_TILE}>
                                    <Icon className="size-4" />
                                </span>
                                <div className="min-w-0 space-y-0.5">
                                    <div className="flex items-center gap-2 text-sm">
                                        <span className="font-medium text-foreground">{meta.label}</span>
                                        <span className="chip">{capabilityLabel(g.capability)}</span>
                                    </div>
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <Clock className="size-3 text-ink-3" aria-hidden="true" />
                                        {g.expires_at
                                            ? `Expires ${formatDistanceToNow(new Date(g.expires_at), { addSuffix: true })}`
                                            : "Doesn't expire"}
                                    </div>
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                                {href && (
                                    <Button asChild variant="ghost" size="sm">
                                        <a href={href} target="_blank" rel="noopener noreferrer" title={`Open this ${meta.label.toLowerCase()}`}>
                                            <ExternalLink aria-hidden="true" /> Open
                                        </a>
                                    </Button>
                                )}
                                <Button size="sm" variant="secondary" disabled={revoking === g.id} onClick={() => revoke(g.id)}>
                                    {revoking === g.id ? "Revoking…" : "Revoke"}
                                </Button>
                            </div>
                        </li>
                    )
                })}
            </ul>
        )
    }

    return (
        <SettingsSection
            id="security-guests"
            title="Guest access"
            description="Members can share one doc, board, table, channel, project or meeting with people outside the workspace through a link. Guests get no account. Changes save as you make them."
        >
            <SettingsCard>
                {failed ? (
                    <SettingsCardError what="the guest access setting" onRetry={() => void mutate()} />
                ) : enabled === null ? (
                    <div aria-label="Loading the guest access setting" className="contents">
                        <SettingsRowsSkeleton rows={1} />
                    </div>
                ) : (
                    <>
                        <SwitchRow
                            label="Allow guest links"
                            description="When off, no guest link can be created or used. Links already made are kept."
                            checked={enabled}
                            disabled={status.state === "saving"}
                            status={status}
                            onChange={toggle}
                        />
                        <div {...reveal(0)} className={`set-row flex min-h-0 items-center py-2.5 ${reveal(0).className}`}>
                            <h3 className="text-xs font-medium text-muted-foreground">
                                {enabled ? "Active guest links" : "Guest links, paused while guest access is off"}
                            </h3>
                        </div>
                        {links}
                    </>
                )}
            </SettingsCard>
        </SettingsSection>
    )
}
