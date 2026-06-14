"use client"

// MarketplaceCard — the curated "App Store" for the workspace. A grid of
// popular apps (Giphy, Zoom, Jira, Linear, …) each installable with ONE click.
// Install pre-fills the app's commands and OAuth boilerplate; apps that need a
// credential are installed immediately and flagged "Set up" so the admin
// finishes in the app editor. One-click Uninstall removes the app, its
// commands, and its stored secrets. Optimistic UI + toasts keep it snappy.

import React, { useCallback, useMemo, useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { Check, RefreshCw, Terminal, Sparkles, AlertCircle, Trash2, Search } from "@/lib/icons"
import { listMarketplace, installTemplate, uninstallTemplate } from "@/services/appService"
import AppIcon from "@/components/admin/AppIcon"
import type { MarketplaceItem } from "@/types/app"

export default function MarketplaceCard({ onConfigure, onChanged }: {
    // onConfigure opens the existing app editor for an installed app id, so the
    // admin can paste the remaining credential (api key / oauth secret).
    onConfigure: (appId: string) => void
    // onChanged lets the parent refresh its installed-apps list after a change.
    onChanged?: () => void
}) {
    const { toast } = useToast()
    const { data: apps, isLoading, mutate } = useSWR("admin-marketplace", listMarketplace, {
        revalidateOnFocus: false,
    })
    const [busySlug, setBusySlug] = useState<string | null>(null)
    const [confirmRemove, setConfirmRemove] = useState<MarketplaceItem | null>(null)
    const [query, setQuery] = useState("")
    const [activeCategory, setActiveCategory] = useState<string>("All")

    // Distinct categories (stable order) for the filter chips.
    const categories = useMemo(() => {
        const set: string[] = []
        for (const a of apps || []) {
            if (a.category && !set.includes(a.category)) set.push(a.category)
        }
        set.sort()
        return ["All", ...set]
    }, [apps])

    // Filter by search query + active category, then group by category for
    // a browsable, Notion-grade directory.
    const grouped = useMemo(() => {
        const q = query.trim().toLowerCase()
        const filtered = (apps || []).filter((a) => {
            if (activeCategory !== "All" && a.category !== activeCategory) return false
            if (!q) return true
            return (
                a.name.toLowerCase().includes(q) ||
                a.description.toLowerCase().includes(q) ||
                (a.commands || []).some((c) => c.toLowerCase().includes(q))
            )
        })
        const groups = new Map<string, MarketplaceItem[]>()
        for (const a of filtered) {
            const list = groups.get(a.category) || []
            list.push(a)
            groups.set(a.category, list)
        }
        return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    }, [apps, query, activeCategory])

    const handleInstall = useCallback(async (item: MarketplaceItem) => {
        setBusySlug(item.slug)
        try {
            const app = await installTemplate(item.slug)
            await mutate()
            onChanged?.()
            // If the app still needs a credential, guide the admin straight to setup.
            if ((item.setup?.some((s) => s.required) ?? false)) {
                toast({
                    title: `${item.name} installed`,
                    description: "One more step — add the required credential to finish setup.",
                })
                if (app?.id) onConfigure(app.id)
            } else {
                toast({ title: `${item.name} installed`, description: item.commands?.[0] ? `Try /${item.commands[0]} in any conversation.` : undefined })
            }
        } catch (e) {
            const msg = (e as { response?: { data?: { msg?: string } } })?.response?.data?.msg
            toast({ title: `Couldn't install ${item.name}`, description: msg, variant: "destructive" })
        } finally {
            setBusySlug(null)
        }
    }, [mutate, onChanged, onConfigure, toast])

    const handleUninstall = useCallback(async () => {
        if (!confirmRemove) return
        const item = confirmRemove
        setBusySlug(item.slug)
        try {
            await uninstallTemplate(item.slug)
            await mutate()
            onChanged?.()
            toast({ title: `${item.name} removed` })
            setConfirmRemove(null)
        } catch {
            toast({ title: `Couldn't remove ${item.name}`, variant: "destructive" })
        } finally {
            setBusySlug(null)
        }
    }, [confirmRemove, mutate, onChanged, toast])

    return (
        <div className="flex flex-col">
            <div className="mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" /> App directory
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Install in one click. Apps that need a key are flagged so you can finish setup.
                </p>
            </div>

            {/* Search + category filter */}
            <div className="flex flex-col gap-2 mb-3">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search apps…"
                        className="h-8 pl-8 text-sm"
                    />
                </div>
                <div className="flex flex-wrap gap-1">
                    {categories.map((cat) => (
                        <button
                            key={cat}
                            type="button"
                            onClick={() => setActiveCategory(cat)}
                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                activeCategory === cat
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {isLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                    <RefreshCw className="h-4 w-4 animate-spin" /> Loading apps…
                </div>
            )}

            {!isLoading && grouped.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                    No apps match “{query}”.
                </div>
            )}

            <div className="space-y-4">
                {grouped.map(([category, items]) => (
                    <div key={category}>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-1.5">
                            {category}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {items.map((item) => (
                                <MarketplaceAppCard
                                    key={item.slug}
                                    item={item}
                                    busy={busySlug === item.slug}
                                    onInstall={() => handleInstall(item)}
                                    onConfigure={() => item.app_id && onConfigure(item.app_id)}
                                    onRemove={() => setConfirmRemove(item)}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <Dialog open={!!confirmRemove} onOpenChange={(o) => !o && setConfirmRemove(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Remove {confirmRemove?.name}?</DialogTitle>
                        <DialogDescription>
                            This removes {confirmRemove?.name}, its slash commands, and any stored credentials.
                            You can reinstall it anytime.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setConfirmRemove(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleUninstall} disabled={busySlug === confirmRemove?.slug}>
                            {busySlug === confirmRemove?.slug ? "Removing…" : "Remove app"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

// MarketplaceAppCard renders one app tile with its one-click action.
function MarketplaceAppCard({ item, busy, onInstall, onConfigure, onRemove }: {
    item: MarketplaceItem
    busy: boolean
    onInstall: () => void
    onConfigure: () => void
    onRemove: () => void
}) {
    return (
        <div className="rounded-xl border border-border/70 bg-card p-3 flex flex-col">
            <div className="flex items-start gap-3">
                <AppIcon src={item.icon_url} alt={item.name} size="md" />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <span className="font-medium text-sm truncate">{item.name}</span>
                        {item.featured && (
                            <Badge variant="secondary" className="text-[10px]">Popular</Badge>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{item.description}</p>
                </div>
            </div>

            <div className="flex flex-wrap gap-1 mt-2">
                {(item.commands || []).slice(0, 4).map((c) => (
                    <span key={c} className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5 font-mono">
                        <Terminal className="h-2.5 w-2.5" />/{c}
                    </span>
                ))}
            </div>

            <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/50">
                {!item.installed ? (
                    <Button
                        size="sm"
                        className="flex-1 h-8"
                        onClick={onInstall}
                        disabled={busy}
                    >
                        {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Install"}
                    </Button>
                ) : (
                    <>
                        {item.needs_setup ? (
                            <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 h-8 gap-1 border-amber-400/60 text-amber-600 dark:text-amber-400"
                                onClick={onConfigure}
                            >
                                <AlertCircle className="h-3.5 w-3.5" /> Finish setup
                            </Button>
                        ) : (
                            <span className="flex-1 inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                                <Check className="h-3.5 w-3.5" /> Installed
                            </span>
                        )}
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive"
                            onClick={onRemove}
                            disabled={busy}
                            aria-label={`Uninstall ${item.name}`}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </>
                )}
            </div>
        </div>
    )
}
