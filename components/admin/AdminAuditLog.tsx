"use client"

// AdminAuditLog: a compliance-grade viewer of admin configuration changes and
// of what agents did for people: who changed which sensitive setting, when,
// and from where. Secret values are never recorded server-side, so this is
// safe to surface to any admin.
//
// Design v3 (admin A11, mock M4). The rainbow of category pills is gone: a
// category is a neutral 22px chip with an ink-3 glyph (§1.5), and the one
// ink that is earned here is danger, on a refusal, the rows an auditor came
// for. Rows are 44px and open in place into a sunken detail block; they are
// grouped by day under sticky headers. Verify resolves to a seal row at the
// top of the list, and Export on the free plan opens the licence note in a
// popover rather than a banner over the page.

import React, { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import EvidenceReceipts from "@/components/admin/EvidenceReceipts"
import { PlanLockedNotice } from "@/components/admin/PlanLockedNotice"
import { usePlan } from "@/hooks/usePlan"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/ui/chip"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    AlertCircle,
    ArrowRight,
    Bot,
    ChevronDown,
    ChevronRight,
    Copy,
    Download,
    FileText,
    Key,
    LayoutGrid,
    Loader2,
    Lock,
    Plug,
    RefreshCw,
    ScrollText,
    Search,
    Shield,
    ShieldCheck,
    ShieldX,
    SlidersHorizontal,
    Sparkles,
} from "@/lib/icons"
import type { LucideIcon } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import { parseAuditMetadata, auditReason } from "@/lib/utils/auditMetadata"
import { apiErrorMessage, apiErrorStatus } from "@/lib/utils/apiError"
import { fullDateTime, shortDate, shortDateTime } from "@/lib/utils/date/shortDate"
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { SpotDocs, SpotSearch } from "@/components/ui/graphics"
import { AgentAvatar, BotAvatar } from "@/components/ui/graphics/PrincipalAvatar"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { Skeleton } from "@/components/ui/skeleton"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { cn } from "@/lib/utils/helpers/cn"
import {
    getAdminAuditLog,
    verifyAuditLog,
    exportAuditLog,
    downloadEvidencePack,
    entryInitiator,
    UNATTENDED,
    type AuditEntry,
    type AuditVerifyResult,
    type InitiatorKind,
} from "@/services/settingsService"
import { clockTime } from "@/lib/utils/date/clock"
import { OWN_ERRORS } from "@/lib/axiosInstance"

/**
 * A category's glyph, always in ink-3 on a neutral chip: a category names a
 * kind of thing, and hue in this area is for identity only (§1.5). Agent gets
 * the spark because "a person or an agent on their behalf" is what an
 * auditor scans for first; a category the server starts recording later
 * still renders, with the log's own glyph.
 */
export const CATEGORY_GLYPH: Record<string, LucideIcon> = {
    security: Shield,
    auth: Key,
    integration: Plug,
    settings: SlidersHorizontal,
    agent: Sparkles,
    app: LayoutGrid,
    // What happened to docs: shares, access and lock changes, deletes,
    // restores, purges, exports, publishes, transfers and recoveries.
    docs: FileText,
}
const glyphOf = (c: string) => CATEGORY_GLYPH[c] ?? ScrollText

/** "integration" as a person reads it: "Integration". */
const categoryLabel = (c: string) => (c === ALL ? "All" : c.charAt(0).toUpperCase() + c.slice(1))

/** What the server said, when it answered; a network failure keeps ErrorState's own words. */
const serverReason = (e: unknown) => (apiErrorStatus(e) ? apiErrorMessage(e) : undefined)

// The filter list the component starts with, replaced by whatever the server
// reports, so the menu has its items on the first paint.
const SEED_CATEGORIES = ["settings", "integration", "auth", "app", "security", "agent", "docs"]

const ALL = "all"
/** Entries read at a time; a page that comes back shorter was the last. */
const PAGE = 50

