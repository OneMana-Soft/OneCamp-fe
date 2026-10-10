"use client"

// PermissionsCard — admin UI for the generic capability-permission policies.
// Each delegatable capability (create workflows, invite members, …) can be
// kept admins-only or opened to all members. Mirrors Slack's Permissions page.

import { useEffect, useState } from "react"
import { appMutate as mutate } from "@/lib/swrMutate";
import { SettingsList, SettingsSection, SwitchRow } from "@/components/ui/settingsSection"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"

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
    // A failed load is said as such: it left the section blank under its
    // heading, beside a toast that soon left, with nothing to do about it.
    const [failed, setFailed] = useState(false)
    const [busy, setBusy] = useState<string | null>(null)

    const load = () => {
        setLoading(true)
        setFailed(false)
        listCapabilityPolicies()
            .then(setPolicies)
            .catch(() => setFailed(true))
            .finally(() => setLoading(false))
    }

    useEffect(() => {
        load()
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
            const label = CAPABILITY_META[capability]?.label ?? capability
            toast({ title: allMembers ? `${label}: every member can now` : `${label}: admins only now` })
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

    let body: React.ReactNode
    if (loading) {
        body = (
            <SettingsList>
                {Array.from({ length: 4 }).map((_, i) => (
                    <div
                        key={i}
                        aria-busy={i === 0 ? "true" : undefined}
                        aria-label={i === 0 ? "Loading the member permissions" : undefined}
                        aria-hidden={i === 0 ? undefined : "true"}
                        className="flex items-start justify-between gap-4 px-4 py-3"
                    >
                        <div className="space-y-1.5">
                            <Skeleton className={i % 2 === 0 ? "h-4 w-36" : "h-4 w-44"} />
                            <Skeleton className="h-3 w-72 max-w-full" />
                        </div>
                        <Skeleton className="mt-0.5 h-5 w-9" />
                    </div>
                ))}
            </SettingsList>
        )
    } else if (failed) {
        body = <ErrorState subject="the member permissions" onRetry={load} />
    } else {
        body = (
            // One rhythm: each permission is a switch row named by its label,
            // so clicking the words toggles it, as Settings does.
            <SettingsList>
                {policies.map((p) => {
                    const meta = CAPABILITY_META[p.capability] || {
                        label: p.capability,
                        description: "",
                    }
                    const allMembers = p.policy === "all_members"
                    return (
                        <SwitchRow
                            key={p.capability}
                            label={meta.label}
                            description={
                                <>
                                    {meta.description}
                                    <span className="mt-1 block font-medium text-foreground/80">
                                        {allMembers ? "All members can" : "Admins only"}
                                    </span>
                                </>
                            }
                            checked={allMembers}
                            disabled={busy === p.capability}
                            onChange={(v) => void handleToggle(p.capability, v)}
                        />
                    )
                })}
            </SettingsList>
        )
    }

    return (
        <SettingsSection
            title="Member permissions"
            description="Choose which capabilities members can use on their own. Off means admins only. Members always act within their own access: opening a capability never lets anyone exceed what they could already do. Changes save as you make them."
        >
            {body}
        </SettingsSection>
    )
}
