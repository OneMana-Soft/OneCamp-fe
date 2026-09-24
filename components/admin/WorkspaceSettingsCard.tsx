"use client"

// WorkspaceSettingsCard — admin UI for operational settings that previously
// required editing env files + redeploying: per-file upload limit, the sign-up
// allow-list. The email key moved to the Email section (EmailProviderCard), so
// email is configured in one place. DB-first with env fallback. Changes apply
// without a restart.

import React, { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { Settings } from "@/lib/icons"
import { getWorkspaceSettings, updateWorkspaceSettings, type WorkspaceSettings } from "@/services/settingsService"
import { mutate as globalMutate } from "swr"

const SOURCE_LABEL: Record<string, string> = {
    db: "Saved here",
    env: "From environment",
    default: "Default",
    none: "Not configured",
}

export default function WorkspaceSettingsCard() {
    const { toast } = useToast()
    const [settings, setSettings] = useState<WorkspaceSettings | null>(null)
    const [loading, setLoading] = useState(true)

    const [uploadLimit, setUploadLimit] = useState("")
    const [allowedUsers, setAllowedUsers] = useState("")
    const [savingUpload, setSavingUpload] = useState(false)
    const [savingAccess, setSavingAccess] = useState(false)

    const load = () => {
        setLoading(true)
        getWorkspaceSettings()
            .then((s) => {
                setSettings(s)
                setUploadLimit(s ? String(s.upload_limit_mb) : "")
                setAllowedUsers(s?.allowed_users?.join(", ") ?? "")
            })
            .catch(() => toast({ title: "Couldn't load settings", variant: "destructive" }))
            .finally(() => setLoading(false))
    }

    useEffect(() => {
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const saveUpload = async () => {
        const n = parseInt(uploadLimit, 10)
        if (isNaN(n) || n < 1) {
            toast({ title: "Enter a valid size (MB)", variant: "destructive" })
            return
        }
        setSavingUpload(true)
        try {
            const s = await updateWorkspaceSettings({ upload_limit_mb: n })
            setSettings(s)
            // Bust the client-config cache so composers pick up the new limit.
            globalMutate("client-config")
            toast({ title: "Upload limit updated", description: `Now ${s?.upload_limit_mb} MB per file.` })
        } catch {
            toast({ title: "Failed to update upload limit", variant: "destructive" })
        } finally {
            setSavingUpload(false)
        }
    }

    const saveAccess = async () => {
        setSavingAccess(true)
        try {
            const list = allowedUsers.split(",").map((s) => s.trim()).filter(Boolean)
            const s = await updateWorkspaceSettings({ allowed_users: list })
            setSettings(s)
            toast({ title: "Allow-list updated" })
        } catch {
            toast({ title: "Failed to update allow-list", variant: "destructive" })
        } finally {
            setSavingAccess(false)
        }
    }

    const SourceBadge = ({ source }: { source: string }) => (
        <span className="text-2xs text-muted-foreground">Source: {SOURCE_LABEL[source] ?? source}</span>
    )

    return (
        <Card className="border-border/60">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg font-semibold">Workspace settings</CardTitle>
                </div>
                <CardDescription>
                    Settings that apply at once, with no redeploy.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Upload limit */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium">Maximum upload size</h3>
                        {settings && <SourceBadge source={settings.upload_limit_source} />}
                    </div>
                    <div className="flex items-end gap-2">
                        <div className="space-y-1.5">
                            <Label className="text-xs">Per-file limit (MB)</Label>
                            <Input
                                type="number"
                                min={1}
                                value={uploadLimit}
                                onChange={(e) => setUploadLimit(e.target.value)}
                                className="w-32"
                                disabled={loading}
                            />
                        </div>
                        <Button size="sm" onClick={saveUpload} disabled={savingUpload || loading}>
                            {savingUpload ? "Saving…" : "Save"}
                        </Button>
                    </div>
                    <p className="text-2xs text-muted-foreground">
                        Users see an instant message if they pick a file larger than this: before any upload starts.
                    </p>
                </div>

                <Separator />

                {/* Allow-list */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium">Sign-up allow-list</h3>
                        {settings && <SourceBadge source={settings.allowed_users_source} />}
                    </div>
                    <Label className="text-xs">Allowed emails (comma-separated). Leave empty for invite-only.</Label>
                    <Textarea
                        value={allowedUsers}
                        onChange={(e) => setAllowedUsers(e.target.value)}
                        placeholder="alice@example.com, bob@example.com"
                        rows={3}
                        disabled={loading}
                    />
                    <Button size="sm" onClick={saveAccess} disabled={savingAccess || loading}>
                        {savingAccess ? "Saving…" : "Save allow-list"}
                    </Button>
                </div>

            </CardContent>
        </Card>
    )
}