/** The category as a neutral 22px chip with a 14px ink-3 glyph. Never a hue. */
export function CategoryChip({ category, className }: { category: string; className?: string }) {
    const Icon = glyphOf(category)
    return (
        <span data-audit-category={category} className={cn("audit-chip chip shrink-0", className)}>
            <Icon aria-hidden="true" />
            {categoryLabel(category)}
        </span>
    )
}

/** Who acted, at 22px: a person's circle, an agent's square, the system's bot square. */
function ActorMark({ entry }: { entry: AuditEntry }) {
    if (entry.actor_kind === "agent")
        return (
            <span className="audit-actor inline-flex" title="An agent">
                <AgentAvatar />
            </span>
        )
    if (entry.actor_kind === "system" || !entry.actor_email)
        return (
            <span className="audit-actor inline-flex" title="The system">
                <BotAvatar>
                    <Bot />
                </BotAvatar>
            </span>
        )
    const name = entry.actor_email.split("@")[0]
    return (
        <Avatar className="audit-actor size-[22px]" title={entry.actor_email}>
            <AvatarFallback className={cn("text-3xs font-semibold", getAvatarFallbackClass(name))}>{getNameInitials(name).charAt(0)}</AvatarFallback>
        </Avatar>
    )
}

/** "Today", "Yesterday", or "Thu 8 Oct": a day header's words. Pure. */
export function dayLabel(iso: string, now: Date = new Date()): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return "Undated"
    const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
    const days = Math.round((start(now) - start(d)) / 86_400_000)
    if (days === 0) return "Today"
    if (days === 1) return "Yesterday"
    return `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${shortDate(d, now)}`
}

/** Entries in runs of one day, newest first, as the server sends them. Pure. */
export function byDay(entries: AuditEntry[], now: Date = new Date()): { day: string; entries: AuditEntry[] }[] {
    const out: { day: string; entries: AuditEntry[] }[] = []
    for (const e of entries) {
        const day = dayLabel(e.created_at, now)
        const last = out[out.length - 1]
        if (last && last.day === day) last.entries.push(e)
        else out.push({ day, entries: [e] })
    }
    return out
}

/**
 * One audit entry: a 44px row (time, who, what, its category), opening in
 * place to the sunken detail block.
 *
 * THE REASON IS INLINE, not behind the disclosure: scanning refusals and
 * their causes is the common task. A refusal carries the danger glyph before
 * its summary and the reason in danger ink, and the word "Refused" as well,
 * so the distinction survives colour blindness and a greyscale print.
 *
 * WHO STARTED IT, as distinct from whose authority it carried: a row whose
 * initiator nobody watched says so in words. Omitted, not defaulted, on a row
 * that never said.
 */
