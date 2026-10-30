"use client"

/**
 * PushNotificationsCard — mobile push, configured rather than mounted.
 *
 * The Firebase service-account key used to arrive as a file inside the image.
 * Removing it from the build was right (a private key was shipping to every
 * customer) and left a hole: the shipped env still names a file the archive does
 * not contain, so push has been quietly off ever since, here and on every
 * install that followed the guide. Nothing said so, because the only place it
 * was reported was a line in the server log at boot.
 *
 * So the key is given here, encrypted at rest, and takes effect without a
 * restart. Turning push on stops being a deploy.
 *
 * WHAT THIS SCREEN WILL NOT DO is show you the key back. There is no endpoint
 * that returns it. A credential you can read is a credential that leaves in a
 * screenshot or a support ticket, and an admin who needs a different one gives
 * a different one.
 *
 * Design v3 (admin A7, mock M1): a status row (a dot and a word, the project,
 * the service account in mono with copy), then "Replace credential…", which
 * opens a dialog with a drop zone for the JSON file, not a textarea. Turning
 * push off is a Danger zone row, the last card on the page.
 */

import React, { useCallback, useEffect, useState } from "react"

import { clearPushConfig, getPushConfig, setPushConfig, type PushConfig } from "@/services/settingsService"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DangerZone, SettingRow, SettingsCard, SettingsCardError, SettingsRowsSkeleton, SettingsSection } from "@/components/ui/settingsSection"
import { CopyButton } from "@/components/ui/settingsControls"
import { StatusWord, type StatusTone } from "@/components/ui/statusWord"
import { Loader2 } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { CredentialDropZone, readServiceAccount } from "@/components/admin/CredentialDropZone"

/** What the current state means, in the operator's terms rather than the API's. */
function describe(config: PushConfig | null): { label: string; tone: StatusTone; detail: string } {
    if (!config || (!config.configured && config.source === "none")) {
        return {
            label: "Off",
            tone: "neutral",
            detail: "No credential is set, so mobile push notifications are not sent. Everything else works.",
        }
    }
    if (config.configured && config.active) {
        return {
            label: "On",
            tone: "success",
            // Said as the email card says it: "Loaded from this setting." named
            // the machinery, not where the key is.
            detail:
                config.source === "file"
                    ? "Sending with the credential file mounted into the container. A key given here takes its place."
                    : "Sending with the key saved here.",
        }
    }
    // Stored but not loaded. The two are genuinely different and conflating them
    // is what leaves somebody believing push works.
    return {
        label: "Not working",
        tone: "warning",
        detail: config.configured
            ? "A credential is stored but Firebase did not accept it. Give the key again."
            : "A credential is stored but cannot be read, which usually means the encryption key changed. Give the key again.",
    }
}

