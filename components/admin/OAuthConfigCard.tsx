"use client"

// OAuthConfigCard — admin UI to manage login OAuth credentials (Google +
// GitHub sign-in, and the Microsoft app Outlook Calendar connects through)
// without env files or redeploys. Only an admin reads or saves them. Secrets are write-only:
// the API returns only has_* booleans and a source indicator, never the value.
// Saving reloads the providers server-side, so changes take effect immediately.

import React, { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { SpotPlug } from "@/components/ui/graphics"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { SaveBar, SettingsList, SettingsSection } from "@/components/ui/settingsSection"
import { ConnectionCard, SourceMark, StateWord } from "@/components/admin/connectParts"
import { useToast } from "@/hooks/use-toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { AdminGet, AdminPost } from "@/services/endpoints/admin"
import { OutlookHowTo } from "@/components/admin/outlookHowTo"

interface OAuthConfigStatus {
    google_client_id: string
    google_has_client_secret: boolean
    google_configured: boolean
    google_source: "db" | "env" | "none"
    github_client_id: string
    github_has_client_secret: boolean
    github_configured: boolean
    github_source: "db" | "env" | "none"
    microsoft_client_id?: string
    microsoft_has_client_secret?: boolean
    microsoft_configured?: boolean
    microsoft_source?: "db" | "env" | "none"
}

type Provider = "google" | "github" | "microsoft"

/** Where a provider's credentials come from, as a short phrase; nothing when unset. */
const SOURCE: Record<string, string> = {
    db: "saved here",
    env: "from the server's environment",
}

const PROVIDERS: {
    key: Provider
    name: string
    /** The card's name where it isn't "<name> sign-in". */
    label?: string
    idPlaceholder: string
    secretPlaceholder: string
    help: React.ReactNode
    /** Steps to set it up, above its fields (the Microsoft app's). */
    steps?: React.ReactNode
}[] = [
    {
        key: "google",
        name: "Google",
        idPlaceholder: "xxxx.apps.googleusercontent.com",
        secretPlaceholder: "GOCSPX-…",
        help: "Also used for the Google Calendar connection.",
    },
    {
        key: "github",
        name: "GitHub",
        idPlaceholder: "Iv1.xxxxxxxx",
        secretPlaceholder: "Client secret…",
        help: (
            <>
                For signing in with GitHub, separate from the GitHub repository connection above.
            </>
        ),
    },
    {
        // Calendar B7: each install brings its own free Azure app.
        key: "microsoft",
        name: "Microsoft",
        label: "Microsoft app for Outlook Calendar",
        idPlaceholder: "Application (client) ID",
        secretPlaceholder: "Client secret value…",
        help: "For Outlook Calendar: people connect their own Outlook with it (it isn't a way to sign in).",
        steps: <OutlookHowTo />,
    },
]

/** A card's name, for its label and what saving it says: "Google sign-in", "Microsoft app for Outlook Calendar". */
const nameOf = (p: (typeof PROVIDERS)[number]) => p.label ?? `${p.name} sign-in`

type Draft = Record<Provider, { id: string; secret: string }>
/** Each provider's saved id, and no secret: the page never holds one it didn't type. */
const draftOf = (s?: OAuthConfigStatus | null) =>
    Object.fromEntries(PROVIDERS.map((p) => [p.key, { id: s?.[`${p.key}_client_id`] ?? "", secret: "" }])) as Draft

export default function OAuthConfigCard() {
    const { toast } = useToast()
    const [status, setStatus] = useState<OAuthConfigStatus | null>(null)
    const [state, setState] = useState<"loading" | "failed" | "ready">("loading")
    const [loadError, setLoadError] = useState("")
    const [draft, setDraft] = useState<Draft>(draftOf)
    const [saving, setSaving] = useState(false)

    // A failed load used to leave the fields empty and both providers looking
    // unset, beside a toast that soon left.
    const load = () => {
        setState("loading")
        axiosInstance
            .get(AdminGet.GetOAuthConfig)
            .then((res) => {
                const s = (res.data as { data?: OAuthConfigStatus })?.data ?? null
                if (!s) {
                    setState("failed")
                    return
                }
                setStatus(s)
                setDraft(draftOf(s))
                setState("ready")
            })
            .catch((e) => {
                setLoadError(apiErrorMessage(e))
                setState("failed")
            })
    }

    useEffect(() => {
        load()
    }, [])

    const changed = (p: Provider) =>
        !!status && (draft[p].id !== (status[`${p}_client_id`] ?? "") || draft[p].secret !== "")
    const dirty = PROVIDERS.some((p) => changed(p.key))

    const set = (p: Provider, field: "id" | "secret", value: string) =>
        setDraft((d) => ({ ...d, [p]: { ...d[p], [field]: value } }))

    // One save for the card, sending only the provider that changed, and only
    // the fields that did; it was a Save button per provider.
    const save = async () => {
        if (!status) return
        setSaving(true)
        const saved: string[] = []
        try {
            for (const p of PROVIDERS) {
                if (!changed(p.key)) continue
                const body: Record<string, string> = {}
                if (draft[p.key].id !== (status[`${p.key}_client_id`] ?? "")) body[`${p.key}_client_id`] = draft[p.key].id
                if (draft[p.key].secret) body[`${p.key}_client_secret`] = draft[p.key].secret
                try {
                    await axiosInstance.post(AdminPost.UpdateOAuthConfig, body, OWN_ERRORS)
                } catch (e) {
                    toast({ title: `Couldn't save the ${nameOf(p)}`, description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
                    return
                }
                saved.push(nameOf(p))
            }
            toast({ title: `${new Intl.ListFormat("en", { type: "conjunction" }).format(saved)} saved` })
            load()
        } finally {
            setSaving(false)
        }
    }

    let body: React.ReactNode
    if (state === "loading") {
        body = (
            <SettingsList>
                {PROVIDERS.map((p, i) => (
                    <div
                        key={p.key}
                        aria-busy={i === 0 ? "true" : undefined}
                        aria-label={i === 0 ? "Loading the sign-in providers" : undefined}
                        aria-hidden={i === 0 ? undefined : "true"}
                        className="space-y-3 px-4 py-3"
                    >
                        <Skeleton className="h-4 w-24" />
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                        </div>
                    </div>
                ))}
            </SettingsList>
        )
    } else if (state === "failed" || !status) {
        body = <ErrorState compact subject="the sign-in providers" detail={loadError || undefined} onRetry={load} />
    } else {
        const noneSetUp = !status.google_configured && !status.github_configured
        body = (
            <>
                {/* Nothing connected yet: the connections group's plug, in its
                    hue, saying what happens meanwhile, above the fields that
                    connect one. */}
                {noneSetUp && (
                    <EmptyState
                        illustration={<SpotPlug hue={ADMIN_GROUP_HUE.connections} />}
                        title="No sign-in provider is set up"
                        description="People sign in with their email and password until you add Google or GitHub below."
                        className="py-6"
                    />
                )}
                {/* Each provider is a connection card (design v3, A18): its mark,
                    its name, set up or not, and its two fields under it. One
                    save dock for both, since the form spans the two cards. */}
                <div className="space-y-3">
                    {PROVIDERS.map((p) => {
                        const configured = status[`${p.key}_configured`]
                        const hasSecret = status[`${p.key}_has_client_secret`]
                        const source = SOURCE[status[`${p.key}_source`] ?? "none"]
                        const helpId = `${p.key}-oauth-help`
                        return (
                            <ConnectionCard
                                key={p.key}
                                id={`integrations-oauth-${p.key}`}
                                aria-label={nameOf(p)}
                                mark={<SourceMark vendor={p.key} name={p.name} />}
                                name={p.name}
                                state={
                                    <StateWord tone={configured ? "success" : "neutral"}>
                                        <span>{configured ? "Set up" : "Not set up"}</span>
                                        {source && <span className="font-normal text-muted-foreground">, {source}</span>}
                                    </StateWord>
                                }
                            >
                                <div className="cx-int-step space-y-3">
                                    {p.steps}
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="space-y-1.5">
                                            <Label htmlFor={`${p.key}-client-id`} className="text-xs text-muted-foreground">
                                                Client ID<span className="sr-only"> for {p.name}</span>
                                            </Label>
                                            <Input
                                                id={`${p.key}-client-id`}
                                                name={`${p.key}-client-id`}
                                                autoComplete="off"
                                                spellCheck={false}
                                                value={draft[p.key].id}
                                                onChange={(e) => set(p.key, "id", e.target.value)}
                                                placeholder={p.idPlaceholder}
                                                aria-describedby={helpId}
                                                className="h-8"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor={`${p.key}-client-secret`} className="text-xs text-muted-foreground">
                                                Client secret<span className="sr-only"> for {p.name}</span>
                                            </Label>
                                            {/* new-password: a browser never fills the admin's own saved
                                                password into a secret field and saves it as the secret. */}
                                            <Input
                                                id={`${p.key}-client-secret`}
                                                name={`${p.key}-client-secret`}
                                                type="password"
                                                autoComplete="new-password"
                                                spellCheck={false}
                                                value={draft[p.key].secret}
                                                onChange={(e) => set(p.key, "secret", e.target.value)}
                                                placeholder={hasSecret ? "Saved" : p.secretPlaceholder}
                                                aria-describedby={helpId}
                                                className="h-8"
                                            />
                                        </div>
                                    </div>
                                    <p id={helpId} className="text-xs text-muted-foreground text-pretty">
                                        {p.help}
                                        {hasSecret ? " Leave the secret empty to keep the current one." : ""}
                                    </p>
                                </div>
                            </ConnectionCard>
                        )
                    })}
                </div>
                <SaveBar
                    dirty={dirty}
                    saving={saving}
                    onSave={() => void save()}
                    onDiscard={() => setDraft(draftOf(status))}
                    what="sign-in provider changes"
                />
            </>
        )
    }

    return (
        <SettingsSection
            id="integrations-oauth"
            title="Sign-in providers"
            description="Let people sign in with Google or GitHub, and connect Outlook Calendar through a Microsoft app. Secrets are stored encrypted and never shown again; changes apply without a restart."
        >
            {body}
        </SettingsSection>
    )
}
