"use client"

// AppsCard — the admin app directory. Install/configure third-party apps that
// provide slash commands (Giphy, Zoom, Jira, custom bots, …). Secrets are
// write-only: the API never returns them, the UI only shows "configured"
// state, matching the AI-provider and webhook security model.

import React, { useCallback, useEffect, useState } from "react"
import useSWR, { mutate as globalMutate } from "swr"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet"
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { Plus, Trash2, Check, X, RefreshCw, Terminal, Upload, Loader2, ImageIcon } from "@/lib/icons"
import { Plug } from "lucide-react"
import {
    listApps, createApp, updateApp, deleteApp, setAppEnabled, disconnectApp, startOAuthInstall, getApp, testApp,
} from "@/services/appService"
import { useUploadFile } from "@/hooks/useUploadFile"
import MarketplaceCard from "@/components/admin/MarketplaceCard"
import AppIcon from "@/components/admin/AppIcon"
import type { AppView, AppCommandInput, CreateAppRequest } from "@/types/app"

const KIND_LABELS: Record<string, string> = {
    builtin: "Built-in",
    external: "External",
    oauth: "OAuth",
}

export default function AppsCard() {
    const { toast } = useToast()
    const { data: apps, isLoading, mutate } = useSWR("admin-apps", listApps, { revalidateOnFocus: false })

    const [createOpen, setCreateOpen] = useState(false)
    const [editApp, setEditApp] = useState<AppView | null>(null)
    const [confirmDelete, setConfirmDelete] = useState<AppView | null>(null)
    const [busy, setBusy] = useState(false)

    // Surface OAuth callback result (?oauth=success|error) as a toast.
    useEffect(() => {
        if (typeof window === "undefined") return
        const params = new URLSearchParams(window.location.search)
        const oauth = params.get("oauth")
        if (oauth === "success") {
            toast({ title: "App connected", description: "OAuth authorization completed." })
            mutate()
        } else if (oauth === "error") {
            toast({ title: "Connection failed", description: "OAuth authorization failed.", variant: "destructive" })
        }
        if (oauth) {
            const clean = window.location.pathname + "?tab=apps"
            window.history.replaceState({}, document.title, clean)
        }
    }, [toast, mutate])

    const handleToggle = useCallback(async (app: AppView, enabled: boolean) => {
        try {
            await setAppEnabled(app.id, enabled)
            mutate()
        } catch {
            toast({ title: "Failed to update app", variant: "destructive" })
        }
    }, [mutate, toast])

    const handleDelete = useCallback(async () => {
        if (!confirmDelete) return
        setBusy(true)
        try {
            await deleteApp(confirmDelete.id)
            toast({ title: "App removed" })
            setConfirmDelete(null)
            mutate()
            globalMutate("admin-marketplace")
        } catch {
            toast({ title: "Failed to remove app", variant: "destructive" })
        } finally {
            setBusy(false)
        }
    }, [confirmDelete, mutate, toast])

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="flex items-center justify-between mb-4 shrink-0">
                <div>
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Plug className="h-5 w-5 text-primary" /> Apps & Integrations
                    </h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Install apps that add slash commands to your workspace.
                    </p>
                </div>
                <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-1.5">
                    <Plus className="h-4 w-4" /> Add app
                </Button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
                {/* Curated one-click marketplace at the top — the primary way to
                    add apps. The manual "Add app" button covers custom apps. */}
                <MarketplaceCard
                    onConfigure={async (appId) => {
                        const app = await getApp(appId)
                        if (app) setEditApp(app)
                    }}
                    onChanged={() => mutate()}
                />

                <div className="pt-4 mt-2 border-t border-border/60">
                    <h3 className="text-sm font-semibold mb-2">Installed apps</h3>
                </div>

                {isLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                        <RefreshCw className="h-4 w-4 animate-spin" /> Loading apps…
                    </div>
                )}
                {!isLoading && (!apps || apps.length === 0) && (
                    <div className="text-center py-8 text-muted-foreground">
                        <Plug className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        <p className="text-sm">No apps installed yet.</p>
                        <p className="text-xs mt-1">Install one above, or add a custom integration.</p>
                    </div>
                )}
                {apps?.map((app) => (
                    <AppRow
                        key={app.id}
                        app={app}
                        onToggle={handleToggle}
                        onEdit={() => setEditApp(app)}
                        onDelete={() => setConfirmDelete(app)}
                        onConnect={() => startOAuthInstall(app.id)}
                        onDisconnect={async () => {
                            try {
                                await disconnectApp(app.id)
                                mutate()
                            } catch {
                                toast({ title: "Failed to disconnect", variant: "destructive" })
                            }
                        }}
                    />
                ))}
            </div>

            {createOpen && (
                <AppEditor
                    onClose={() => setCreateOpen(false)}
                    onSaved={() => { setCreateOpen(false); mutate(); globalMutate("admin-marketplace") }}
                />
            )}
            {editApp && (
                <AppEditor
                    app={editApp}
                    onClose={() => setEditApp(null)}
                    onSaved={() => { setEditApp(null); mutate(); globalMutate("admin-marketplace") }}
                />
            )}

            <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Remove {confirmDelete?.name}?</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        This removes the app, its commands, and any stored credentials. This cannot be undone.
                    </p>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={busy}>
                            {busy ? "Removing…" : "Remove app"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

function AppRow({
    app, onToggle, onEdit, onDelete, onConnect, onDisconnect,
}: {
    app: AppView
    onToggle: (app: AppView, enabled: boolean) => void
    onEdit: () => void
    onDelete: () => void
    onConnect: () => void
    onDisconnect: () => void
}) {
    return (
        <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-card p-3">
            <AppIcon src={app.icon_url} alt={app.name} size="sm" />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{app.name}</span>
                    <Badge variant="secondary" className="text-[10px]">{KIND_LABELS[app.kind] || app.kind}</Badge>
                    {app.kind === "oauth" && (
                        app.is_connected
                            ? <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"><Check className="h-3 w-3 mr-0.5" />Connected</Badge>
                            : <Badge variant="outline" className="text-[10px]"><X className="h-3 w-3 mr-0.5" />Not connected</Badge>
                    )}
                    {app.has_api_key && (
                        <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"><Check className="h-3 w-3 mr-0.5" />Key set</Badge>
                    )}
                </div>
                {app.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{app.description}</p>}
                {(app.commands?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                        {(app.commands || []).slice(0, 6).map((c) => (
                            <span key={c.id} className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5 font-mono">
                                <Terminal className="h-2.5 w-2.5" />/{c.command}
                            </span>
                        ))}
                    </div>
                )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
                {app.kind === "oauth" && (
                    app.is_connected
                        ? <Button size="sm" variant="ghost" onClick={onDisconnect}>Disconnect</Button>
                        : <Button size="sm" variant="outline" onClick={onConnect}>Connect</Button>
                )}
                <Switch checked={app.is_enabled} onCheckedChange={(v) => onToggle(app, v)} aria-label="Enable app" />
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit} aria-label="Edit app">
                    <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={onDelete} aria-label="Remove app">
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    )
}

// AppEditor — create or edit an app, including commands and secrets.
function AppEditor({ app, onClose, onSaved }: { app?: AppView; onClose: () => void; onSaved: () => void }) {
    const { toast } = useToast()
    const isEdit = !!app
    const [busy, setBusy] = useState(false)
    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

    const [name, setName] = useState(app?.name ?? "")
    const [slug, setSlug] = useState(app?.slug ?? "")
    const [description, setDescription] = useState(app?.description ?? "")
    const [iconUrl, setIconUrl] = useState(app?.icon_url ?? "")
    const [kind, setKind] = useState<"external" | "oauth">((app?.kind as "external" | "oauth") ?? "external")
    const isBuiltin = app?.kind === "builtin"
    const [handlerUrl, setHandlerUrl] = useState(app?.handler_url ?? "")
    const [apiKey, setApiKey] = useState("")
    const [signingSecret, setSigningSecret] = useState("")

    // OAuth fields
    const [clientId, setClientId] = useState("")
    const [clientSecret, setClientSecret] = useState("")
    const [authUrl, setAuthUrl] = useState("")
    const [tokenUrl, setTokenUrl] = useState("")
    const [scopes, setScopes] = useState("")

    const [commands, setCommands] = useState<AppCommandInput[]>(
        (app?.commands || []).map((c) => ({
            command: c.command, description: c.description, usage_hint: c.usage_hint,
            exec_mode: c.exec_mode, response_type: c.response_type,
        })) ?? [],
    )

    const addCommand = () => setCommands((cs) => [...cs, { command: "", description: "", exec_mode: "external", response_type: "ephemeral" }])
    const updateCommand = (i: number, patch: Partial<AppCommandInput>) =>
        setCommands((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
    const removeCommand = (i: number) => setCommands((cs) => cs.filter((_, idx) => idx !== i))

    const handleSave = async () => {
        if (!name.trim() || (!isEdit && !slug.trim())) {
            toast({ title: "Name and slug are required", variant: "destructive" })
            return
        }
        setBusy(true)
        try {
            const oauthConfig = kind === "oauth" ? {
                client_id: clientId,
                client_secret: clientSecret || undefined,
                auth_url: authUrl,
                token_url: tokenUrl,
                scopes: scopes ? scopes.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
            } : undefined

            const secrets: Record<string, string> = {}
            if (apiKey) secrets.api_key = apiKey

            if (isEdit && app) {
                await updateApp(app.id, {
                    name, description, icon_url: iconUrl, handler_url: handlerUrl || undefined,
                    signing_secret: signingSecret || undefined,
                    oauth_config: oauthConfig,
                    secrets: Object.keys(secrets).length ? secrets : undefined,
                    commands,
                })
                toast({ title: "App updated" })
            } else {
                const req: CreateAppRequest = {
                    slug, name, description, icon_url: iconUrl, kind,
                    handler_url: handlerUrl || undefined,
                    signing_secret: signingSecret || undefined,
                    oauth_config: oauthConfig,
                    secrets: Object.keys(secrets).length ? secrets : undefined,
                    commands,
                }
                await createApp(req)
                toast({ title: "App installed" })
            }
            onSaved()
        } catch (e) {
            const msg = (e as { response?: { data?: { msg?: string } } })?.response?.data?.msg
            toast({ title: "Failed to save app", description: msg, variant: "destructive" })
        } finally {
            setBusy(false)
        }
    }

    return (
        <Sheet open onOpenChange={(o) => !o && onClose()}>
            <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>{isEdit ? `Edit ${app?.name}` : "Add app"}</SheetTitle>
                    <SheetDescription>
                        Configure an integration and the slash commands it provides. Secrets are stored encrypted and never shown again.
                    </SheetDescription>
                </SheetHeader>

                <div className="space-y-4 py-4">
                    <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Giphy" /></Field>
                    {!isEdit && (
                        <Field label="Slug" hint="lowercase id, e.g. giphy">
                            <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="giphy" />
                        </Field>
                    )}
                    <Field label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Search and send GIFs" /></Field>
                    <IconField value={iconUrl} onChange={setIconUrl} />

                    {!isEdit && (
                        <Field label="Type">
                            <div className="flex gap-2">
                                <Button type="button" size="sm" variant={kind === "external" ? "default" : "outline"} onClick={() => setKind("external")}>External</Button>
                                <Button type="button" size="sm" variant={kind === "oauth" ? "default" : "outline"} onClick={() => setKind("oauth")}>OAuth</Button>
                            </div>
                        </Field>
                    )}

                    {isBuiltin && (
                        <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
                            This is a built-in OneCamp app. It runs in-process — no handler URL or
                            signing secret needed. Just add any required credential below.
                        </div>
                    )}

                    {!isBuiltin && (
                        <Field label="Handler URL" hint="where command payloads are POSTed (external apps)">
                            <Input value={handlerUrl} onChange={(e) => setHandlerUrl(e.target.value)} placeholder="https://your-app.example.com/commands" />
                        </Field>
                    )}

                    <Field label="API key" hint={app?.has_api_key ? "configured — leave blank to keep, or paste a new key to replace" : "stored encrypted (e.g. Giphy key)"}>
                        <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={app?.has_api_key ? "•••••••• (saved)" : "••••••••"} />
                    </Field>

                    {!isBuiltin && (
                        <Field label="Signing secret" hint="HMAC for outbound dispatch — leave blank to auto-generate">
                            <Input type="password" value={signingSecret} onChange={(e) => setSigningSecret(e.target.value)} placeholder="auto-generated if blank" />
                        </Field>
                    )}

                    {kind === "oauth" && (
                        <div className="rounded-lg border border-border/60 p-3 space-y-3">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">OAuth configuration</p>
                            <Field label="Client ID"><Input value={clientId} onChange={(e) => setClientId(e.target.value)} /></Field>
                            <Field label="Client secret" hint="stored encrypted"><Input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} /></Field>
                            <Field label="Authorize URL"><Input value={authUrl} onChange={(e) => setAuthUrl(e.target.value)} placeholder="https://provider.com/oauth/authorize" /></Field>
                            <Field label="Token URL"><Input value={tokenUrl} onChange={(e) => setTokenUrl(e.target.value)} placeholder="https://provider.com/oauth/token" /></Field>
                            <Field label="Scopes" hint="comma-separated"><Input value={scopes} onChange={(e) => setScopes(e.target.value)} placeholder="read,write" /></Field>
                        </div>
                    )}

                    <div className="rounded-lg border border-border/60 p-3 space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Commands</p>
                            {!isBuiltin && (
                                <Button type="button" size="sm" variant="outline" className="h-7 gap-1" onClick={addCommand}>
                                    <Plus className="h-3 w-3" /> Add
                                </Button>
                            )}
                        </div>
                        {isBuiltin ? (
                            <div className="flex flex-wrap gap-1.5">
                                {commands.length === 0 && <p className="text-xs text-muted-foreground">No commands.</p>}
                                {commands.map((c, i) => (
                                    <span key={i} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted rounded px-2 py-1 font-mono">
                                        <Terminal className="h-3 w-3" />/{c.command}
                                        {c.usage_hint ? <span className="opacity-60">{c.usage_hint}</span> : null}
                                    </span>
                                ))}
                                <p className="w-full text-[11px] text-muted-foreground/80 mt-1">
                                    Built-in commands are provided by OneCamp and can&apos;t be edited.
                                </p>
                            </div>
                        ) : (
                            <>
                                {commands.length === 0 && <p className="text-xs text-muted-foreground">No commands yet.</p>}
                                {commands.map((c, i) => (
                                    <div key={i} className="flex items-start gap-2">
                                        <div className="flex-1 space-y-1.5">
                                            <div className="flex items-center gap-1">
                                                <span className="text-sm text-muted-foreground">/</span>
                                                <Input value={c.command} onChange={(e) => updateCommand(i, { command: e.target.value })} placeholder="giphy" className="h-8" />
                                            </div>
                                            <Input value={c.description} onChange={(e) => updateCommand(i, { description: e.target.value })} placeholder="Description" className="h-8" />
                                            <Input value={c.usage_hint ?? ""} onChange={(e) => updateCommand(i, { usage_hint: e.target.value })} placeholder="Usage hint (optional)" className="h-8" />
                                        </div>
                                        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeCommand(i)}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                </div>

                {testResult && (
                    <div
                        className={`mb-2 rounded-lg border p-2.5 text-xs ${
                            testResult.success
                                ? "border-emerald-400/50 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                                : "border-destructive/50 bg-destructive/10 text-destructive"
                        }`}
                    >
                        {testResult.success ? "✓ " : "✕ "}{testResult.message}
                    </div>
                )}

                <SheetFooter>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    {isEdit && app && (
                        <Button
                            type="button"
                            variant="outline"
                            disabled={testing || busy}
                            onClick={async () => {
                                setTesting(true)
                                setTestResult(null)
                                try {
                                    const r = await testApp(app.id)
                                    setTestResult(r)
                                } catch {
                                    setTestResult({ success: false, message: "Test request failed." })
                                } finally {
                                    setTesting(false)
                                }
                            }}
                        >
                            {testing ? "Testing…" : "Test"}
                        </Button>
                    )}
                    <Button onClick={handleSave} disabled={busy}>{busy ? "Saving…" : isEdit ? "Save changes" : "Install app"}</Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <Label className="text-xs font-medium">{label}{hint && <span className="text-muted-foreground font-normal ml-1.5">· {hint}</span>}</Label>
            {children}
        </div>
    )
}

// IconField lets an admin upload an image OR paste a URL for the app icon.
// Uploads go through the existing AV-scanned public upload pipeline; the stored
// value is a stable backend serve URL (/public/app-icon/{uuid}) that resolves
// to a freshly presigned MinIO URL on each request, so it never expires.
function IconField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const { toast } = useToast()
    const { makeRequestToUploadToPublic, validateFiles, uploadLimitMB } = useUploadFile()
    const [uploading, setUploading] = useState(false)
    const inputRef = React.useRef<HTMLInputElement>(null)

    const backendBase = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/+$/, "")

    const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files || files.length === 0) return
        // Defence-in-depth: enforce the workspace upload limit before sending.
        const ok = validateFiles(files)
        if (ok.length === 0) {
            if (inputRef.current) inputRef.current.value = ""
            return
        }
        const file = ok[0]
        if (!file.type.startsWith("image/")) {
            toast({ title: "Please choose an image file", variant: "destructive" })
            if (inputRef.current) inputRef.current.value = ""
            return
        }
        setUploading(true)
        try {
            const dt = new DataTransfer()
            dt.items.add(file)
            const res = await makeRequestToUploadToPublic(dt.files)
            const objUuid = res?.[0]?.object_uuid
            if (!objUuid) throw new Error("no object id")
            onChange(`${backendBase}/public/app-icon/${objUuid}`)
            toast({ title: "Icon uploaded" })
        } catch {
            toast({ title: "Failed to upload icon", variant: "destructive" })
        } finally {
            setUploading(false)
            if (inputRef.current) inputRef.current.value = ""
        }
    }

    return (
        <div className="space-y-1.5">
            <Label className="text-xs font-medium">
                Icon
                <span className="text-muted-foreground font-normal ml-1.5">· upload an image or paste a URL</span>
            </Label>
            <div className="flex items-center gap-3">
                <div className="h-12 w-12 shrink-0 rounded-lg border border-border/70 bg-muted flex items-center justify-center overflow-hidden">
                    {value ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={value} alt="icon preview" className="h-full w-full object-cover" />
                    ) : (
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    )}
                </div>
                <div className="flex-1 space-y-1.5">
                    <Input
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder="https://…/icon.png"
                        className="h-8"
                    />
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1.5"
                            disabled={uploading}
                            onClick={() => inputRef.current?.click()}
                        >
                            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                            {uploading ? "Uploading…" : "Upload image"}
                        </Button>
                        {value && (
                            <Button type="button" size="sm" variant="ghost" className="h-7 text-muted-foreground" onClick={() => onChange("")}>
                                Remove
                            </Button>
                        )}
                        <span className="text-[10px] text-muted-foreground">PNG, JPG, GIF, WebP · max {uploadLimitMB} MB</span>
                    </div>
                </div>
                <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,image/x-icon" className="hidden" onChange={handlePick} />
            </div>
        </div>
    )
}
