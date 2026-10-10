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
 * So the key is pasted here, encrypted at rest, and takes effect without a
 * restart. Turning push on stops being a deploy.
 *
 * WHAT THIS SCREEN WILL NOT DO is show you the key back. There is no endpoint
 * that returns it. A credential you can read is a credential that leaves in a
 * screenshot or a support ticket, and an admin who needs a different one pastes
 * a different one.
 */

import React, { useCallback, useEffect, useState } from "react"

import {
    clearPushConfig,
    getPushConfig,
    setPushConfig,
    type PushConfig,
} from "@/services/settingsService"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { SettingRow, SettingsList, SettingsSection } from "@/components/ui/settingsSection"
import { StatusWord, type StatusTone } from "@/components/ui/statusWord"
import { Loader2 } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { fieldLabel, fieldRow } from "@/lib/ui/fieldRow"

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
                    ? "Sending with the credential file mounted into the container. A key pasted here takes its place."
                    : "Sending with the key saved here.",
        }
    }
    // Stored but not loaded. The two are genuinely different and conflating them
    // is what leaves somebody believing push works.
    return {
        label: "Not working",
        tone: "warning",
        detail: config.configured
            ? "A credential is stored but Firebase did not accept it. Paste the key again."
            : "A credential is stored but cannot be read, which usually means the encryption key changed. Paste the key again.",
    }
}

const PushNotificationsCard: React.FC = () => {
    const [config, setConfig] = useState<PushConfig | null>(null)
    const [draft, setDraft] = useState("")
    const [saving, setSaving] = useState(false)
    const [removing, setRemoving] = useState(false)
    const [state, setState] = useState<"loading" | "failed" | "ready">("loading")
    const { toast } = useToast()
    const confirm = useConfirm()

    // A failed read used to read as "Off: no credential is set", and an admin
    // acts on that by pasting a key that was already there.
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

    const save = async () => {
        if (!draft.trim() || saving) return
        setSaving(true)
        try {
            const next = await setPushConfig(draft)
            setConfig(next)
            // Cleared on success so the key does not sit in a form field, in the
            // DOM, or in whatever the browser decides to restore later.
            setDraft("")
            toast({ title: `Push notifications are on for ${next.project_id}` })
        } catch (e) {
            toast({
                title: "Couldn't turn on push notifications",
                description: apiErrorMessage(e, "The credential was not accepted."),
                variant: "destructive",
            })
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
                "Phones stop getting notifications from this workspace. The stored key is deleted and can't be shown again, so turning push back on means pasting a key again.",
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
            toast({ title: "Couldn't turn off push notifications", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
        } finally {
            setRemoving(false)
        }
    }

    const status = describe(config)

    let body: React.ReactNode
    if (state === "loading") {
        body = (
            <SettingsList>
                <div aria-busy="true" aria-label="Loading the push notification setting" className="space-y-2 px-4 py-3">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-72 max-w-full" />
                </div>
                <div aria-hidden="true" className="space-y-2 px-4 py-3">
                    <Skeleton className="h-4 w-44" />
                    <Skeleton className="h-28 w-full" />
                </div>
            </SettingsList>
        )
    } else if (state === "failed") {
        body = <ErrorState compact subject="the push notification setting" onRetry={() => void load()} />
    } else {
        body = (
            <SettingsList>
                {/* Quiet labels beside ink values, one per line, as the task panel reads. */}
                <div className="space-y-2 px-4 py-3">
                    <div className={fieldRow("center", "")}>
                        <span className={fieldLabel}>Status</span>
                        {/* A dot and a word, as the task panel says a status. */}
                        <StatusWord tone={status.tone} className="text-sm font-medium">
                            {status.label}
                        </StatusWord>
                    </div>
                    {config?.project_id && (
                        <div className={fieldRow("center", "")}>
                            <span className={fieldLabel}>Project</span>
                            <span className="truncate text-sm">{config.project_id}</span>
                        </div>
                    )}
                    {config?.client_email && (
                        <div className={fieldRow("center", "")}>
                            <span className={fieldLabel}>Service account</span>
                            <span className="truncate text-sm">{config.client_email}</span>
                        </div>
                    )}
                    <p className="text-xs text-muted-foreground text-pretty">{status.detail}</p>
                </div>

                {/* The key's box under its words at the row's width, a stacked
                    row like every long field in the admin lists. */}
                <SettingRow
                    layout="stacked"
                    label={config?.configured ? "Replace the credential" : "Service account JSON"}
                    description="Firebase console, Project settings, Service accounts, Generate new private key. The file is stored encrypted and is never shown again."
                    controlId="firebase-credential"
                >
                    <Textarea
                        id="firebase-credential"
                        name="firebase-credential"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={6}
                        spellCheck={false}
                        autoComplete="off"
                        aria-describedby="firebase-credential-desc"
                        placeholder='{"type": "service_account", "project_id": "…"}'
                        className="font-mono text-xs"
                    />
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button size="sm" onClick={save} disabled={saving || !draft.trim()}>
                            {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
                            {config?.configured ? "Replace" : "Enable push"}
                        </Button>
                        {config?.source === "settings" && (
                            <Button size="sm" variant="ghost" onClick={askToRemove} disabled={removing}>
                                {removing && <Loader2 className="animate-spin" aria-hidden="true" />}
                                Turn off
                            </Button>
                        )}
                    </div>
                </SettingRow>
            </SettingsList>
        )
    }

    return (
        <SettingsSection
            title="Push notifications"
            description="Notifications on members' phones, sent through your own Firebase project."
        >
            {body}
        </SettingsSection>
    )
}

export default PushNotificationsCard
