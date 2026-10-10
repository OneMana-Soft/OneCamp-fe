"use client"

// EmailProviderCard: the sending key every workspace email depends on.
//
// It used to be the last block of General, while the sender address and the
// invitation template sat in Email: setting up email meant finding two places.
// The key is the first step of email, so it is the first card of Email, which
// is also where the setup checklist's "Set up email" step lands.
//
// Write-only: only whether a key is set, and where from, is ever shown.

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { SettingRow, SettingsList, SettingsSection } from "@/components/ui/settingsSection"
import { StatusWord } from "@/components/ui/statusWord"
import { useToast } from "@/hooks/use-toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { fieldLabel, fieldRow } from "@/lib/ui/fieldRow"
import { updateWorkspaceSettings, useWorkspaceSettings } from "@/services/settingsService"

export default function EmailProviderCard() {
    const { toast } = useToast()
    // The workspace's settings, read once for every card that shows a part of
    // them. A failed read used to show "Email is off", and an admin acts on that
    // by pasting a key that is already there.
    const { settings, isLoading, isError, mutate } = useWorkspaceSettings()
    const [key, setKey] = useState("")
    const [saving, setSaving] = useState(false)

    const save = async () => {
        setSaving(true)
        try {
            const s = await updateWorkspaceSettings({ resend_api_key: key })
            // The answer goes into the shared read, so every card shows it.
            if (s) await mutate({ data: s }, { revalidate: false })
            setKey("")
            toast({ title: "Email key saved" })
        } catch (e) {
            toast({ title: "Couldn't save the email key", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    const configured = !!settings?.has_resend_api_key
    const fromEnv = settings?.resend_source === "env"

    let body: React.ReactNode
    if (isError || (!isLoading && !settings)) {
        body = <ErrorState compact subject="the email settings" onRetry={() => void mutate()} />
    } else if (!settings) {
        body = (
            <SettingsList>
                <div aria-busy="true" aria-label="Loading the email settings" className="space-y-2 px-4 py-3">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-64 max-w-full" />
                </div>
                <div aria-hidden="true" className="flex items-center justify-between gap-6 px-4 py-3">
                    <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="h-3 w-72 max-w-full" />
                    </div>
                    <Skeleton className="h-9 w-80 max-w-[50%] shrink-0" />
                </div>
            </SettingsList>
        )
    } else {
        body = (
            <SettingsList>
                {/* A quiet label beside a dot and a word, as the task panel says a
                    status: it was a pill with an icon, then a green word alone. */}
                <div className="space-y-1 px-4 py-3">
                    <div className={fieldRow("center", "")}>
                        <span className={fieldLabel}>Status</span>
                        <StatusWord tone={configured ? "success" : "neutral"} className="text-sm font-medium">
                            {configured ? "On" : "Off"}
                        </StatusWord>
                    </div>
                    <p className="text-xs text-muted-foreground text-pretty">
                        {configured
                            ? fromEnv
                                ? "Sending with the key in the server's environment. A key saved here takes its place."
                                : "Sending with the key saved here."
                            : "No key yet, so invitations, password resets and notifications aren't emailed. Invitations still make a link you can share."}
                    </p>
                </div>
                <SettingRow
                    label="Resend API key"
                    description={configured ? "Paste a new key to replace the current one; it's never shown again." : "Verify your domain in Resend, then paste its API key here."}
                    controlId="resend-key"
                >
                    {/* new-password: a browser never fills the admin's own saved
                        password into a key field and saves it as the key. */}
                    <Input
                        id="resend-key"
                        name="resend-api-key"
                        type="password"
                        autoComplete="new-password"
                        spellCheck={false}
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        placeholder={configured ? "••••••••" : "re_…"}
                        aria-describedby="resend-key-desc"
                        className="w-56"
                    />
                    {/* The field's height, so the row keeps one control height. */}
                    <Button variant="outline" onClick={save} disabled={saving || !key}>
                        {saving ? "Saving…" : "Save key"}
                    </Button>
                </SettingRow>
            </SettingsList>
        )
    }

    return (
        <SettingsSection
            title="Sending"
            description="Invitations, password resets and notifications are sent through Resend."
        >
            {body}
        </SettingsSection>
    )
}
