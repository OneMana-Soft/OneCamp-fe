"use client"

// PermissionsCard — admin UI for the generic capability-permission policies.
// Each delegatable capability (create workflows, invite members, …) can be
// kept admins-only or opened to all members. Mirrors Slack's Permissions page.
//
// Design v3 (admin A9): each row asks "who", so its control is a segmented
// "Admins · Everyone", not an on/off switch with a third line repeating the
// switch's state. It saves on change with the saved tick; a refusal slides
// the thumb back and says why under the label. The note above the card says
// what opening a capability never does, with the shield in the agent hue
// because it names agents.

import { useEffect, useState } from "react"
import { appMutate as mutate } from "@/lib/swrMutate"
import { SettingRow, SettingsCard, SettingsCardError, SettingsRowsSkeleton, SettingsSection } from "@/components/ui/settingsSection"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { useSaveStatus } from "@/components/ui/saveStatus"
import { ShieldCheck } from "@/lib/icons"

import { GetEndpointUrl } from "@/services/endPoints"
import {
    listCapabilityPolicies,
    setCapabilityPolicy,
    CAPABILITY_META,
    type CapabilityPolicy,
} from "@/services/capabilityService"

type Who = "admins_only" | "all_members"

const WHO_OPTIONS = [
    { value: "admins_only", label: "Admins" },
    { value: "all_members", label: "Everyone" },
] as const

function PermissionRow({ policy, onSaved }: { policy: CapabilityPolicy; onSaved: (who: Who) => void }) {
    const meta = CAPABILITY_META[policy.capability] || { label: policy.capability, description: "" }
    const saved: Who = policy.policy === "all_members" ? "all_members" : "admins_only"
    // Shown at once while it saves; back to the saved value on a refusal.
    const [pending, setPending] = useState<Who | null>(null)
    const { status, run } = useSaveStatus()
    const id = `permission-${policy.capability.replace(/[^\w-]/g, "-")}`

    const choose = async (who: Who): Promise<boolean> => {
        setPending(who)
        const ok = await run(() => setCapabilityPolicy(policy.capability, who), {
            what: `${meta.label}: ${WHO_OPTIONS.find((o) => o.value === who)?.label}`,
            undo: () => choose(saved),
        })
        if (ok) {
            onSaved(who)
            // Refresh the current user's resolved capability set so any gated UI
            // (e.g. the Agents page) reflects the change immediately.
            mutate(GetEndpointUrl.MyCapabilities)
        }
        setPending(null)
        return ok
    }

    return (
        <SettingRow label={meta.label} description={meta.description} controlId={id} status={status}>
            <SegmentedControl
                id={id}
                aria-label={meta.label}
                aria-describedby={`${id}-desc`}
                value={pending ?? saved}
                onValueChange={(v) => v !== saved && void choose(v as Who)}
                options={WHO_OPTIONS}
                disabled={status.state === "saving"}
            />
        </SettingRow>
    )
}

export default function PermissionsCard() {
    const [policies, setPolicies] = useState<CapabilityPolicy[]>([])
    const [loading, setLoading] = useState(true)
    // A failed load is said as such: it left the section blank under its
    // heading, beside a toast that soon left, with nothing to do about it.
    const [failed, setFailed] = useState(false)

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

    const store = (capability: string, who: Who) =>
        setPolicies((prev) => prev.map((p) => (p.capability === capability ? { ...p, policy: who } : p)))

    let body: React.ReactNode
    if (loading) {
        body = (
            <SettingsCard aria-label="Loading the member permissions">
                <SettingsRowsSkeleton rows={4} control="button" />
            </SettingsCard>
        )
    } else if (failed) {
        body = (
            <SettingsCard>
                <SettingsCardError what="the member permissions" onRetry={load} />
            </SettingsCard>
        )
    } else {
        body = (
            <SettingsCard>
                {policies.map((p) => (
                    <PermissionRow key={p.capability} policy={p} onSaved={(who) => store(p.capability, who)} />
                ))}
            </SettingsCard>
        )
    }

    return (
        <SettingsSection
            title="Member permissions"
            description="Who can use each capability on their own. Changes save as you make them."
        >
            <p data-permissions-note="" className="flex items-center gap-2 text-xs text-muted-foreground text-pretty">
                <ShieldCheck className="size-4 shrink-0 text-agent-ink" aria-hidden="true" />
                Members always act within their own access. Agents act within their sponsor&apos;s.
            </p>
            {body}
        </SettingsSection>
    )
}
