"use client"

// PermissionsCard — admin UI for the generic capability-permission policies.
// Each delegatable capability (create workflows, invite members, …) can be
// kept admins-only or opened to all members. Mirrors Slack's Permissions page.

import React, { useEffect, useState } from "react"
import { mutate } from "swr"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { ShieldCheck, Loader2 } from "@/lib/icons"
import { GetEndpointUrl } from "@/services/endPoints"
import {
    listCapabilityPolicies,
    setCapabilityPolicy,
    CAPABILITY_META,
    type CapabilityPolicy,
} from "@/services/capabilityService"

export default function PermissionsCard() {
    const { toast } = useToast()
    const [policies, setPolicies] = useState<CapabilityPolicy[]>([])
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState<string | null>(null)

    const load = () => {
        setLoading(true)
        listCapabilityPolicies()
            .then(setPolicies)
            .catch(() => toast({ title: "Couldn't load permissions", variant: "destructive" }))
            .finally(() => setLoading(false))
    }

    useEffect(() => {
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleToggle = async (capability: string, allMembers: boolean) => {
        const next = allMembers ? "all_members" : "admins_only"
        setBusy(capability)
        // Optimistic update.
        setPolicies((prev) =>
            prev.map((p) => (p.capability === capability ? { ...p, policy: next } : p)),
        )
        try {
            await setCapabilityPolicy(capability, next)
            toast({ title: "Permission updated" })
            // Refresh the current user's resolved capability set so any gated UI
            // (e.g. the Agents page) reflects the change immediately, not after a
            // focus/reload.
            mutate(GetEndpointUrl.MyCapabilities)
        } catch {
            // Roll back on failure; interceptor shows the error.
            setPolicies((prev) =>
                prev.map((p) =>
                    p.capability === capability
                        ? { ...p, policy: allMembers ? "admins_only" : "all_members" }
                        : p,
                ),
            )
        } finally {
            setBusy(null)
        }
    }

    return (
        <Card className="border-border/60">
            <CardHeader className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-lg">
                    <ShieldCheck className="h-5 w-5 text-emerald-500" />
                    Member permissions
                </CardTitle>
                <CardDescription className="max-w-xl">
                    Choose which capabilities members can use on their own. Off means
                    admins only. Members always act within their own access — opening a
                    capability never lets anyone exceed what they could already do.
                </CardDescription>
            </CardHeader>

            <CardContent>
                {loading ? (
                    <div className="flex items-center justify-center py-10 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                ) : (
                    <div className="divide-y divide-border/60">
                        {policies.map((p) => {
                            const meta = CAPABILITY_META[p.capability] || {
                                label: p.capability,
                                description: "",
                            }
                            const allMembers = p.policy === "all_members"
                            return (
                                <div
                                    key={p.capability}
                                    className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0"
                                >
                                    <div className="min-w-0 space-y-0.5">
                                        <Label className="text-sm font-medium">{meta.label}</Label>
                                        <p className="text-xs text-muted-foreground">{meta.description}</p>
                                        <p className="text-[11px] font-medium text-muted-foreground/80">
                                            {allMembers ? "All members" : "Admins only"}
                                        </p>
                                    </div>
                                    <Switch
                                        checked={allMembers}
                                        disabled={busy === p.capability}
                                        onCheckedChange={(v) => handleToggle(p.capability, v)}
                                        aria-label={`Allow all members: ${meta.label}`}
                                    />
                                </div>
                            )
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