function AuditRow({
    entry,
    unattendedKinds,
    open,
    onToggle,
    live,
}: {
    entry: AuditEntry
    unattendedKinds: Set<string>
    open: boolean
    onToggle: () => void
    live?: boolean
}) {
    const meta = parseAuditMetadata(entry.metadata)
    const reason = auditReason(entry.metadata)
    const initiator = entryInitiator(entry)
    const refused = !!meta?.refused
    const detailFields = meta?.fields.filter((f) => !f.isReason) ?? []
    const { copy } = useCopyToClipboard()
    const detailId = `audit-detail-${entry.id}`
    const d = new Date(entry.created_at)
    const valid = !Number.isNaN(d.getTime())

    return (
        <li data-audit-row="" data-open={open ? "true" : undefined} data-live={live ? "true" : undefined} data-refused={refused ? "true" : undefined} className="audit-row" id={`audit-${entry.id}`}>
            <button type="button" className="audit-row-head focus-visible:outline-2 focus-visible:outline-ring" aria-expanded={open} aria-controls={detailId} onClick={onToggle}>
                <span className="audit-time">
                    {valid ? (
                        <time dateTime={entry.created_at} title={fullDateTime(d)}>
                            {clockTime(d)}
                        </time>
                    ) : (
                        entry.created_at
                    )}
                </span>
                <ActorMark entry={entry} />
                <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-1.5">
                        {refused && <AlertCircle data-refusal-glyph="" className="size-3.5 shrink-0 text-danger-ink" aria-label="Refused" />}
                        <span className="truncate text-sm font-book text-foreground">{entry.summary}</span>
                        <span className="hidden min-w-0 shrink truncate text-2xs text-ink-3 sm:inline">
                            {entry.actor_kind === "agent" && <span>agent · </span>}
                            {initiator && (unattendedKinds.has(initiator) ? <span className="text-camp-sun-ink">{`${initiator}, nobody watching · `}</span> : <span>{`${initiator} · `}</span>)}
                            {entry.actor_kind === "system" && <span>system · </span>}
                            {entry.actor_email || "Unknown"}
                        </span>
                    </span>
                    {reason && (
                        <span data-audit-reason="" className={cn("mt-0.5 block truncate text-xs", refused ? "text-danger-ink" : "text-ink-2")}>
                            {refused && <span className="font-medium">Refused: </span>}
                            {reason}
                        </span>
                    )}
                    {/* A phone's second line (design v3, admin A11): when, and
                        what kind, where the time column and the chip stand on
                        a computer. */}
                    <span data-audit-phone-meta="" className="mt-0.5 block truncate text-2xs tabular-nums text-ink-3 md:hidden">
                        {valid ? clockTime(d) : entry.created_at} · {categoryLabel(entry.category)}
                    </span>
                </span>
                {/* Hidden by a utility, not by the row's phone rule: the chip
                    is itself a utility, which outranks the components layer,
                    so on a phone it stayed and pushed the row past the screen. */}
                <CategoryChip category={entry.category} className="max-md:hidden" />
                <ChevronRight className="audit-chevron size-4" aria-hidden="true" />
            </button>
            {open && (
                <div id={detailId} data-audit-detail="" className="audit-detail">
                    {meta?.malformed ? (
                        // Surfaced rather than dropped: an unparseable blob is still evidence.
                        <pre className="overflow-x-auto font-mono text-2xs text-ink-2">{meta.raw}</pre>
                    ) : (
                        <dl className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-4 gap-y-1.5">
                            <dt className="text-ink-3">When</dt>
                            <dd>{valid ? shortDateTime(d) : entry.created_at}</dd>
                            <dt className="text-ink-3">Who</dt>
                            <dd className="break-words">{entry.actor_email || "Unknown"}</dd>
                            {entry.ip_address && (
                                <>
                                    <dt className="text-ink-3">IP</dt>
                                    <dd className="font-mono">{entry.ip_address}</dd>
                                </>
                            )}
                            {entry.user_agent && (
                                <>
                                    <dt className="text-ink-3">Browser</dt>
                                    <dd className="break-words">{entry.user_agent}</dd>
                                </>
                            )}
                            <dt className="text-ink-3">Action</dt>
                            <dd className="font-mono">{entry.action}</dd>
                            {detailFields.map((f) => (
                                <React.Fragment key={f.key}>
                                    <dt className="text-ink-3">{f.label}</dt>
                                    <dd className="font-mono [overflow-wrap:anywhere]">{f.value}</dd>
                                </React.Fragment>
                            ))}
                        </dl>
                    )}
                    <Button type="button" variant="ghost" size="xs" className="mt-2 -ml-1.5" onClick={() => void copy(JSON.stringify(entry, null, 2), "Entry copied as JSON")}>
                        <Copy aria-hidden="true" />
                        Copy entry JSON
                    </Button>
                </div>
            )}
        </li>
    )
}

/** The rows the log is about to show, in its own shape: ten 44px rows. */
export function AuditSkeleton() {
    return (
        <ul role="status" aria-busy="true" aria-label="Loading the audit log" data-audit-skeleton="">
            {Array.from({ length: 10 }).map((_, i) => (
                <li key={i} className="audit-row" aria-hidden="true">
                    <div className="audit-row-head">
                        <Skeleton className="h-3 w-10" />
                        <Skeleton variant="circle" className="size-[22px]" />
                        <Skeleton className={cn("h-3.5", i % 2 === 0 ? "w-3/5" : "w-1/2")} />
                        <Skeleton className="h-[22px] w-20 rounded-sm" />
                        <span />
                    </div>
                </li>
            ))}
        </ul>
    )
}

