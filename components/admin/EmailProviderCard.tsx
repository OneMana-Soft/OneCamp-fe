"use client"

// EmailProviderCard: the sending key every workspace email depends on.
//
// It used to be the last block of General, while the sender address and the
// invitation template sat in Email: setting up email meant finding two places.
// The key is the first step of email, so it is the first card of Email, which
// is also where the setup checklist's "Set up email" step lands.
//
// Write-only: only whether a key is set, and where from, is ever shown.

import React, { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { Mail, CheckCircle2, AlertTriangle } from "@/lib/icons"
import { getWorkspaceSettings, updateWorkspaceSettings, type WorkspaceSettings } from "@/services/settingsService"

export default function EmailProviderCard() {
    const { toast } = useToast()
    const [settings, setSettings] = useState<WorkspaceSettings | null>(null)
    const [loading, setLoading] = useState(true)
    const [key, setKey] = useState("")
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        getWorkspaceSettings()
            .then((s) => setSettings(s))
            .catch(() => toast({ title: "Couldn't load the email settings", variant: "destructive" }))
            .finally(() => setLoading(false))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const save = async () => {
        setSaving(true)
        try {
            const s = await updateWorkspaceSettings({ resend_api_key: key })
            setSettings(s)
            setKey("")
            toast({ title: "Email key saved" })
        } catch {
            toast({ title: "Couldn't save the email key", variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    const configured = !!settings?.has_resend_api_key
    const fromEnv = settings?.resend_source === "env"

    return (
        <Card className="border-border/60">
            <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Mail className="h-5 w-5 text-primary" />
                        <CardTitle className="text-lg font-semibold">Sending</CardTitle>
                    </div>
                    {configured ? (
                        <Badge className="gap-1 bg-success/10 text-success border-success/20">
                            <CheckCircle2 className="h-3 w-3" /> Email is on
                        </Badge>
                    ) : (
                        <Badge variant="outline" className="gap-1">
                            <AlertTriangle className="h-3 w-3" /> Email is off
                        </Badge>
                    )}
                </div>
                <CardDescription>
                    Invitations, password resets and notifications are sent through Resend. Verify your domain in Resend, then paste its API key here.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
                <Label htmlFor="resend-key" className="text-xs">
                    Resend API key
                    {configured && <span className="font-normal text-muted-foreground"> · leave blank to keep the current one</span>}
                </Label>
                <div className="flex flex-wrap items-center gap-2">
                    <Input
                        id="resend-key"
                        type="password"
                        autoComplete="off"
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        placeholder={configured ? "••••••••" : "re_…"}
                        disabled={loading}
                        className="min-w-0 flex-1"
                    />
                    <Button size="sm" onClick={save} disabled={saving || loading || !key}>
                        {saving ? "Saving…" : "Save key"}
                    </Button>
                </div>
                {fromEnv && (
                    <p className="text-2xs text-muted-foreground">
                        The current key comes from the server&apos;s environment. A key saved here takes its place.
                    </p>
                )}
            </CardContent>
        </Card>
    )
}
