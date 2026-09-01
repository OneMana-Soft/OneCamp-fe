"use client"

// GuestAccessCard — admin governance for scoped guest access.
//
// Guest access is OFF by default. While off, no guest link can be created or
// used. When on, members can start instant meetings with shareable guest
// links; admins can see and revoke active grants here. Guests are never
// members and never appear in rosters, search, or memory.

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { UserPlus, Loader2, Clock, FileText, Table as TableIcon, Video, Kanban, ExternalLink } from "@/lib/icons"
import { getWorkspaceSettings } from "@/services/settingsService"
import { setGuestAccess, listGuestGrants, revokeGuestGrant, type GuestGrant } from "@/services/guestService"
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
}

function resourceMeta(type: string) {
    return RESOURCE_META[type] || { label: type, Icon: FileText }
}

export default function GuestAccessCard() {
    const { toast } = useToast()
    const confirm = useConfirm()

    const [enabled, setEnabled] = useState(false)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [grants, setGrants] = useState<GuestGrant[]>([])
    const [grantsLoading, setGrantsLoading] = useState(false)
    const [revoking, setRevoking] = useState<string | null>(null)

    const loadGrants = () => {
        setGrantsLoading(true)
        listGuestGrants()
            .then(setGrants)
            .catch(() => setGrants([]))
            .finally(() => setGrantsLoading(false))
    }

    useEffect(() => {
        getWorkspaceSettings()
            .then((s) => setEnabled(!!s?.guest_access_enabled))
            .catch(() => toast({ title: "Couldn't load guest settings", variant: "destructive" }))
            .finally(() => setLoading(false))
        loadGrants()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const toggle = async (next: boolean) => {
        setSaving(true)
        // optimistic
        setEnabled(next)
        try {
            const applied = await setGuestAccess(next)
            setEnabled(applied)
            toast({ title: applied ? "Guest access enabled" : "Guest access disabled" })
            if (applied) loadGrants()
        } catch {
            setEnabled(!next)
            toast({ title: "Failed to update guest access", variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    const revoke = (id: string) => {
        confirm({
            title: "Revoke guest link?",
            description: "Anyone holding this link will immediately lose access.",
            confirmText: "Revoke",
            onConfirm: async () => {
                setRevoking(id)
                try {
                    await revokeGuestGrant(id)
                    setGrants((prev) => prev.filter((g) => g.id !== id))
                    toast({ title: "Guest link revoked" })
                } catch {
                    toast({ title: "Failed to revoke", variant: "destructive" })
                } finally {
                    setRevoking(null)
                }
            },
        })
    }

    return (
        <Card className="border-border/60">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg font-semibold">Guest access</CardTitle>
                </div>
                <CardDescription>
                    Let members share a single doc, board, table, or meeting with external people (clients,
                    contractors) via a scoped, expiring, read-only link. Guests get no account and never appear
                    in your workspace. Off by default.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <div className="flex items-center justify-between rounded-lg border border-border bg-card/50 p-4">
                    <div className="pr-4">
                        <h3 className="text-sm font-semibold">Allow guest links</h3>
                        <p className="text-xs text-muted-foreground">
                            When off, no guest link can be created or used.
                        </p>
                    </div>
                    {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                        <Switch checked={enabled} disabled={saving} onCheckedChange={toggle} />
                    )}
                </div>

                {enabled && (
                    <div>
                        <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Active guest links
                        </h3>
                        {grantsLoading ? (
                            <div className="flex items-center justify-center py-6 text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                            </div>
                        ) : grants.length === 0 ? (
                            <p className="rounded-lg border border-border/50 bg-card/30 px-3 py-4 text-center text-xs text-muted-foreground">
                                No active guest links.
                            </p>
                        ) : (
                            <ul className="divide-y divide-border/50 rounded-lg border border-border/50 bg-card/30">
                                {grants.map((g) => {
                                    const meta = resourceMeta(g.resource_type)
                                    const Icon = meta.Icon
                                    const href = meta.href?.(g.resource_id)
                                    return (
                                    <li key={g.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                                        <div className="flex min-w-0 items-center gap-2.5">
                                            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                                                <Icon className="h-3.5 w-3.5" />
                                            </span>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 text-sm">
                                                    <span className="font-medium">{meta.label}</span>
                                                    <Badge variant="secondary" size="sm" caps className="rounded">
                                                        {g.capability}
                                                    </Badge>
                                                </div>
                                                <div className="mt-0.5 flex items-center gap-1 text-2xs text-muted-foreground">
                                                    <Clock className="h-3 w-3" />
                                                    expires {formatDistanceToNow(new Date(g.expires_at), { addSuffix: true })}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1.5">
                                            {href && (
                                                <a
                                                    href={href}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                                                    title={`Open this ${meta.label.toLowerCase()}`}
                                                >
                                                    <ExternalLink className="h-3.5 w-3.5" /> Open
                                                </a>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="outline"
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
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
