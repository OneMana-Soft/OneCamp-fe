"use client"

// MarketplaceCard — the curated directory of apps for the workspace (design
// v3, admin §A19). A grid of app cards (3 across at the wide column, 2 at
// 720, 1 on a phone): the raised surface at e1, r12, a 40px icon, the name,
// one line, and its state. Hover lifts it to e2. Clicking a card opens a side
// sheet with what it adds and what it needs. Install is one click: the button
// becomes a spinner, then "Installed ✓", in a slot of one width so nothing
// beside it moves. Apps that need a credential are installed and flagged
// "Finish setup", which opens the app editor. A category is a neutral chip
// (§1.5): hue is identity, never a category.

import { cn } from "@/lib/utils/helpers/cn"
import { useCallback, useMemo, useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useToast } from "@/hooks/use-toast"
import { Check, RefreshCw, AlertCircle, Trash2, Search, KeyRound, Globe, LogIn } from "@/lib/icons"
import { Plug } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { SettingsSection } from "@/components/ui/settingsSection"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { listMarketplace, installTemplate, uninstallTemplate } from "@/services/appService"
import AppIcon from "@/components/admin/AppIcon"
import { CommandChip } from "@/components/admin/appParts"
import { NeutralChip, StateWord } from "@/components/admin/connectParts"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import type { MarketplaceItem, SetupField } from "@/types/app"

/** The directory's grid, by the width of its column: 3 at 944, 2 at 720, 1 on a phone. */
const GRID = "cx-app-grid"

/** A card of the directory while it loads, in a loaded card's shape. */
function MarketplaceCardSkeleton() {
    return (
        <div aria-hidden="true" className="cx-app-card">
            <div className="flex items-start gap-3">
                <Skeleton className="size-10 shrink-0 rounded-[10px]" />
                <div className="min-w-0 flex-1 space-y-2 py-0.5">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3 w-full" />
                </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
                <Skeleton className="h-[22px] w-16 rounded-sm" />
                <Skeleton className="h-7 w-24 rounded-md" />
            </div>
        </div>
    )
}

