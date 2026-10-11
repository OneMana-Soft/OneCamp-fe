"use client"

// The workspace's read receipts: on (each person can turn theirs off), or
// off for everyone. On by default, as in Teams and Zulip.
//
// Design v3 (admin A7): one switch row that saves on change and says "Saved"
// beside its label; a refusal puts the switch back, shakes the row and leaves
// the server's reason under the label. No toast for a routine save.

import { useState } from "react"
import { SettingsCard, SettingsCardError, SettingsRowsSkeleton, SettingsSection, SwitchRow } from "@/components/ui/settingsSection"
import { useSaveStatus } from "@/components/ui/saveStatus"
import { setReadReceiptsPolicy, useWorkspaceSettings, type WorkspaceSettings } from "@/services/settingsService"

export default function ReadReceiptsPolicyCard() {
    // The workspace's settings, read once for every card that shows a part of
    // them. The switch is never drawn from a guess: a failed read used to leave
    // it at its default, on, beside a toast that soon left.
    const { settings, isLoading, isError, mutate } = useWorkspaceSettings()
    // The value being saved, shown at once; null once the server has answered.
    const [pending, setPending] = useState<boolean | null>(null)
    const { status, run } = useSaveStatus()
    const enabled = pending ?? (settings ? settings.read_receipts_enabled !== false : null)

    const toggle = async (next: boolean) => {
        setPending(next)
        await run(async () => {
            const applied = await setReadReceiptsPolicy(next)
            await mutate(
                (d) => (d?.data ? { ...d, data: { ...d.data, read_receipts_enabled: applied } as WorkspaceSettings } : d),
                { revalidate: false },
            )
        })
        // Back to what the server holds: the saved value, or the old one.
        setPending(null)
    }

    const failed = isError || (!isLoading && !settings)

    return (
        <SettingsSection
            id="general-read-receipts"
            title="Read receipts"
            description="In DMs and group chats of up to 20 people. Each person can turn theirs off. Changes save as you make them."
        >
            <SettingsCard>
                {failed ? (
                    <SettingsCardError what="the read receipts setting" onRetry={() => void mutate()} />
                ) : enabled === null ? (
                    <div aria-label="Loading the read receipts setting" className="contents">
                        <SettingsRowsSkeleton rows={1} />
                    </div>
                ) : (
                    <SwitchRow
                        label="Allow read receipts"
                        description="When off, nobody sees who has read their messages."
                        checked={enabled}
                        disabled={status.state === "saving"}
                        status={status}
                        onChange={(v) => void toggle(v)}
                    />
                )}
            </SettingsCard>
        </SettingsSection>
    )
}
