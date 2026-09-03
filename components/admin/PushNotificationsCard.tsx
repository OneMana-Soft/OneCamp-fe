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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Bell, Loader2 } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"

/** What the current state means, in the operator's terms rather than the API's. */
function describe(config: PushConfig | null): { label: string; tone: string; detail: string } {
    if (!config || (!config.configured && config.source === "none")) {
        return {
            label: "Off",
            tone: "text-muted-foreground",
            detail: "No credential is set, so mobile push notifications are not sent. Everything else works.",
        }
    }
    if (config.configured && config.active) {
        return {
            label: "On",
            tone: "text-success",
            detail:
                config.source === "file"
                    ? "Loaded from the credential file mounted into the container. Pasting a key here replaces it."
                    : "Loaded from this setting.",
        }
    }
    // Stored but not loaded. The two are genuinely different and conflating them
    // is what leaves somebody believing push works.
    return {
        label: "Not working",
        tone: "text-warning",
        detail: config.configured
            ? "A credential is stored but Firebase did not accept it. Paste the key again."
            : "A credential is stored but cannot be read, which usually means the encryption key changed. Paste the key again.",
    }
}

export const PushNotificationsCard: React.FC = () => {
    const [config, setConfig] = useState<PushConfig | null>(null)
    const [draft, setDraft] = useState("")
    const [saving, setSaving] = useState(false)
    const [removing, setRemoving] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const { toast } = useToast()

    const load = useCallback(async () => {
        try {
            setConfig(await getPushConfig())
        } catch {
            setConfig(null)
        } finally {
            setLoaded(true)
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
            const msg =
                e && typeof e === "object" && "response" in e
                    ? ((e as { response?: { data?: { msg?: string } } }).response?.data?.msg ?? "")
                    : ""
            toast({
                title: "Could not enable push notifications",
                description: msg || "The credential was not accepted.",
                variant: "destructive",
            })
        } finally {
            setSaving(false)
        }
    }

    const remove = async () => {
        if (removing) return
        setRemoving(true)
        try {
            setConfig(await clearPushConfig())
            toast({
                title: "Push notifications are off",
                description: "Revoke the key in the Google Cloud console too if you are rotating it.",
            })
        } catch {
            toast({ title: "Could not remove the credential", variant: "destructive" })
        } finally {
            setRemoving(false)
        }
    }

    const state = describe(config)

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Bell className="size-4" />
                    Push notifications
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex flex-wrap items-baseline gap-2 text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <span className={`font-medium ${state.tone}`}>{loaded ? state.label : "Checking…"}</span>
                </div>
                <p className="text-sm text-muted-foreground">{state.detail}</p>

                {config?.project_id && (
                    <dl className="grid gap-1 rounded-lg border bg-muted/30 p-3 text-xs">
                        <div className="flex gap-2">
                            <dt className="text-muted-foreground">Project</dt>
                            <dd className="font-medium">{config.project_id}</dd>
                        </div>
                        {config.client_email && (
                            <div className="flex gap-2">
                                <dt className="text-muted-foreground">Service account</dt>
                                <dd className="truncate font-medium">{config.client_email}</dd>
                            </div>
                        )}
                    </dl>
                )}

                <div className="space-y-2">
                    <Label htmlFor="firebase-credential">
                        {config?.configured ? "Replace the credential" : "Service account JSON"}
                    </Label>
                    <Textarea
                        id="firebase-credential"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={6}
                        spellCheck={false}
                        autoComplete="off"
                        placeholder='{"type": "service_account", "project_id": "…"}'
                        className="font-mono text-xs"
                    />
                    <p className="text-xs text-muted-foreground">
                        Firebase console, Project settings, Service accounts, Generate new private key. The
                        file is stored encrypted and is never shown again.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={save} disabled={saving || !draft.trim()}>
                        {saving && <Loader2 className="mr-2 size-3.5 animate-spin" />}
                        {config?.configured ? "Replace" : "Enable push"}
                    </Button>
                    {config?.source === "settings" && (
                        <Button size="sm" variant="ghost" onClick={remove} disabled={removing}>
                            {removing && <Loader2 className="mr-2 size-3.5 animate-spin" />}
                            Turn off
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

export default PushNotificationsCard