/** What a setup field means for the workspace, said plainly, with a neutral glyph. */
const NEEDS: Record<SetupField["type"], { icon: typeof KeyRound; line: (name: string) => string }> = {
    secret: { icon: KeyRound, line: (name) => `Keeps a key you give it for ${name}, stored encrypted.` },
    oauth_cred: { icon: LogIn, line: (name) => `Signs in to ${name} for the workspace.` },
    handler_url: { icon: Globe, line: () => "Sends the command's text to its own address to answer it." },
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
    // Installed in this visit: the slot says "Installed ✓" until the list re-reads.
    const [justInstalled, setJustInstalled] = useState<string | null>(null)
    const [confirmRemove, setConfirmRemove] = useState<MarketplaceItem | null>(null)
    const [open, setOpen] = useState<MarketplaceItem | null>(null)
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
    // by category, each card naming its own.
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
            setJustInstalled(item.slug)
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
            setOpen(null)
        } catch (e) {
            toast({ title: `Couldn't remove ${item.name}`, description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
        } finally {
            setBusySlug(null)
        }
    }, [confirmRemove, mutate, onChanged, toast])

    const q = query.trim()
    // The sheet shows the latest answer for the app it opened on.
    const openItem = open ? (apps || []).find((a) => a.slug === open.slug) ?? open : null

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
                    accent. A category is a neutral chip (§1.5): the chosen one
                    is raised at e1, the rest stay quiet. */}
                <div className="flex flex-wrap gap-1" role="group" aria-label="Category">
                    {categories.map((cat) => (
                        <button
                            key={cat}
                            type="button"
                            aria-pressed={activeCategory === cat}
                            onClick={() => setActiveCategory(cat)}
                            className={cn(
                                "h-11 rounded-sm px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 md:h-8",
                                activeCategory === cat
                                    ? "bg-raised text-foreground shadow-e1"
                                    : "text-muted-foreground hover:bg-hover hover:text-foreground",
                            )}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {isLoading ? (
                <div className="cx-app-grid-wrap">
                    <div role="status" aria-label="Loading the app directory" className={GRID}>
                        {[0, 1, 2, 3, 4, 5].map((i) => <MarketplaceCardSkeleton key={i} />)}
                    </div>
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
                                variant="secondary"
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
                <div className="cx-app-grid-wrap">
                <div data-app-grid="" className={GRID}>
                    {shown.map((item) => (
                        <MarketplaceAppCard
                            key={item.slug}
                            item={item}
                            busy={busySlug === item.slug}
                            fresh={justInstalled === item.slug}
                            onOpen={() => setOpen(item)}
                            onInstall={() => handleInstall(item)}
                            onConfigure={() => item.app_id && onConfigure(item.app_id)}
                        />
                    ))}
                </div>
                </div>
            )}

            <Sheet open={!!openItem} onOpenChange={(o) => !o && setOpen(null)}>
                <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
                    {openItem && (
                        <AppSheetBody
                            item={openItem}
                            busy={busySlug === openItem.slug}
                            fresh={justInstalled === openItem.slug}
                            onInstall={() => handleInstall(openItem)}
                            onConfigure={() => openItem.app_id && onConfigure(openItem.app_id)}
                            onRemove={() => setConfirmRemove(openItem)}
                        />
                    )}
                </SheetContent>
            </Sheet>

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

/**
 * Install, in a slot of one width: "Install", then a spinner, then
 * "Installed ✓". The labels sit on top of each other and crossfade, so the
 * width never animates and nothing beside the button moves.
 */
export function InstallSlot({ item, busy, fresh, onInstall, onConfigure }: {
    item: MarketplaceItem
    busy: boolean
    fresh: boolean
    onInstall: () => void
    onConfigure: () => void
}) {
    if (item.installed && item.needs_setup) {
        return (
            <Button size="sm" variant="secondary" className="cx-app-slot gap-1 text-warning-ink" onClick={onConfigure}>
                <AlertCircle aria-hidden="true" /> Finish setup
            </Button>
        )
    }
    const state = busy ? "busy" : item.installed ? "done" : "idle"
    if (state === "done" && !fresh) {
        return (
            <StateWord tone="success" className="cx-app-installed">
                Installed
            </StateWord>
        )
    }
    return (
        <Button
            size="sm"
            variant={state === "idle" ? "secondary" : "ghost"}
            className="cx-app-slot"
            data-install-state={state}
            onClick={state === "idle" ? onInstall : undefined}
            disabled={state !== "idle"}
            aria-busy={state === "busy" || undefined}
            aria-label={state === "idle" ? `Install ${item.name}` : state === "busy" ? `Installing ${item.name}` : `${item.name} installed`}
        >
            <span className="cx-app-slot-label" data-show={state === "idle" ? "true" : undefined}>Install</span>
            <span className="cx-app-slot-label" data-show={state === "busy" ? "true" : undefined} aria-hidden="true">
                <RefreshCw className="animate-spin" />
            </span>
            <span className="cx-app-slot-label text-success-ink" data-show={state === "done" ? "true" : undefined}>
                Installed <Check aria-hidden="true" />
            </span>
        </Button>
    )
}

// MarketplaceAppCard: one app as a card. The whole card opens the sheet; the
// install slot sits above that layer, so the two never nest.
function MarketplaceAppCard({ item, busy, fresh, onOpen, onInstall, onConfigure }: {
    item: MarketplaceItem
    busy: boolean
    fresh: boolean
    onOpen: () => void
    onInstall: () => void
    onConfigure: () => void
}) {
    return (
        <div data-app-card="" className="cx-app-card cx-app-card-live">
            <button type="button" className="cx-app-open" onClick={onOpen} aria-label={`About ${item.name}`} />
            <div className="flex items-start gap-3">
                <AppIcon src={item.icon_url} alt="" size="md" />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-foreground">{item.name}</span>
                        {item.featured && <span className="text-2xs text-ink-3">Popular</span>}
                    </div>
                    <p className="mt-0.5 truncate text-2xs text-muted-foreground">{item.description}</p>
                </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
                {/* Its category, as a neutral chip: the grid is one list, so each card says it. */}
                {item.category ? (
                    <NeutralChip>
                        <span data-app-category="">{item.category}</span>
                    </NeutralChip>
                ) : <span />}
                <div className="cx-app-action">
                    <InstallSlot item={item} busy={busy} fresh={fresh} onInstall={onInstall} onConfigure={onConfigure} />
                </div>
            </div>
        </div>
    )
}

/** The side sheet: what the app adds, what it needs, and install or remove. */
function AppSheetBody({ item, busy, fresh, onInstall, onConfigure, onRemove }: {
    item: MarketplaceItem
    busy: boolean
    fresh: boolean
    onInstall: () => void
    onConfigure: () => void
    onRemove: () => void
}) {
    const needs = item.setup ?? []
    return (
        <>
            <SheetHeader className="space-y-3">
                <div className="flex items-center gap-3">
                    <AppIcon src={item.icon_url} alt="" size="md" />
                    <div className="min-w-0">
                        <SheetTitle className="truncate">{item.name}</SheetTitle>
                        {item.category && <p className="text-2xs text-muted-foreground">{item.category}</p>}
                    </div>
                </div>
                <SheetDescription>{item.description}</SheetDescription>
            </SheetHeader>
            <div className="mt-5 flex-1 space-y-5 overflow-y-auto">
                {(item.commands?.length ?? 0) > 0 && (
                    <section aria-labelledby={`app-${item.slug}-cmds`} className="space-y-2">
                        <h3 id={`app-${item.slug}-cmds`} className="text-xs font-medium text-muted-foreground">Adds these commands</h3>
                        <div className="flex flex-wrap gap-1">
                            {item.commands.map((c) => <CommandChip key={c} command={c} />)}
                        </div>
                    </section>
                )}
                <section aria-labelledby={`app-${item.slug}-needs`} className="space-y-2">
                    <h3 id={`app-${item.slug}-needs`} className="text-xs font-medium text-muted-foreground">What it uses</h3>
                    <ul className="space-y-2">
                        <li className="flex items-start gap-2 text-xs text-muted-foreground">
                            <Check className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
                            Answers only when someone types one of its commands.
                        </li>
                        {needs.map((f) => {
                            const n = NEEDS[f.type]
                            return (
                                <li key={f.key} data-app-need={f.type} className="flex items-start gap-2 text-xs text-muted-foreground">
                                    <n.icon className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
                                    <span>
                                        {n.line(item.name)}
                                        {f.required ? "" : " Optional."}
                                    </span>
                                </li>
                            )
                        })}
                    </ul>
                    {item.setup_note && <p className="text-xs text-muted-foreground">{item.setup_note}</p>}
                </section>
            </div>
            <div className="flex items-center justify-between gap-2 pt-4">
                {item.installed ? (
                    <Button variant="destructive" size="sm" onClick={onRemove} disabled={busy}>
                        <Trash2 aria-hidden="true" /> Uninstall
                    </Button>
                ) : <span />}
                <InstallSlot item={item} busy={busy} fresh={fresh} onInstall={onInstall} onConfigure={onConfigure} />
            </div>
        </>
    )
}
