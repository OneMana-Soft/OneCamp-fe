"use client"

// The workspace's read receipts: on (each person can turn theirs off), or
// off for everyone. On by default, as in Teams and Zulip.

import { useEffect, useState } from "react"
import { SettingsList, SettingsSection, SwitchRow } from "@/components/ui/settingsSection"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { getWorkspaceSettings, setReadReceiptsPolicy } from "@/services/settingsService"

export default function ReadReceiptsPolicyCard() {
    const { toast } = useToast()
    // null until the server has said: the switch is never drawn from a guess.
    const [enabled, setEnabled] = useState<boolean | null>(null)
    const [failed, setFailed] = useState(false)
    const [saving, setSaving] = useState(false)

    // A failed read used to leave the switch at its default, on, beside a toast
    // that soon left, so the card claimed a setting it had never read.
    const load = () => {
        setFailed(false)
        setEnabled(null)
        getWorkspaceSettings()
            .then((s) => {
                if (!s) {
                    setFailed(true)
                    return
                }
                setEnabled(s.read_receipts_enabled !== false)
            })
            .catch(() => setFailed(true))
    }

    useEffect(() => {
        load()
    }, [])

    const toggle = async (next: boolean) => {
        setSaving(true)
        setEnabled(next)
        try {
            const applied = await setReadReceiptsPolicy(next)
            setEnabled(applied)
            toast({ title: applied ? "Read receipts on" : "Read receipts off" })
        } catch (e) {
            setEnabled(!next)
            toast({ title: "Couldn't change read receipts", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

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
                <ErrorState subject="the read receipts setting" onRetry={load} />
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
