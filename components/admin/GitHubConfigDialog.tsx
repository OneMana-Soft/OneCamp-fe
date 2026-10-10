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
//
// Every field is named for a screen reader, a failed read says so in place
// with Try again (it used to be a toast over an empty form), and a failed
// save keeps the server's reason.

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import axiosInstance from "@/lib/axiosInstance"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"

interface GitHubConfigStatus {
    client_id: string
    has_client_secret: boolean
    has_webhook_secret: boolean
    configured: boolean
    source: "db" | "env" | "none"
}

const SOURCE_LABEL: Record<string, string> = {
    db: "saved here",
    env: "from the server's environment",
}

export default function GitHubConfigDialog({
    open, onOpenChange, onSaved, reason,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSaved?: () => void
    /** Why the dialog opened, when something other than the admin opened it. */
    reason?: string
}) {
    const { toast } = useToast()
    const [status, setStatus] = useState<GitHubConfigStatus | null>(null)
    const [loading, setLoading] = useState(false)
    const [loadFailed, setLoadFailed] = useState(false)
    const [saving, setSaving] = useState(false)

    const [clientId, setClientId] = useState("")
    const [clientSecret, setClientSecret] = useState("")
    const [webhookSecret, setWebhookSecret] = useState("")

    const load = useCallback(() => {
        setLoading(true)
        setLoadFailed(false)
        axiosInstance
            .get(GetEndpointUrl.GetGitHubConfig)
            .then((res) => {
                const s = (res.data as { data?: GitHubConfigStatus })?.data ?? null
                setStatus(s)
                setClientId(s?.client_id ?? "")
                setClientSecret("")
                setWebhookSecret("")
            })
            .catch(() => setLoadFailed(true))
            .finally(() => setLoading(false))
    }, [])

    useEffect(() => {
        if (open) load()
    }, [open, load])

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
        } catch (e) {
            toast({
                title: "Couldn't save the GitHub credentials",
                description: apiErrorMessage(e, "Check the values and try again."),
                variant: "destructive",
            })
        } finally {
            setSaving(false)
        }
    }

    const source = status ? SOURCE_LABEL[status.source] : undefined

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>GitHub app credentials</DialogTitle>
                    <DialogDescription>
                        The client ID and secret of your GitHub OAuth app. Secrets are encrypted when saved and never shown again.
                    </DialogDescription>
                </DialogHeader>

                {reason && <p className="rounded-md bg-info/10 px-3 py-2 text-sm text-info-ink">{reason}</p>}

                {loadFailed ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5">
                        <p className="text-sm text-muted-foreground">Couldn&apos;t load the GitHub credentials.</p>
                        <Button variant="outline" size="sm" className="h-8" onClick={load}>Try again</Button>
                    </div>
                ) : (
                    <>
                        {status && (
                            // Words, not a pill with an icon: set up or not, and from where.
                            <p className="text-xs">
                                <span className={cn("font-medium", status.configured ? "text-success-ink" : "text-muted-foreground")}>
                                    {status.configured ? "Set up" : "Not set up"}
                                </span>
                                {source && <span className="text-muted-foreground">, {source}</span>}
                            </p>
                        )}

                        <div className="space-y-4 py-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="github-client-id" className="text-xs text-muted-foreground">Client ID</Label>
                                <Input
                                    id="github-client-id"
                                    value={clientId}
                                    onChange={(e) => setClientId(e.target.value)}
                                    placeholder="Iv1.xxxxxxxxxxxx"
                                    disabled={loading}
                                    spellCheck={false}
                                    autoComplete="off"
                                    className="h-8"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="github-client-secret" className="text-xs text-muted-foreground">Client secret</Label>
                                {/* new-password: a browser never fills the admin's own
                                    saved password into a secret field. */}
                                <Input
                                    id="github-client-secret"
                                    type="password"
                                    value={clientSecret}
                                    onChange={(e) => setClientSecret(e.target.value)}
                                    placeholder={status?.has_client_secret ? "••••••••" : "From your OAuth app"}
                                    disabled={loading}
                                    autoComplete="new-password"
                                    aria-describedby={status?.has_client_secret ? "github-client-secret-help" : undefined}
                                    className="h-8"
                                />
                                {status?.has_client_secret && (
                                    <p id="github-client-secret-help" className="text-xs text-muted-foreground">
                                        Saved. Leave it blank to keep it.
                                    </p>
                                )}
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="github-webhook-secret" className="text-xs text-muted-foreground">Webhook secret</Label>
                                <Input
                                    id="github-webhook-secret"
                                    type="password"
                                    value={webhookSecret}
                                    onChange={(e) => setWebhookSecret(e.target.value)}
                                    placeholder={status?.has_webhook_secret ? "••••••••" : "Optional"}
                                    disabled={loading}
                                    autoComplete="new-password"
                                    aria-describedby="github-webhook-secret-help"
                                    className="h-8"
                                />
                                <p id="github-webhook-secret-help" className="text-xs text-muted-foreground">
                                    Checks that webhook deliveries really come from GitHub.
                                    {status?.has_webhook_secret ? " Saved. Leave it blank to keep it." : ""}
                                </p>
                            </div>
                        </div>
                    </>
                )}

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={() => void handleSave()} disabled={saving || loading || loadFailed || !clientId.trim()}>
                        {saving ? "Saving…" : "Save credentials"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
