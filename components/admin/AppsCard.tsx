"use client"

// AppsCard — the admin app directory. Install/configure third-party apps that
// provide slash commands (Giphy, Zoom, Jira, custom bots, …). Secrets are
// write-only: the API never returns them, the UI only shows "configured"
// state, matching the AI-provider and webhook security model.

import React, { useCallback, useEffect, useId, useRef, useState } from "react"
import useSWR from "swr"
import { appMutate as globalMutate } from "@/lib/swrMutate"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Field } from "@/components/ui/field"
import { ErrorState } from "@/components/ui/error-state"
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet"
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { Plus, Trash2, Check, X, Upload, Loader2, ImageIcon, Pencil } from "@/lib/icons"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { SettingsSection, sectionActionClass } from "@/components/ui/settingsSection"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { StatusWord } from "@/components/ui/statusWord"
import {
    listApps, createApp, updateApp, deleteApp, setAppEnabled, disconnectApp, startOAuthInstall, getApp, testApp,
} from "@/services/appService"
import { useUploadFile } from "@/hooks/useUploadFile"
import MarketplaceCard from "@/components/admin/MarketplaceCard"
import AppIcon from "@/components/admin/AppIcon"
import { CommandChip } from "@/components/admin/appParts"
import type { AppView, AppCommandInput, CreateAppRequest } from "@/types/app"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { SpotPlug } from "@/components/ui/graphics"

const KIND_LABELS: Record<string, string> = {
    builtin: "Built-in",
    external: "External",
    oauth: "OAuth",
}

const KIND_OPTIONS = [
    { value: "external", label: "External" },
    { value: "oauth", label: "OAuth" },
] as const

/**
 * One installed app's row while the list loads, in a loaded row's shape: the
 * icon, the name and its line, the switch and two buttons. A block of generic
 * 40px lines used to stand in for it.
 */
function AppRowSkeleton() {
    return (
        <div data-app-skeleton-row="" aria-hidden="true" className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-9 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-56 max-w-full" />
            </div>
            <div className="hidden shrink-0 items-center gap-1 sm:flex">
                <Skeleton className="mr-1 h-5 w-9 rounded-full" />
                <Skeleton className="size-8 rounded-md" />
                <Skeleton className="size-8 rounded-md" />
            </div>
        </div>
    )
}

