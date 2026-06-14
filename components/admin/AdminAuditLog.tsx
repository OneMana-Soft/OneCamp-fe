"use client"

// AdminAuditLog — a compliance-grade viewer of admin configuration changes:
// who changed which sensitive setting, when, and from where. Secret values are
// never recorded server-side, so this is safe to surface to any admin.

import React, { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FileText, RefreshCw } from "@/lib/icons"
import { getAdminAuditLog, type AuditEntry } from "@/services/settingsService"

const CATEGORY_STYLES: Record<string, string> = {
    settings: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    integration: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
    auth: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    app: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    security: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
}

const FILTERS = ["all", "settings", "integration", "auth", "app", "security"] as const

function formatTime(iso: string): string {
    try {
        return new Date(iso).toLocaleString(undefined, {
            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
        })
    } catch {
        return iso
    }
}

export default function AdminAuditLog() {
    const [entries, setEntries] = useState<AuditEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all")

    const load = (cat: string) => {
        setLoading(true)
        getAdminAuditLog(cat === "all" ? undefined : cat)
            .then(setEntries)
            .catch(() => setEntries([]))
            .finally(() => setLoading(false))
    }

    useEffect(() => {
        load(filter)
    }, [filter])

    return (
        <Card className="border-border/60">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" />
                        <CardTitle className="text-lg font-semibold">Audit log</CardTitle>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => load(filter)} aria-label="Refresh">
                        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    </Button>
                </div>
                <CardDescription>
                    Configuration changes by admins. Secret values are never recorded — only that a change occurred.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-wrap gap-1.5 mb-3">
                    {FILTERS.map((f) => (
                        <Button
                            key={f}
                            size="sm"
                            variant={filter === f ? "default" : "outline"}
                            className="h-7 px-2.5 text-xs capitalize"
                            onClick={() => setFilter(f)}
                        >
                            {f}
                        </Button>
                    ))}
                </div>

                {loading && entries.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
                ) : entries.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">No audit entries yet.</div>
                ) : (
                    <div className="divide-y divide-border/60 max-h-[28rem] overflow-y-auto -mx-2">
                        {entries.map((e) => (
                            <div key={e.id} className="flex items-start gap-3 px-2 py-2.5">
                                <Badge
                                    variant="outline"
                                    className={`text-[10px] capitalize shrink-0 ${CATEGORY_STYLES[e.category] ?? ""}`}
                                >
                                    {e.category}
                                </Badge>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm text-foreground">{e.summary}</p>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">
                                        {e.actor_email || "Unknown"}
                                        {e.ip_address ? ` · ${e.ip_address}` : ""}
                                        {` · ${formatTime(e.created_at)}`}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
