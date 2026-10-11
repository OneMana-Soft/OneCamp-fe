"use client"

// EmailProviderCard: the sending key every workspace email depends on.
//
// It used to be the last block of General, while the sender address and the
// invitation template sat in Email: setting up email meant finding two places.
// The key is the first step of email, so it is the first card of Email, which
// is also where the setup checklist's "Set up email" step lands.
//
// Write-only: only whether a key is set, and where from, is ever shown.
//
// Design v3 (admin A10): the provider as one large row (a 36px mark tile,
// "Sending through Resend", the address mail comes from, a dot and a word),
// then the key as a code row with Replace. Replace opens the key field in
// place; a key that isn't set yet is the field straight away.

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SettingRow, SettingsCard, SettingsCardError, SettingsRowsSkeleton, SettingsSection } from "@/components/ui/settingsSection"
import { CodeRow } from "@/components/ui/settingsControls"
import { StatusWord } from "@/components/ui/statusWord"
import { Loader2, Mail } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { useFetch } from "@/hooks/useFetch"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { GetEndpointUrl } from "@/services/endPoints"
import { updateWorkspaceSettings, useWorkspaceSettings } from "@/services/settingsService"

export default function EmailProviderCard() {
    const { toast } = useToast()
    // The workspace's settings, read once for every card that shows a part of
    // them. A failed read used to show "Email is off", and an admin acts on that
    // by pasting a key that is already there.
    const { settings, isLoading, isError, mutate } = useWorkspaceSettings()
    // Where mail comes from: the invitation card reads the same key.
    const { data: emailConfig } = useFetch<{ data?: { sender_email?: string; default_sender?: string } }>(GetEndpointUrl.GetEmailConfig)
    const [key, setKey] = useState("")
    const [replacing, setReplacing] = useState(false)
    const [saving, setSaving] = useState(false)

    const save = async () => {
        setSaving(true)
        try {
            const s = await updateWorkspaceSettings({ resend_api_key: key })
            // The answer goes into the shared read, so every card shows it.
            if (s) await mutate({ data: s }, { revalidate: false })
            setKey("")
            setReplacing(false)
            toast({ title: "Email key saved", tone: "success" })
        } catch (e) {
            toast({ title: "Couldn't save the email key", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    const configured = !!settings?.has_resend_api_key
    const fromEnv = settings?.resend_source === "env"
    const sender = emailConfig?.data?.sender_email || emailConfig?.data?.default_sender || ""

    const keyField = (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
            {/* new-password: a browser never fills the admin's own saved
                password into a key field and saves it as the key. */}
            <Input
                id="resend-key"
                name="resend-api-key"
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                autoFocus={replacing}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="re_…"
                aria-describedby="resend-key-desc"
                className="min-w-0 flex-1 font-mono"
            />
            {replacing && (
                <Button type="button" variant="ghost" size="sm" onClick={() => { setReplacing(false); setKey("") }} disabled={saving}>
                    Cancel
                </Button>
            )}
            <Button type="button" variant="secondary" size="sm" onClick={() => void save()} disabled={saving || !key} aria-busy={saving || undefined}>
                {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
                {saving ? "Saving…" : "Save key"}
            </Button>
        </div>
    )

    let body: React.ReactNode
    if (isError || (!isLoading && !settings)) {
        body = <SettingsCardError what="the email settings" onRetry={() => void mutate()} />
    } else if (!settings) {
        body = (
            <div aria-label="Loading the email settings" className="contents">
                <SettingsRowsSkeleton rows={2} control="button" />
            </div>
        )
    } else {
        body = (
            <>
                <div data-email-provider="" className="set-row flex items-center gap-3">
                    <span aria-hidden="true" className="inline-grid size-9 shrink-0 place-items-center rounded-[10px] bg-sunken text-ink-3 ring-1 ring-inset ring-line">
                        <Mail className="size-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{configured ? "Sending through Resend" : "Not sending yet"}</p>
                        <p className="truncate text-xs text-muted-foreground">
                            {configured
                                ? [sender, fromEnv ? "key from the server's environment" : "key saved here"].filter(Boolean).join(" · ")
                                : "Invitations still make a link you can share."}
                        </p>
                    </div>
                    <StatusWord tone={configured ? "success" : "neutral"} className="shrink-0 text-xs font-medium">
                        {configured ? "On" : "Off"}
                    </StatusWord>
                </div>
                <SettingRow
                    layout="stacked"
                    label="Resend API key"
                    description={
                        configured
                            ? fromEnv
                                ? "A key saved here takes the environment's place. It's never shown again."
                                : "It's never shown again. Replace it with a new one."
                            : "Verify your domain in Resend, then paste its API key here."
                    }
                    controlId="resend-key"
                >
                    {configured && !replacing ? (
                        <CodeRow value="re_••••••••••••••••" label="Resend API key" copy={false}>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setReplacing(true)}>
                                Replace
                            </Button>
                        </CodeRow>
                    ) : (
                        keyField
                    )}
                </SettingRow>
            </>
        )
    }

    return (
        <SettingsSection
            id="email-provider"
            title="Sending"
            description="Invitations, password resets and notifications are sent through Resend."
        >
            <SettingsCard>{body}</SettingsCard>
        </SettingsSection>
    )
}
