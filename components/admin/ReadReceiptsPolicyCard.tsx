"use client"

// The workspace's read receipts: on (each person can turn theirs off), or
// off for everyone. On by default, as in Teams and Zulip.

import { useState } from "react"
import { SettingsList, SettingsSection, SwitchRow } from "@/components/ui/settingsSection"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { setReadReceiptsPolicy, useWorkspaceSettings, type WorkspaceSettings } from "@/services/settingsService"

export default function ReadReceiptsPolicyCard() {
    const { toast } = useToast()
    // The workspace's settings, read once for every card that shows a part of
    // them. The switch is never drawn from a guess: a failed read used to leave
    // it at its default, on, beside a toast that soon left.
    const { settings, isLoading, isError, mutate } = useWorkspaceSettings()
    // The value being saved, shown at once; null once the server has answered.
    const [pending, setPending] = useState<boolean | null>(null)
    const [saving, setSaving] = useState(false)
    const enabled = pending ?? (settings ? settings.read_receipts_enabled !== false : null)

    const toggle = async (next: boolean) => {
        setSaving(true)
        setPending(next)
        try {
            const applied = await setReadReceiptsPolicy(next)
            await mutate(
                (d) => (d?.data ? { ...d, data: { ...d.data, read_receipts_enabled: applied } as WorkspaceSettings } : d),
                { revalidate: false },
            )
            toast({ title: applied ? "Read receipts on" : "Read receipts off" })
        } catch (e) {
            toast({ title: "Couldn't change read receipts", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
        } finally {
            // Back to what the server holds: the saved value, or the old one.
            setPending(null)
            setSaving(false)
        }
    }

    const failed = isError || (!isLoading && !settings)

    return (
        <SettingsSection
            title="Read receipts"
            description={
                <>
                    In DMs and group chats of up to 20 people, show “Seen” under a person&apos;s latest message once the
                    others have read it. Each person can turn theirs off in their notification settings. Changes save as
                    you make them.
                </>
            }
        >
            {failed ? (
                <ErrorState compact subject="the read receipts setting" onRetry={() => void mutate()} />
            ) : enabled === null ? (
                <SettingsList>
                    <div aria-busy="true" aria-label="Loading the read receipts setting" className="flex items-start justify-between gap-4 px-4 py-3">
                        <div className="space-y-1.5">
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="h-3 w-64 max-w-full" />
                        </div>
                        <Skeleton className="mt-0.5 h-5 w-9" />
                    </div>
                </SettingsList>
            ) : (
                <SettingsList>
                    <SwitchRow
                        label="Allow read receipts"
                        description="When off, nobody sees who has read their messages."
                        checked={enabled}
                        disabled={saving}
                        onChange={(v) => void toggle(v)}
                    />
                </SettingsList>
            )}
        </SettingsSection>
    )
}
