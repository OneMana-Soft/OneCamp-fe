"use client"

// OAuthConfigCard — admin UI to manage login OAuth credentials (Google +
// GitHub sign-in) without env files or redeploys. Secrets are write-only:
// the API returns only has_* booleans and a source indicator, never the value.
// Saving reloads the providers server-side, so changes take effect immediately.

import React, { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"
import { CheckCircle2, AlertTriangle, Key } from "@/lib/icons"
import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"

interface OAuthConfigStatus {
    google_client_id: string
    google_has_client_secret: boolean
    google_configured: boolean
    google_source: "db" | "env" | "none"
    github_client_id: string
    github_has_client_secret: boolean
    github_configured: boolean
    github_source: "db" | "env" | "none"
}

const SOURCE_LABEL: Record<string, string> = {
    db: "Saved here",
    env: "From environment",
    none: "Not configured",
}

export default function OAuthConfigCard() {
    const { toast } = useToast()
    const [status, setStatus] = useState<OAuthConfigStatus | null>(null)
    const [loading, setLoading] = useState(true)
    const [savingGoogle, setSavingGoogle] = useState(false)
    const [savingGithub, setSavingGithub] = useState(false)

    const [googleId, setGoogleId] = useState("")
    const [googleSecret, setGoogleSecret] = useState("")
    const [githubId, setGithubId] = useState("")
    const [githubSecret, setGithubSecret] = useState("")

    const load = () => {
        setLoading(true)
        axiosInstance
            .get(GetEndpointUrl.GetOAuthConfig)
            .then((res) => {
                const s = (res.data as { data?: OAuthConfigStatus })?.data ?? null
                setStatus(s)
                setGoogleId(s?.google_client_id ?? "")
                setGithubId(s?.github_client_id ?? "")
                setGoogleSecret("")
                setGithubSecret("")
            })
            .catch(() => toast({ title: "Couldn't load OAuth config", variant: "destructive" }))
            .finally(() => setLoading(false))
    }

    useEffect(() => {
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const saveGoogle = async () => {
        setSavingGoogle(true)
        try {
            const body: Record<string, string> = {}
            if (googleId !== (status?.google_client_id ?? "")) body.google_client_id = googleId
            if (googleSecret) body.google_client_secret = googleSecret
            await axiosInstance.post(PostEndpointUrl.UpdateOAuthConfig, body)
            toast({ title: "Google credentials saved" })
            load()
        } catch {
            toast({ title: "Failed to save Google credentials", variant: "destructive" })
        } finally {
            setSavingGoogle(false)
        }
    }

    const saveGithub = async () => {
        setSavingGithub(true)
        try {
            const body: Record<string, string> = {}
            if (githubId !== (status?.github_client_id ?? "")) body.github_client_id = githubId
            if (githubSecret) body.github_client_secret = githubSecret
            await axiosInstance.post(PostEndpointUrl.UpdateOAuthConfig, body)
            toast({ title: "GitHub sign-in credentials saved" })
            load()
        } catch {
            toast({ title: "Failed to save GitHub credentials", variant: "destructive" })
        } finally {
            setSavingGithub(false)
        }
    }

    const StatusBadge = ({ configured, source }: { configured: boolean; source: string }) => (
        <div className="flex items-center gap-2 text-xs">
            {configured ? (
                <Badge className="gap-1 bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
                    <CheckCircle2 className="h-3 w-3" /> Configured
                </Badge>
            ) : (
                <Badge variant="outline" className="gap-1"><AlertTriangle className="h-3 w-3" /> Not configured</Badge>
            )}
            <span className="text-muted-foreground">Source: {SOURCE_LABEL[source]}</span>
        </div>
    )

    return (
        <Card className="border-border/60">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Key className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg font-semibold">Sign-in providers</CardTitle>
                </div>
                <CardDescription>
                    Configure Google and GitHub social sign-in. Credentials are encrypted at rest and applied without a restart.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Google */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium">Google</h3>
                        {status && <StatusBadge configured={status.google_configured} source={status.google_source} />}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label className="text-xs">Client ID</Label>
                            <Input value={googleId} onChange={(e) => setGoogleId(e.target.value)} placeholder="xxxx.apps.googleusercontent.com" disabled={loading} />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">Client Secret {status?.google_has_client_secret && <span className="text-muted-foreground font-normal">· leave blank to keep</span>}</Label>
                            <Input type="password" value={googleSecret} onChange={(e) => setGoogleSecret(e.target.value)} placeholder={status?.google_has_client_secret ? "••••••••" : "GOCSPX-…"} disabled={loading} />
                        </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Also used for Google Calendar integration.</p>
                    <Button size="sm" onClick={saveGoogle} disabled={savingGoogle || loading}>{savingGoogle ? "Saving…" : "Save Google"}</Button>
                </div>

                <Separator />

                {/* GitHub */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium">GitHub (sign-in)</h3>
                        {status && <StatusBadge configured={status.github_configured} source={status.github_source} />}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label className="text-xs">Client ID</Label>
                            <Input value={githubId} onChange={(e) => setGithubId(e.target.value)} placeholder="Iv1.xxxxxxxx" disabled={loading} />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">Client Secret {status?.github_has_client_secret && <span className="text-muted-foreground font-normal">· leave blank to keep</span>}</Label>
                            <Input type="password" value={githubSecret} onChange={(e) => setGithubSecret(e.target.value)} placeholder={status?.github_has_client_secret ? "••••••••" : "client secret"} disabled={loading} />
                        </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">This is for GitHub <strong>login</strong>, separate from the GitHub repo integration above.</p>
                    <Button size="sm" onClick={saveGithub} disabled={savingGithub || loading}>{savingGithub ? "Saving…" : "Save GitHub"}</Button>
                </div>
            </CardContent>
        </Card>
    )
}
