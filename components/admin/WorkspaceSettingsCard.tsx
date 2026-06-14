"use client"

// WorkspaceSettingsCard — admin UI for operational settings that previously
// required editing env files + redeploying: per-file upload limit, the sign-up
// allow-list, and the transactional-email (Resend) API key. DB-first with env
// fallback; the secret is write-only (only has_* + source shown). Changes apply
// without a restart.

import React, { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { Settings, CheckCircle2, AlertTriangle } from "@/lib/icons"
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
    const [resendKey, setResendKey] = useState("")
    const [savingUpload, setSavingUpload] = useState(false)
    const [savingAccess, setSavingAccess] = useState(false)
    const [savingEmail, setSavingEmail] = useState(false)

    const load = () => {
        setLoading(true)
        getWorkspaceSettings()
            .then((s) => {
                setSettings(s)
                setUploadLimit(s ? String(s.upload_limit_mb) : "")
                setAllowedUsers(s?.allowed_users?.join(", ") ?? "")
                setResendKey("")
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

    const saveEmail = async () => {
        setSavingEmail(true)
        try {
            const s = await updateWorkspaceSettings({ resend_api_key: resendKey })
            setSettings(s)
            setResendKey("")
            toast({ title: "Email API key saved" })
        } catch {
            toast({ title: "Failed to save email key", variant: "destructive" })
        } finally {
            setSavingEmail(false)
        }
    }

    const SourceBadge = ({ source }: { source: string }) => (
        <span className="text-[11px] text-muted-foreground">Source: {SOURCE_LABEL[source] ?? source}</span>
    )

    return (
        <Card className="border-border/60">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg font-semibold">Workspace settings</CardTitle>
                </div>
                <CardDescription>
                    Operational settings that apply immediately — no redeploy. Stored in the database; secrets encrypted at rest.
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
                    <p className="text-[11px] text-muted-foreground">
                        Users see an instant message if they pick a file larger than this — before any upload starts.
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

                <Separator />

                {/* Email */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium">Transactional email (Resend)</h3>
                        <div className="flex items-center gap-2">
                            {settings?.has_resend_api_key ? (
                                <Badge className="gap-1 bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
                                    <CheckCircle2 className="h-3 w-3" /> Configured
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="gap-1"><AlertTriangle className="h-3 w-3" /> Not configured</Badge>
                            )}
                            {settings && <SourceBadge source={settings.resend_source} />}
                        </div>
                    </div>
                    <Label className="text-xs">
                        API key {settings?.has_resend_api_key && <span className="text-muted-foreground font-normal">· leave blank to keep</span>}
                    </Label>
                    <Input
                        type="password"
                        value={resendKey}
                        onChange={(e) => setResendKey(e.target.value)}
                        placeholder={settings?.has_resend_api_key ? "••••••••" : "re_…"}
                        disabled={loading}
                    />
                    <p className="text-[11px] text-muted-foreground">
                        Enables invitation, password-reset, and notification emails. Verify your domain in Resend first.
                    </p>
                    <Button size="sm" onClick={saveEmail} disabled={savingEmail || loading || !resendKey}>
                        {savingEmail ? "Saving…" : "Save email key"}
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