const PushNotificationsCard: React.FC = () => {
    const [config, setConfig] = useState<PushConfig | null>(null)
    const [draft, setDraft] = useState("")
    const [dialogOpen, setDialogOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState("")
    const [removing, setRemoving] = useState(false)
    const [state, setState] = useState<"loading" | "failed" | "ready">("loading")
    const { toast } = useToast()
    const confirm = useConfirm()

    // A failed read used to read as "Off: no credential is set", and an admin
    // acts on that by giving a key that was already there.
    const load = useCallback(async () => {
        setState("loading")
        try {
            setConfig(await getPushConfig())
            setState("ready")
        } catch {
            setState("failed")
        }
    }, [])

    useEffect(() => {
        void load()
    }, [load])

    const openDialog = () => {
        setDraft("")
        setSaveError("")
        setDialogOpen(true)
    }

    const checked = draft.trim() ? readServiceAccount(draft) : null

    const save = async () => {
        if (!checked?.ok || saving) return
        setSaving(true)
        setSaveError("")
        try {
            const next = await setPushConfig(draft)
            setConfig(next)
            // Cleared on success so the key does not sit in a form field, in the
            // DOM, or in whatever the browser decides to restore later.
            setDraft("")
            setDialogOpen(false)
            toast({ title: `Push notifications are on for ${next.project_id}`, tone: "success" })
        } catch (e) {
            // Said in the dialog, where the key is, not in a toast behind it.
            setSaveError(apiErrorMessage(e, "The key wasn't saved. Try again in a moment."))
        } finally {
            setSaving(false)
        }
    }

    // Asked first: the key is deleted and never shown again, so turning push
    // back on means finding or making a new one, and it went on one click.
    const askToRemove = () => {
        if (removing) return
        confirm({
            title: "Turn off push notifications?",
            description:
                "Phones stop getting notifications from this workspace. The stored key is deleted and can't be shown again, so turning push back on means giving a key again.",
            confirmText: "Turn off push",
            destructive: true,
            onConfirm: () => void remove(),
        })
    }

    const remove = async () => {
        setRemoving(true)
        try {
            setConfig(await clearPushConfig())
            toast({
                title: "Push notifications are off",
                description: "Revoke the key in the Google Cloud console too if you are rotating it.",
            })
        } catch (e) {
            toast({ title: "Couldn't turn off push notifications", description: apiErrorMessage(e, "Try again in a moment."), tone: "error" })
        } finally {
            setRemoving(false)
        }
    }

    const status = describe(config)
    const stored = !!config?.configured || config?.source === "settings"

    let body: React.ReactNode
    if (state === "loading") {
        body = (
            <SettingsCard aria-label="Loading the push notification setting">
                <SettingsRowsSkeleton rows={1} control="button" />
            </SettingsCard>
        )
    } else if (state === "failed") {
        body = (
            <SettingsCard>
                <SettingsCardError what="the push notification setting" onRetry={() => void load()} />
            </SettingsCard>
        )
    } else {
        body = (
            <SettingsCard>
                <div data-push-status="" className="set-row @container">
                    <div className="grid gap-3 @min-[520px]:grid-cols-[minmax(0,1fr)_auto] @min-[520px]:items-center @min-[520px]:gap-6">
                        <div className="min-w-0 space-y-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                                <StatusWord tone={status.tone} className="font-medium">
                                    {status.label}
                                </StatusWord>
                                {config?.project_id && (
                                    <>
                                        <span aria-hidden="true" className="text-ink-3">·</span>
                                        <span className="sr-only">Project</span>
                                        <span className="truncate text-foreground">{config.project_id}</span>
                                    </>
                                )}
                            </div>
                            {config?.client_email && (
                                <div className="flex min-w-0 items-center gap-1">
                                    <span className="sr-only">Service account</span>
                                    <code title={config.client_email} className="min-w-0 truncate font-mono text-2xs text-muted-foreground">
                                        {config.client_email}
                                    </code>
                                    <CopyButton value={config.client_email} label="service account" />
                                </div>
                            )}
                            <p className="text-xs text-muted-foreground text-pretty">{status.detail}</p>
                        </div>
                        <Button type="button" variant="secondary" size="sm" onClick={openDialog} className="justify-self-start">
                            {stored ? "Replace credential…" : "Add credential…"}
                        </Button>
                    </div>
                </div>
            </SettingsCard>
        )
    }

    return (
        <>
            <SettingsSection
                id="general-push"
                title="Push notifications"
                description="Notifications on members' phones, sent through your own Firebase project."
            >
                {body}
            </SettingsSection>

            {state === "ready" && config?.source === "settings" && (
                <DangerZone>
                    <SettingRow
                        label="Turn off push notifications"
                        description="Members stop getting notifications on their phones."
                        controlId="push-turn-off"
                    >
                        <Button type="button" aria-describedby="push-turn-off-desc" variant="destructive" size="sm" onClick={askToRemove} disabled={removing}>
                            {removing && <Loader2 className="animate-spin" aria-hidden="true" />}
                            Turn off…
                        </Button>
                    </SettingRow>
                </DangerZone>
            )}

            <Dialog open={dialogOpen} onOpenChange={(o) => !saving && setDialogOpen(o)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{stored ? "Replace the credential" : "Add a credential"}</DialogTitle>
                        <DialogDescription>
                            Firebase console, Project settings, Service accounts, Generate new private key. It is stored
                            encrypted and never shown again.
                        </DialogDescription>
                    </DialogHeader>
                    <CredentialDropZone value={draft} onChange={(t) => { setDraft(t); setSaveError("") }} />
                    {checked && (
                        <p
                            role={checked.ok ? undefined : "alert"}
                            className={checked.ok ? "text-xs text-muted-foreground" : "text-xs text-danger-ink"}
                        >
                            {checked.ok ? `Project ${checked.project || "unnamed"}, ${checked.email}` : checked.reason}
                        </p>
                    )}
                    {saveError && (
                        <p role="alert" className="text-xs text-danger-ink">
                            {saveError}
                        </p>
                    )}
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
                            Cancel
                        </Button>
                        <Button type="button" onClick={() => void save()} disabled={!checked?.ok} busy={saving}>
                            {stored ? "Replace credential" : "Turn on push"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}

export default PushNotificationsCard
