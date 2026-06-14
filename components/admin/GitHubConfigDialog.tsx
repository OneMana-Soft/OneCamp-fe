"use client"

// GitHubConfigDialog — admin UI to manage GitHub App credentials (OAuth client
// id/secret + webhook secret) without touching env files or redeploying.
//
// Security model matches the AI-provider and app-platform convention:
//   - secrets are write-only; the API returns only has_* booleans, never the
//     value, so a saved secret is shown as "configured" not as text.
//   - leaving a secret field blank keeps the existing value (omit=keep).
//   - the source ("db" | "env" | "none") is surfaced so an admin understands
//     whether they're overriding an env-provided default.

import React, { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { CheckCircle2, AlertTriangle } from "@/lib/icons"
import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"

interface GitHubConfigStatus {
    client_id: string
    has_client_secret: boolean
    has_webhook_secret: boolean
    configured: boolean
    source: "db" | "env" | "none"
}

const SOURCE_LABEL: Record<string, string> = {
    db: "Saved here",
    env: "From environment",
    none: "Not configured",
}

export default function GitHubConfigDialog({
    open, onOpenChange, onSaved,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSaved?: () => void
}) {
    const { toast } = useToast()
    const [status, setStatus] = useState<GitHubConfigStatus | null>(null)
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    const [clientId, setClientId] = useState("")
    const [clientSecret, setClientSecret] = useState("")
    const [webhookSecret, setWebhookSecret] = useState("")

    useEffect(() => {
        if (!open) return
        setLoading(true)
        axiosInstance
            .get(GetEndpointUrl.GetGitHubConfig)
            .then((res) => {
                const s = (res.data as { data?: GitHubConfigStatus })?.data ?? null
                setStatus(s)
                setClientId(s?.client_id ?? "")
                setClientSecret("")
                setWebhookSecret("")
            })
            .catch(() => toast({ title: "Couldn't load GitHub config", variant: "destructive" }))
            .finally(() => setLoading(false))
    }, [open, toast])

    const handleSave = async () => {
        setSaving(true)
        try {
            // omit=keep semantics: only send fields the admin actually changed.
            const body: Record<string, string> = {}
            if (clientId !== (status?.client_id ?? "")) body.client_id = clientId
            if (clientSecret) body.client_secret = clientSecret
            if (webhookSecret) body.webhook_secret = webhookSecret

            const res = await axiosInstance.post(PostEndpointUrl.UpdateGitHubConfig, body)
            const s = (res.data as { data?: GitHubConfigStatus })?.data ?? null
            setStatus(s)
            setClientSecret("")
            setWebhookSecret("")
            toast({ title: "GitHub credentials saved" })
            onSaved?.()
        } catch {
            toast({ title: "Failed to save credentials", variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>GitHub App credentials</DialogTitle>
                    <DialogDescription>
                        Enter your GitHub OAuth App credentials. Secrets are encrypted at rest and never shown again.
                    </DialogDescription>
                </DialogHeader>

                {status && (
                    <div className="flex items-center gap-2 text-xs">
                        {status.configured ? (
                            <Badge className="gap-1 bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
                                <CheckCircle2 className="h-3 w-3" /> Configured
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="gap-1">
                                <AlertTriangle className="h-3 w-3" /> Not configured
                            </Badge>
                        )}
                        <span className="text-muted-foreground">Source: {SOURCE_LABEL[status.source]}</span>
                    </div>
                )}

                <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Client ID</Label>
                        <Input
                            value={clientId}
                            onChange={(e) => setClientId(e.target.value)}
                            placeholder="Iv1.xxxxxxxxxxxx"
                            disabled={loading}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">
                            Client Secret
                            {status?.has_client_secret && (
                                <span className="text-muted-foreground font-normal ml-1.5">· set — leave blank to keep</span>
                            )}
                        </Label>
                        <Input
                            type="password"
                            value={clientSecret}
                            onChange={(e) => setClientSecret(e.target.value)}
                            placeholder={status?.has_client_secret ? "••••••••" : "client secret"}
                            disabled={loading}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">
                            Webhook Secret
                            {status?.has_webhook_secret && (
                                <span className="text-muted-foreground font-normal ml-1.5">· set — leave blank to keep</span>
                            )}
                        </Label>
                        <Input
                            type="password"
                            value={webhookSecret}
                            onChange={(e) => setWebhookSecret(e.target.value)}
                            placeholder={status?.has_webhook_secret ? "••••••••" : "webhook secret (optional)"}
                            disabled={loading}
                        />
                        <p className="text-[11px] text-muted-foreground">
                            Used to verify incoming GitHub webhook signatures.
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={saving || loading || !clientId.trim()}>
                        {saving ? "Saving…" : "Save credentials"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
