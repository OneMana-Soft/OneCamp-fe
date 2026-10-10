"use client"

// MarketplaceCard — the curated "App Store" for the workspace. A grid of
// popular apps (Giphy, Zoom, Jira, Linear, …) each installable with ONE click.
// Install pre-fills the app's commands and OAuth boilerplate; apps that need a
// credential are installed immediately and flagged "Set up" so the admin
// finishes in the app editor. One-click Uninstall removes the app, its
// commands, and its stored secrets. Optimistic UI + toasts keep it snappy.

import { cn } from "@/lib/utils/helpers/cn"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { hueFor } from "@/lib/campHue"
import { useCallback, useMemo, useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { Check, RefreshCw, AlertCircle, Trash2, Search } from "@/lib/icons"
import { Plug } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { SettingsSection } from "@/components/ui/settingsSection"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { listMarketplace, installTemplate, uninstallTemplate } from "@/services/appService"
import AppIcon from "@/components/admin/AppIcon"
import { CommandChip } from "@/components/admin/appParts"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import type { MarketplaceItem } from "@/types/app"

/** The directory's grid, the same for its cards and their placeholders. */
const GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2"

/** A card of the directory while it loads, in a loaded card's shape. */
function MarketplaceCardSkeleton() {
    return (
        <div aria-hidden="true" className="flex flex-col rounded-lg border border-border/70 p-3">
            <div className="flex items-start gap-3">
                <Skeleton className="size-10 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2 py-0.5">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                </div>
            </div>
            <Skeleton className="mt-2 h-5 w-16 rounded-sm" />
            <div className="mt-3 border-t border-border/50 pt-2">
                <Skeleton className="h-8 w-full rounded-md" />
            </div>
        </div>
    )
}

export default function MarketplaceCard({ onConfigure, onChanged }: {
    // onConfigure opens the existing app editor for an installed app id, so the
    // admin can paste the remaining credential (api key / oauth secret).
    onConfigure: (appId: string) => void
    // onChanged lets the parent refresh its installed-apps list after a change.
    onChanged?: () => void
}) {
    const { toast } = useToast()
    const { data: apps, isLoading, error, mutate } = useSWR("admin-marketplace", listMarketplace, {
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

    // Filter by search query and the active category, into ONE grid ordered
    // by category, each card naming its own. Under All every category used to
    // get its own two-column grid, so a category of one app left half a row
    // empty, and the directory read as unfinished.
    const shown = useMemo(() => {
        const q = query.trim().toLowerCase()
        return (apps || [])
            .filter((a) => {
                if (activeCategory !== "All" && a.category !== activeCategory) return false
                if (!q) return true
                return (
                    a.name.toLowerCase().includes(q) ||
                    a.description.toLowerCase().includes(q) ||
                    (a.commands || []).some((c) => c.toLowerCase().includes(q))
                )
            })
            .sort((a, b) => (a.category || "").localeCompare(b.category || "") || a.name.localeCompare(b.name))
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
                    description: "One more step: add the required credential to finish setup.",
                })
                if (app?.id) onConfigure(app.id)
            } else {
                toast({ title: `${item.name} installed`, description: item.commands?.[0] ? `Try /${item.commands[0]} in any conversation.` : undefined })
            }
        } catch (e) {
            toast({ title: `Couldn't install ${item.name}`, description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
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
        } catch (e) {
            toast({ title: `Couldn't remove ${item.name}`, description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
        } finally {
            setBusySlug(null)
        }
    }, [confirmRemove, mutate, onChanged, toast])

    const q = query.trim()

    return (
        <SettingsSection level={3} title="App directory" description="Install in one click. Apps that need a key are flagged so you can finish setup.">
            {/* One toolbar at one height: the search and the category filters,
                44px on a phone, 32px from md up. */}
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className="relative md:w-64 md:shrink-0">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input
                        type="search"
                        aria-label="Search the app directory"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search apps…"
                        className="h-8 pl-8 text-sm"
                        autoComplete="off"
                    />
                </div>
                {/* Filters, so a pressed state rather than a selection in the
                    accent: chips at the 4px radius. A category is a thing with
                    a colour of its own, so the chosen one shows its camp hue's
                    tint and ink ("All" stays neutral); the rest stay quiet. */}
                <div className="flex flex-wrap gap-1" role="group" aria-label="Category">
                    {categories.map((cat) => (
                        <button
                            key={cat}
                            type="button"
                            aria-pressed={activeCategory === cat}
                            onClick={() => setActiveCategory(cat)}
                            className={cn(
                                "h-11 rounded-sm border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 md:h-8",
                                activeCategory !== cat
                                    ? "border-transparent text-muted-foreground hover:text-foreground"
                                    : cat === "All"
                                      ? "border-border bg-highlight text-foreground"
                                      : cn(HUE_CLASS[hueFor(cat)], "border-transparent bg-hue-tint text-hue-ink"),
                            )}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {isLoading ? (
                <div role="status" aria-label="Loading the app directory" className={GRID}>
                    {[0, 1, 2, 3].map((i) => <MarketplaceCardSkeleton key={i} />)}
                </div>
            ) : error ? (
                // Before any "no match": a failed read said `No apps match “”.`,
                // quoting a search nobody had typed.
                <ErrorState compact subject="the app directory" detail={apiErrorMessage(error) || undefined} onRetry={() => void mutate()} />
            ) : shown.length === 0 ? (
                q || activeCategory !== "All" ? (
                    <EmptyState
                        icon={Search}
                        hue={ADMIN_GROUP_HUE.connections}
                        title={q ? `No apps match “${q}”` : `No apps in ${activeCategory} yet`}
                        description="Try another word, or look through every category."
                        action={
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setQuery("")
                                    setActiveCategory("All")
                                }}
                            >
                                {q ? "Clear search" : "Show all"}
                            </Button>
                        }
                    />
                ) : (
                    <EmptyState icon={Plug} hue={ADMIN_GROUP_HUE.connections} title="The directory is empty on this server" />
                )
            ) : (
                <div data-app-grid="" className={GRID}>
                    {shown.map((item) => (
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
            )}

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
        </SettingsSection>
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
        <div data-app-card="" className="flex flex-col rounded-lg border border-border/70 bg-card p-3">
            <div className="flex items-start gap-3">
                <AppIcon src={item.icon_url} alt={item.name} size="md" />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <span className="font-medium text-sm truncate">{item.name}</span>
                        {item.featured && (
                            <Badge variant="secondary" className="text-2xs">Popular</Badge>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{item.description}</p>
                </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1">
                {/* Its category, in the category's own hue, as the filter
                    shows it: the grid is one list now, so each card says it. */}
                {item.category && (
                    <span
                        data-app-category=""
                        className={cn(HUE_CLASS[hueFor(item.category)], "rounded-sm bg-hue-tint px-1.5 py-0.5 text-2xs font-medium text-hue-ink")}
                    >
                        {item.category}
                    </span>
                )}
                {(item.commands || []).slice(0, 4).map((c) => (
                    <CommandChip key={c} command={c} />
                ))}
            </div>

            <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/50">
                {!item.installed ? (
                    <Button variant="outline"
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
                                className="flex-1 h-8 gap-1 border-warning/60 text-warning-ink"
                                onClick={onConfigure}
                            >
                                <AlertCircle className="h-3.5 w-3.5" /> Finish setup
                            </Button>
                        ) : (
                            <span className="flex-1 inline-flex items-center gap-1 text-xs text-success-ink font-medium">
                                <Check className="h-3.5 w-3.5" /> Installed
                            </span>
                        )}
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-danger-ink"
                            onClick={onRemove}
                            disabled={busy}
                            aria-label={`Uninstall ${item.name}`}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </>
                )}
            </div>
        </div>
    )
}