export default function AppsCard() {
    const { toast } = useToast()
    const confirm = useConfirm()
    const { data: apps, isLoading, error, mutate } = useSWR("admin-apps", listApps, { revalidateOnFocus: false })

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
            toast({ title: "Couldn't connect the app", description: "The provider didn't finish the sign-in. Press Connect to try again.", variant: "destructive" })
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
        } catch (e) {
            toast({
                title: enabled ? `Couldn't turn on ${app.name}` : `Couldn't turn off ${app.name}`,
                description: apiErrorMessage(e, "Try again in a moment."),
                variant: "destructive",
            })
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
        } catch (e) {
            toast({ title: `Couldn't remove ${confirmDelete.name}`, description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
        } finally {
            setBusy(false)
        }
    }, [confirmDelete, mutate, toast])

    // Disconnecting ends the app's access to its provider account, so it asks
    // first and says what stops. It used to happen on one click.
    const handleDisconnect = (app: AppView) =>
        confirm({
            title: `Disconnect the ${app.name} app?`,
            description: `Its commands stop working until someone connects ${app.name} again. Its settings stay.`,
            confirmText: "Disconnect app",
            destructive: true,
            onConfirm: async () => {
                try {
                    await disconnectApp(app.id)
                    mutate()
                } catch (e) {
                    toast({ title: `Couldn't disconnect ${app.name}`, description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
                }
            },
        })

    const installedApps = apps ?? []

    return (
        // One section like every other admin tab: an h2 and its action on the
        // title's row. Installed apps first, the shorter list and the one an
        // admin comes back to manage; it used to sit under the whole
        // directory, a long scroll down. The directory follows, to add more.
        <SettingsSection
            title="Apps"
            description="Apps add slash commands, like /giphy or /zoom, to every conversation."
            action={
                // Outline: the directory is the main way in, one click per app;
                // this is for an app of your own.
                <Button onClick={() => setCreateOpen(true)} size="sm" variant="outline" className={cn(sectionActionClass, "gap-1.5")}>
                    <Plus className="h-4 w-4" /> Add your own app
                </Button>
            }
        >
            <div className="space-y-8">
                <SettingsSection level={3} title="Installed apps">
                    {isLoading ? (
                        <div role="status" aria-label="Loading the installed apps" className="divide-y divide-border rounded-lg border border-border">
                            {[0, 1, 2].map((i) => <AppRowSkeleton key={i} />)}
                        </div>
                    ) : error ? (
                        // Before the empty case: a failed read said "No apps installed yet".
                        <ErrorState compact subject="the installed apps" detail={apiErrorMessage(error) || undefined} onRetry={() => void mutate()} />
                    ) : installedApps.length === 0 ? (
                        <EmptyState
                            illustration={<SpotPlug hue={ADMIN_GROUP_HUE.connections} />}
                            title="No apps installed yet"
                            description="Install one from the directory below, or add an app of your own."
                        />
                    ) : (
                        <div className="divide-y divide-border rounded-lg border border-border">
                            {installedApps.map((app) => (
                                <AppRow
                                    key={app.id}
                                    app={app}
                                    onToggle={handleToggle}
                                    onEdit={() => setEditApp(app)}
                                    onDelete={() => setConfirmDelete(app)}
                                    onConnect={() => startOAuthInstall(app.id)}
                                    onDisconnect={() => handleDisconnect(app)}
                                />
                            ))}
                        </div>
                    )}
                </SettingsSection>

                {/* The curated one-click directory: the primary way to add apps.
                    "Add your own app" covers custom ones. */}
                <MarketplaceCard
                    onConfigure={async (appId) => {
                        const app = await getApp(appId)
                        if (app) setEditApp(app)
                    }}
                    onChanged={() => mutate()}
                />
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
        </SettingsSection>
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
        // Below sm the controls fold under the words, so four controls never
        // squeeze the name and its line into a hundred pixels at 390.
        <div data-app-row="" className="flex items-start gap-3 px-4 py-3 sm:items-center">
            <AppIcon src={app.icon_url} alt={app.name} size="sm" />
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="truncate text-sm font-medium">{app.name}</span>
                    <span className="text-xs text-muted-foreground">{KIND_LABELS[app.kind] || app.kind}</span>
                    {app.kind === "oauth" && (
                        <StatusWord tone={app.is_connected ? "success" : "neutral"} className="text-xs">{app.is_connected ? "Connected" : "Not connected"}</StatusWord>
                    )}
                    {app.has_api_key && <StatusWord tone="success" className="text-xs">Key set</StatusWord>}
                </div>
                {app.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{app.description}</p>}
                {(app.commands?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                        {(app.commands || []).slice(0, 6).map((c) => (
                            <CommandChip key={c.id} command={c.command} />
                        ))}
                    </div>
                )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
                {app.kind === "oauth" && (
                    app.is_connected
                        ? <Button size="sm" variant="ghost" className="mr-1 h-8" onClick={onDisconnect}>Disconnect</Button>
                        : <Button size="sm" variant="outline" className="mr-1 h-8" onClick={onConnect}>Connect</Button>
                )}
                <Switch checked={app.is_enabled} onCheckedChange={(v) => onToggle(app, v)} aria-label={`Use ${app.name}`} className="mr-1" />
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit} aria-label={`Edit ${app.name}`}>
                    <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-danger-ink hover:text-danger-ink" onClick={onDelete} aria-label={`Remove ${app.name}`}>
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
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
    const [errors, setErrors] = useState<{ name?: string; slug?: string }>({})
    const nameRef = useRef<HTMLInputElement>(null)
    const slugRef = useRef<HTMLInputElement>(null)
    const kindLabelId = useId()

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
        // Said under each field, with the cursor on the first: a toast
        // reading "Name and slug are required" was tied to neither.
        const next: typeof errors = {}
        if (!name.trim()) next.name = "Give the app a name."
        if (!isEdit && !slug.trim()) next.slug = "Give it a short name, like giphy."
        setErrors(next)
        if (next.name) {
            nameRef.current?.focus()
            return
        }
        if (next.slug) {
            slugRef.current?.focus()
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
            toast({ title: "Couldn't save the app", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
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
                    <Field label="Name" required error={errors.name}>
                        <Input
                            ref={nameRef}
                            value={name}
                            onChange={(e) => {
                                setName(e.target.value)
                                if (errors.name) setErrors((er) => ({ ...er, name: undefined }))
                            }}
                            placeholder="Giphy…"
                            autoComplete="off"
                        />
                    </Field>
                    {!isEdit && (
                        <Field label="Short name" required error={errors.slug} help="Lowercase, no spaces. It names the app in links.">
                            <Input
                                ref={slugRef}
                                value={slug}
                                onChange={(e) => {
                                    setSlug(e.target.value)
                                    if (errors.slug) setErrors((er) => ({ ...er, slug: undefined }))
                                }}
                                placeholder="giphy…"
                                spellCheck={false}
                                autoComplete="off"
                            />
                        </Field>
                    )}
                    <Field label="What it does">
                        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Search and send GIFs…" autoComplete="off" />
                    </Field>
                    <IconField value={iconUrl} onChange={setIconUrl} />

                    {!isEdit && (
                        // A choice of one: the app's segmented control. It was a
                        // hand-made pair that marked the choice with the page
                        // colour alone, 1.03:1 against its well.
                        <div className="grid gap-2">
                            <p id={kindLabelId} className="text-sm font-medium">Kind</p>
                            <SegmentedControl
                                aria-labelledby={kindLabelId}
                                value={kind}
                                onValueChange={setKind}
                                options={KIND_OPTIONS}
                                className="w-fit"
                            />
                            <p className="text-xs text-muted-foreground">
                                {kind === "oauth"
                                    ? "Each person connects their own account with the provider."
                                    : "Commands are sent to an address you run."}
                            </p>
                        </div>
                    )}

                    {isBuiltin && (
                        <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
                            This app is built into OneCamp, so it needs no command address or
                            signing secret. Add its key below if it needs one.
                        </div>
                    )}

                    {!isBuiltin && (
                        <Field label="Command address" help="Where commands are sent, for an external app.">
                            <Input value={handlerUrl} onChange={(e) => setHandlerUrl(e.target.value)} placeholder="https://your-app.example.com/commands…" type="url" inputMode="url" spellCheck={false} autoComplete="off" />
                        </Field>
                    )}

                    {/* new-password: a browser must not fill the admin's own
                        saved password into a key field and save it as the app's. */}
                    <Field label="API key" help={app?.has_api_key ? "A key is saved. Leave this empty to keep it, or paste a new one to replace it." : "Stored encrypted and never shown again."}>
                        <Input type="password" autoComplete="new-password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={app?.has_api_key ? "Saved" : ""} />
                    </Field>

                    {!isBuiltin && (
                        <Field label="Signing secret" help="Signs what is sent to the app. Leave it empty and one is made for you.">
                            <Input type="password" autoComplete="new-password" value={signingSecret} onChange={(e) => setSigningSecret(e.target.value)} />
                        </Field>
                    )}

                    {kind === "oauth" && (
                        <section className="space-y-3 rounded-lg border border-border p-3" aria-labelledby={`${kindLabelId}-oauth`}>
                            <h3 id={`${kindLabelId}-oauth`} className="text-sm font-medium">OAuth settings</h3>
                            <Field label="Client ID"><Input value={clientId} onChange={(e) => setClientId(e.target.value)} spellCheck={false} autoComplete="off" /></Field>
                            <Field label="Client secret" help="Stored encrypted."><Input type="password" autoComplete="new-password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} /></Field>
                            <Field label="Sign-in address"><Input value={authUrl} onChange={(e) => setAuthUrl(e.target.value)} placeholder="https://provider.com/oauth/authorize…" type="url" spellCheck={false} autoComplete="off" /></Field>
                            <Field label="Token address"><Input value={tokenUrl} onChange={(e) => setTokenUrl(e.target.value)} placeholder="https://provider.com/oauth/token…" type="url" spellCheck={false} autoComplete="off" /></Field>
                            <Field label="Scopes" help="Separated by commas."><Input value={scopes} onChange={(e) => setScopes(e.target.value)} placeholder="read,write…" spellCheck={false} autoComplete="off" /></Field>
                        </section>
                    )}

                    <section className="space-y-3 rounded-lg border border-border p-3" aria-labelledby={`${kindLabelId}-commands`}>
                        <div className="flex items-center justify-between">
                            <h3 id={`${kindLabelId}-commands`} className="text-sm font-medium">Commands</h3>
                            {!isBuiltin && (
                                <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={addCommand}>
                                    <Plus className="h-3 w-3" /> Add a command
                                </Button>
                            )}
                        </div>
                        {isBuiltin ? (
                            <div className="flex flex-wrap gap-1.5">
                                {commands.length === 0 && <p className="text-xs text-muted-foreground">No commands.</p>}
                                {commands.map((c, i) => (
                                    <CommandChip key={i} command={c.command} hint={c.usage_hint || undefined} />
                                ))}
                                <p className="w-full text-2xs text-muted-foreground/80 mt-1">
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
                                                <Input aria-label={`Command ${i + 1}`} value={c.command} onChange={(e) => updateCommand(i, { command: e.target.value })} placeholder="giphy…" className="h-8" spellCheck={false} autoComplete="off" />
                                            </div>
                                            <Input aria-label={`What command ${i + 1} does`} value={c.description} onChange={(e) => updateCommand(i, { description: e.target.value })} placeholder="What it does…" className="h-8" autoComplete="off" />
                                            <Input aria-label={`How to use command ${i + 1}`} value={c.usage_hint ?? ""} onChange={(e) => updateCommand(i, { usage_hint: e.target.value })} placeholder="How to use it (optional)…" className="h-8" autoComplete="off" />
                                        </div>
                                        <Button aria-label={`Remove command ${i + 1}`} type="button" size="icon" variant="ghost" className="h-8 w-8 text-danger-ink" onClick={() => removeCommand(i)}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                ))}
                            </>
                        )}
                    </section>
                </div>

                {testResult && (
                    <div
                        role="status"
                        className={cn(
                            "mb-2 flex items-start gap-1.5 rounded-lg border p-2.5 text-xs",
                            testResult.success
                                ? "border-success/50 bg-success/10 text-success-ink"
                                : "border-destructive/50 bg-destructive/10 text-danger-ink",
                        )}
                    >
                        {testResult.success ? <Check className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <X className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                        {testResult.message}
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
                                } catch (e) {
                                    setTestResult({ success: false, message: `The test didn't reach the app. ${apiErrorMessage(e, "Check its command address and try again.")}` })
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

// IconField lets an admin upload an image OR paste a URL for the app icon.
// Uploads go through the existing AV-scanned public upload pipeline; the stored
// value is a stable backend serve URL (/public/app-icon/{uuid}) that resolves
// to a freshly presigned MinIO URL on each request, so it never expires.
function IconField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const { toast } = useToast()
    const { makeRequestToUploadToPublic, validateFiles, uploadLimitMB } = useUploadFile()
    const [uploading, setUploading] = useState(false)
    const inputRef = React.useRef<HTMLInputElement>(null)
    const urlId = useId()

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
            toast({ title: "That file isn't an image", description: "Choose a PNG, JPG, GIF or WebP file.", variant: "destructive" })
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
        } catch (e) {
            toast({ title: "Couldn't upload the icon", description: apiErrorMessage(e, "Try again, or paste the image's address instead."), variant: "destructive" })
        } finally {
            setUploading(false)
            if (inputRef.current) inputRef.current.value = ""
        }
    }

    return (
        <div className="space-y-1.5">
            <Label htmlFor={urlId}>Icon</Label>
            <div className="flex items-center gap-3">
                <div className="h-12 w-12 shrink-0 rounded-lg border border-border/70 bg-muted flex items-center justify-center overflow-hidden">
                    {value ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={value} alt="" width={48} height={48} className="h-full w-full object-cover" />
                    ) : (
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    )}
                </div>
                <div className="flex-1 space-y-1.5">
                    <Input
                        id={urlId}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder="Paste an image address, or upload one…"
                        className="h-8"
                        type="url"
                        spellCheck={false}
                        autoComplete="off"
                    />
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5"
                            disabled={uploading}
                            onClick={() => inputRef.current?.click()}
                        >
                            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                            {uploading ? "Uploading…" : "Upload image"}
                        </Button>
                        {value && (
                            <Button type="button" size="sm" variant="ghost" className="h-8 text-muted-foreground" onClick={() => onChange("")}>
                                Remove
                            </Button>
                        )}
                        <span className="text-2xs text-muted-foreground">PNG, JPG, GIF, WebP · max {uploadLimitMB} MB</span>
                    </div>
                </div>
                <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,image/x-icon" className="hidden" onChange={handlePick} />
            </div>
        </div>
    )
}