/**
 * What Verify found, pinned at the top of the list: a moss shield and how far
 * the check reached, or the danger version naming the first broken row. A
 * windowed check is never allowed to read as the whole chain.
 */
function SealRow({
    result,
    at,
    onFull,
    verifying,
    onJump,
    locked,
}: {
    result: AuditVerifyResult
    at: Date
    onFull: () => void
    verifying: boolean
    onJump?: () => void
    locked: boolean
}) {
    const rows = `${result.checked.toLocaleString("en")} ${result.checked === 1 ? "row" : "rows"} checked`
    return (
        <div data-verify-result="" data-seal="" data-ok={result.ok ? "true" : "false"} role="status" className="audit-seal">
            <span className="audit-seal-tile" aria-hidden="true">
                {result.ok ? <ShieldCheck className="size-4" /> : <ShieldX className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                    {result.ok
                        ? result.partial
                            ? `Recent verified · ${rows}`
                            : `Whole chain verified · intact from the first entry · ${rows}`
                        : `Tampering detected${result.first_bad_seq ? ` at row #${result.first_bad_seq}` : ""}`}
                </p>
                <p className="mt-0.5 text-xs text-ink-2">
                    <time dateTime={at.toISOString()}>{clockTime(at)}</time>
                    {result.ok && result.redacted ? ` · ${result.redacted} taken at their word after redaction` : ""}
                    {!result.ok && <span title={result.message}>{` · ${result.message}`}</span>}
                </p>
                {/* Offered only after a windowed check passed: the bounded check is
                    the default because a full walk on a year-old log is when the
                    button stops answering; this is for the reader who needs the
                    claim to cover everything, labelled as the slower thing. */}
                {result.ok && result.partial && (
                    <p className="mt-1 text-xs text-ink-2">
                        Checked the most recent {result.checked.toLocaleString("en")} entries
                        {result.from_seq ? ` (from #${result.from_seq} onwards)` : ""}, not the whole log.{" "}
                        <button
                            type="button"
                            onClick={onFull}
                            disabled={verifying}
                            className="rounded-sm font-medium text-brand-text underline-offset-[3px] hover:underline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                        >
                            Check the whole chain
                        </button>{" "}
                        (slower, because it starts from the first entry ever written).
                    </p>
                )}
            </div>
            {!result.ok && onJump ? (
                <Button type="button" variant="secondary" size="sm" onClick={onJump}>
                    Jump to row
                </Button>
            ) : result.ok && !locked ? (
                <Link href="/app/admin/evidence" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-ink-2 hover:text-foreground">
                    Evidence pack
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
            ) : null}
        </div>
    )
}

export default function AdminAuditLog() {
    const [entries, setEntries] = useState<AuditEntry[]>([])
    const [loading, setLoading] = useState(true)
    // A failed read is not an empty log: said as such, with Try again.
    const [failed, setFailed] = useState(false)
    const [failure, setFailure] = useState<string | undefined>(undefined)
    const [hasOlder, setHasOlder] = useState(false)
    const [loadingOlder, setLoadingOlder] = useState(false)
    const [filter, setFilter] = useState<string>(ALL)
    const [categories, setCategories] = useState<string[]>(SEED_CATEGORIES)
    // The one filter an auditor reaches for first: what ran on somebody's
    // authority while they were away. The server filters, so it covers the
    // whole log and not only the rows already read.
    const [unattendedOnly, setUnattendedOnly] = useState(false)
    const [initiators, setInitiators] = useState<InitiatorKind[]>([])
    const unattendedKinds = useMemo(() => new Set(initiators.filter((k) => k.unattended).map((k) => k.kind)), [initiators])
    const [search, setSearch] = useState("")
    const [open, setOpen] = useState<string | null>(null)
    const { toast } = useToast()
    const [verifying, setVerifying] = useState(false)
    const [verifyResult, setVerifyResult] = useState<AuditVerifyResult | null>(null)
    const [verifiedAt, setVerifiedAt] = useState<Date>(() => new Date())
    const [exporting, setExporting] = useState(false)
    // Rows that arrive on a refresh get the brief wash.
    const seen = useRef<Set<string> | null>(null)
    const [fresh, setFresh] = useState<Set<string>>(new Set())
    // Export and the evidence pack are a company control (the free plan leaves
    // them out); the log itself and verifying its chain are on every plan.
    const plan = usePlan()
    const exportLocked = plan.isLocked("audit_export")

    const load = (cat: string, unattended: boolean = unattendedOnly) => {
        setLoading(true)
        setFailed(false)
        setFailure(undefined)
        getAdminAuditLog(cat === ALL ? undefined : cat, PAGE, 0, unattended ? UNATTENDED : undefined)
            .then((page) => {
                const before = seen.current
                setFresh(before ? new Set(page.entries.filter((e) => !before.has(e.id)).map((e) => e.id)) : new Set())
                seen.current = new Set(page.entries.map((e) => e.id))
                setEntries(page.entries)
                setHasOlder(page.entries.length === PAGE)
                // Only replace the filter list when the server sent one, so a
                // partial response never removes a filter mid-session.
                if (page.categories.length > 0) setCategories(page.categories)
                if (page.initiators.length > 0) setInitiators(page.initiators)
            })
            .catch((e) => {
                setEntries([])
                setHasOlder(false)
                setFailed(true)
                setFailure(serverReason(e))
            })
            .finally(() => setLoading(false))
    }

    // The next fifty, after the ones shown. The log only grows, and with export
    // locked on the free plan this is the only way to reach anything older.
    const loadOlder = () => {
        setLoadingOlder(true)
        // Said by the toast below, once: the request's own stays quiet.
        getAdminAuditLog(filter === ALL ? undefined : filter, PAGE, entries.length, unattendedOnly ? UNATTENDED : undefined, OWN_ERRORS)
            .then((page) => {
                setEntries((prev) => {
                    const ids = new Set(prev.map((e) => e.id))
                    return [...prev, ...page.entries.filter((e) => !ids.has(e.id))]
                })
                setHasOlder(page.entries.length === PAGE)
            })
            .catch((e) => {
                toast({ title: "Couldn't load older entries", description: apiErrorMessage(e, "Try again in a moment."), tone: "error" })
            })
            .finally(() => setLoadingOlder(false))
    }

    useEffect(() => {
        seen.current = null
        load(filter, unattendedOnly)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filter, unattendedOnly])

    const handleVerify = async (scope: "recent" | "full" = "recent") => {
        setVerifying(true)
        try {
            const res = await verifyAuditLog(scope)
            setVerifyResult(res)
            setVerifiedAt(new Date())
        } catch (e) {
            toast({ title: "Couldn't check the log", description: apiErrorMessage(e, "Try again in a moment."), tone: "error" })
        } finally {
            setVerifying(false)
        }
    }

    const handleEvidencePack = async () => {
        setExporting(true)
        try {
            await downloadEvidencePack()
            toast({
                title: "Evidence pack downloaded",
                description: "The last 90 days: the log with its chain recomputation, what each agent was told, and a manifest fingerprinting every section.",
                tone: "success",
            })
        } catch (e) {
            toast({ title: "Couldn't build the evidence pack", description: apiErrorMessage(e, "Try again in a moment."), tone: "error" })
        } finally {
            setExporting(false)
        }
    }

    const handleExport = async (format: "csv" | "json") => {
        setExporting(true)
        try {
            await exportAuditLog(format, filter === ALL ? undefined : filter)
        } catch (e) {
            toast({ title: "Couldn't export the log", description: apiErrorMessage(e, "Try again in a moment."), tone: "error" })
        } finally {
            setExporting(false)
        }
    }

    // The search narrows the entries read so far, and says so when it finds none.
    const q = search.trim().toLowerCase()
    const shown = useMemo(
        () => (q ? entries.filter((e) => `${e.summary} ${e.actor_email ?? ""} ${e.category} ${e.action}`.toLowerCase().includes(q)) : entries),
        [entries, q],
    )
    const groups = useMemo(() => byDay(shown), [shown])

    const filtered = filter !== ALL || unattendedOnly
    const showAll = () => {
        setFilter(ALL)
        setUnattendedOnly(false)
    }

    const jumpTo = verifyResult && !verifyResult.ok ? entries.find((e) => e.id === verifyResult.first_bad_id) : undefined

    const exportButton = exportLocked ? (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="secondary" size="sm" className="h-11 md:h-7" data-export-locked="">
                    <Lock aria-hidden="true" />
                    Export
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[360px] p-0">
                <PlanLockedNotice what="Exporting the audit log" upgradeUrl={plan.upgradeUrl} className="rounded-none shadow-none" />
            </PopoverContent>
        </Popover>
    ) : (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="h-11 md:h-7" disabled={exporting}>
                    <Download aria-hidden="true" />
                    Export
                    <ChevronDown className="text-ink-3" aria-hidden="true" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void handleExport("csv")}>The log as CSV</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void handleExport("json")}>The log as JSON</DropdownMenuItem>
                <DropdownMenuSeparator />
                {/* READ FIRST, DOWNLOAD SECOND: nobody hands an auditor a JSON
                    file. The document is a link, so it can be opened in a tab and
                    its address sent. */}
                <DropdownMenuItem asChild>
                    <Link href="/app/admin/evidence">Open the evidence pack</Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                    onSelect={() => void handleEvidencePack()}
                    title="The same pack as a file. The fingerprint is a digest of these bytes, so verification happens against the file."
                >
                    The evidence pack file
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )

    return (
        // No title of its own: the page frame names the section (the one-title rule).
        <section id="audit-log" aria-label="Audit log" data-audit-log="" className="space-y-3">
            <div data-audit-toolbar="" className="flex min-h-11 flex-wrap items-center gap-2">
                <div className="relative min-w-0 flex-1 md:w-[260px] md:flex-none">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
                    <Input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search the log…"
                        aria-label="Search the log"
                        autoComplete="off"
                        className="h-8 pl-8"
                    />
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="secondary" size="sm" className="h-11 md:h-7" aria-label="Filter audit entries by category">
                            Category
                            <ChevronDown className="text-ink-3" aria-hidden="true" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-[200px]">
                        <DropdownMenuLabel className="text-2xs font-medium text-ink-3">Category</DropdownMenuLabel>
                        {/* One at a time: the server filters by one category. */}
                        <DropdownMenuRadioGroup value={filter} onValueChange={setFilter}>
                            <DropdownMenuRadioItem value={ALL}>All</DropdownMenuRadioItem>
                            {categories.map((c) => {
                                const Icon = glyphOf(c)
                                return (
                                    <DropdownMenuRadioItem key={c} value={c} className="gap-2">
                                        <Icon className="size-3.5 text-ink-3" aria-hidden="true" />
                                        {categoryLabel(c)}
                                    </DropdownMenuRadioItem>
                                )
                            })}
                        </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
                <Button
                    size="sm"
                    variant="secondary"
                    className={cn("h-11 md:h-7", unattendedOnly && "bg-press")}
                    aria-pressed={unattendedOnly}
                    title="Only what ran on somebody's authority while they were away: scheduled runs, event-triggered runs, and work one agent handed to another"
                    onClick={() => setUnattendedOnly((v) => !v)}
                >
                    Nobody watching
                </Button>
                {/* The filters in use, as neutral chips with ×. */}
                {filter !== ALL && (
                    <Chip onRemove={() => setFilter(ALL)} removeLabel={`Stop filtering by ${categoryLabel(filter)}`}>
                        {categoryLabel(filter)}
                    </Chip>
                )}
                {unattendedOnly && (
                    <Chip onRemove={() => setUnattendedOnly(false)} removeLabel="Show attended runs too">
                        Nobody watching
                    </Chip>
                )}
                <div data-audit-actions="" className="ml-auto flex items-center gap-2">
                    {verifying ? (
                        <span role="status" className="audit-verify-pill inline-flex h-7 items-center gap-1.5 rounded-md bg-raised px-2.5 text-xs font-medium shadow-e1">
                            <Loader2 className="size-4 animate-spin text-brand" aria-hidden="true" />
                            Checking…
                        </span>
                    ) : (
                        <Button variant="secondary" size="sm" className="h-11 md:h-7" onClick={() => handleVerify("recent")}>
                            <ShieldCheck aria-hidden="true" />
                            Verify
                        </Button>
                    )}
                    {exportButton}
                    <Button variant="ghost" size="icon-sm" className="max-md:size-11" onClick={() => load(filter)} aria-label="Refresh the log">
                        <RefreshCw className={loading ? "animate-spin" : undefined} aria-hidden="true" />
                    </Button>
                </div>
            </div>

            {verifyResult && (
                <SealRow
                    result={verifyResult}
                    at={verifiedAt}
                    verifying={verifying}
                    onFull={() => void handleVerify("full")}
                    locked={exportLocked}
                    onJump={
                        jumpTo
                            ? () => {
                                  setOpen(jumpTo.id)
                                  document.getElementById(`audit-${jumpTo.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" })
                              }
                            : undefined
                    }
                />
            )}

            {/* The failure is checked before the empty case: both leave the list
                empty, and only one of them is true. */}
            {loading && entries.length === 0 ? (
                <AuditSkeleton />
            ) : failed && entries.length === 0 ? (
                <ErrorState compact subject="the audit log" detail={failure} onRetry={() => load(filter)} retrying={loading} />
            ) : entries.length === 0 && filtered ? (
                <EmptyState
                    illustration={<SpotSearch hue={ADMIN_GROUP_HUE.workspace} />}
                    title="No entries match this filter"
                    description="Nothing recorded in this category, or while nobody was watching."
                    action={
                        <Button variant="ghost" size="sm" onClick={showAll}>
                            Show every entry
                        </Button>
                    }
                />
            ) : entries.length === 0 ? (
                <EmptyState
                    tone="accent"
                    illustration={<SpotDocs hue={ADMIN_GROUP_HUE.workspace} />}
                    title="No audit entries yet"
                    description="Changes to settings, and what agents do for people, are recorded here as they happen."
                />
            ) : shown.length === 0 ? (
                <EmptyState
                    illustration={<SpotSearch hue={ADMIN_GROUP_HUE.workspace} />}
                    title={`Nothing matches “${search.trim()}”.`}
                    description={`In the ${entries.length} entries read so far.`}
                    action={
                        <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
                            Clear search
                        </Button>
                    }
                />
            ) : (
                // No scroller of its own: the admin page's tab region scrolls.
                <>
                    <div aria-label="Audit entries" role="list" data-audit-list="">
                        {groups.map((g) => (
                            <div key={g.day} role="listitem" data-audit-day-group="">
                                <h3 className="audit-day">{g.day}</h3>
                                <ul aria-label={g.day}>
                                    {g.entries.map((e) => (
                                        <AuditRow
                                            key={e.id}
                                            entry={e}
                                            unattendedKinds={unattendedKinds}
                                            open={open === e.id}
                                            live={fresh.has(e.id)}
                                            onToggle={() => setOpen((o) => (o === e.id ? null : e.id))}
                                        />
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                    {hasOlder && (
                        <Button variant="secondary" size="sm" onClick={loadOlder} disabled={loadingOlder}>
                            {loadingOlder ? "Loading older entries…" : "Show older entries"}
                        </Button>
                    )}
                </>
            )}
            <EvidenceReceipts />
        </section>
    )
}
