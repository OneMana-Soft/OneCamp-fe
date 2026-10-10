"use client"

// EmailProviderCard: the sending key every workspace email depends on.
//
// It used to be the last block of General, while the sender address and the
// invitation template sat in Email: setting up email meant finding two places.
// The key is the first step of email, so it is the first card of Email, which
// is also where the setup checklist's "Set up email" step lands.
//
// Write-only: only whether a key is set, and where from, is ever shown.

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { SettingRow, SettingsList, SettingsSection } from "@/components/ui/settingsSection"
import { useToast } from "@/hooks/use-toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { fieldLabel, fieldRow } from "@/lib/ui/fieldRow"
import { cn } from "@/lib/utils/helpers/cn"
import { getWorkspaceSettings, updateWorkspaceSettings, type WorkspaceSettings } from "@/services/settingsService"

export default function EmailProviderCard() {
    const { toast } = useToast()
    const [settings, setSettings] = useState<WorkspaceSettings | null>(null)
    const [state, setState] = useState<"loading" | "failed" | "ready">("loading")
    const [key, setKey] = useState("")
    const [saving, setSaving] = useState(false)

    // A failed read used to show "Email is off", and an admin acts on that by
    // pasting a key that is already there.
    const load = () => {
        setState("loading")
        getWorkspaceSettings()
            .then((s) => {
                if (!s) {
                    setState("failed")
                    return
                }
                setSettings(s)
                setState("ready")
            })
            .catch(() => setState("failed"))
    }

    useEffect(() => {
        load()
    }, [])

    const save = async () => {
        setSaving(true)
        try {
            const s = await updateWorkspaceSettings({ resend_api_key: key })
            if (s) setSettings(s)
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
    if (state === "loading") {
        body = (
            <SettingsList>
                <div aria-busy="true" aria-label="Loading the email settings" className="space-y-2 px-4 py-3">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-64 max-w-full" />
                </div>
                <div aria-hidden="true" className="flex items-center justify-between gap-4 px-4 py-3">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-8 w-72 max-w-[50%]" />
                </div>
            </SettingsList>
        )
    } else if (state === "failed") {
        body = <ErrorState subject="the email settings" onRetry={load} />
    } else {
        body = (
            <SettingsList>
                {/* A quiet label beside an ink value, as the task panel reads: it
                    was a pill with an icon. */}
                <div className="space-y-1 px-4 py-3">
                    <div className={fieldRow("center", "")}>
                        <span className={fieldLabel}>Status</span>
                        <span className={cn("text-sm font-medium", configured ? "text-success-ink" : "text-foreground")}>
                            {configured ? "On" : "Off"}
                        </span>
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
                        className="h-8 w-56"
                    />
                    <Button size="sm" variant="outline" onClick={save} disabled={saving || !key}>
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
