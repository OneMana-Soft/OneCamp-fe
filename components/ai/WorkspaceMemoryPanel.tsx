"use client"

/**
 * WorkspaceMemoryPanel — the "what does my workspace know" surface.
 *
 * Shows the structured knowledge the AI has captured from the workspace —
 * decisions, commitments, and open questions — all permission-scoped
 * server-side to what the user can see. Users can resolve, dismiss, or
 * delete items, review what they've already closed out, and reopen items.
 *
 * UX principles (Notion-like, calm, high-signal):
 *   - One fetch per status view, instant client-side kind filtering — the
 *     kind tabs never flash a spinner.
 *   - Every destructive/lifecycle action (resolve, dismiss, delete) is
 *     optimistic AND undoable: a toast offers a one-click Undo for a few
 *     seconds, so a misclick is never costly.
 *   - A status switch (Open / Resolved / Dismissed) lets users review and
 *     reopen items, instead of items vanishing forever.
 *   - Actions are tucked into a hover/focus "…" menu so the list stays
 *     clean; the primary affordance is one click.
 *   - Backlinks resolve a real, human name for every scope — channel,
 *     project, group chat, or DM — never a bare uuid or generic label.
 *   - Overdue commitments are visually emphasized so the most actionable
 *     items surface first.
 *   - Relative timestamps, quiet empty states, optimistic updates with
 *     graceful rollback on failure.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  MemoryItem,
  MemoryKind,
  MemoryStatus,
  deleteMemoryItem,
  listWorkspaceMemory,
  updateMemoryStatus,
  updateMemoryDue,
  createTaskFromMemory,
  remindAboutMemory,
  getChannelMemoryExclusion,
  setChannelMemoryExclusion,
} from "@/services/memoryService"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { useSelector } from "react-redux"
import { useRouter, useSearchParams } from "next/navigation"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { resolveMemoryBacklink } from "@/lib/utils/memoryBacklink"
import type { RootState } from "@/store/store"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import { DateField } from "@/components/task/taskDateField"
import {
  Sparkles,
  Check,
  CheckCircle2,
  HelpCircle,
  Zap,
  Clock,
  MoreHorizontal,
  Trash2,
  X,
  RefreshCw,
  RotateCcw,
  Hash,
  Users,
  Folder,
  MessageCircle,
  ArrowUpRight,
  CheckSquare,
  Bell,
} from "@/lib/icons"
import { ToastAction } from "@/components/ui/toast"
import { cn } from "@/lib/utils/helpers/cn"
import axios from "axios"

// Backlink is a resolved "where this came from" target for a memory item.
interface Backlink {
  label: string
  href: string
  Icon: React.ComponentType<{ className?: string }>
  prefix?: string // e.g. "#" for channels
}

// sourceOriginLabel renders a short, honest description of HOW a memory item
// was captured, so provenance is explicit ("from a meeting recap", "from a
// post"). Worker-extracted items (scope-keyed, no per-message uuid) read as
// "from channel activity" rather than implying a single source message.
function sourceOriginLabel(it: MemoryItem): string {
  switch (it.source_type) {
    case "recap":
    case "transcript":
      return "from a meeting recap"
    case "post":
      // A real per-post capture has a uuid source; the batch worker keys by
      // scope, so distinguish them honestly.
      return it.source_uuid && !it.source_uuid.includes(":") && it.source_uuid.length >= 32
        ? "from a post"
        : "from channel activity"
    case "chat":
      return it.source_uuid && !it.source_uuid.includes(":") && it.source_uuid.length >= 32
        ? "from a message"
        : "from conversation activity"
    case "comment":
      return "from a comment"
    case "doc":
      return "from a doc"
    default:
      return "captured by AI"
  }
}

// errMessage safely extracts a human-readable message from an unknown error.
const errMessage = (e: unknown): string => {
  if (axios.isAxiosError(e)) {
    return e.response?.data?.msg || e.response?.data?.message || e.message
  }
  if (e instanceof Error) return e.message
  return "Something went wrong"
}

type TabValue = MemoryKind | "all"

const KIND_TABS: { value: TabValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "decision", label: "Decisions" },
  { value: "commitment", label: "Commitments" },
  { value: "question", label: "Questions" },
]

// Per-kind visual identity. Kept muted/calm — a single accent dot + icon,
// not loud colored badges, so a long list stays scannable.
const KIND_META: Record<
  MemoryKind,
  { label: string; Icon: React.ComponentType<{ className?: string }>; dot: string; tint: string }
> = {
  decision: { label: "Decision", Icon: Zap, dot: "bg-violet-500", tint: "text-violet-600 dark:text-violet-400" },
  commitment: { label: "Commitment", Icon: CheckCircle2, dot: "bg-blue-500", tint: "text-blue-600 dark:text-blue-400" },
  question: { label: "Open question", Icon: HelpCircle, dot: "bg-amber-500", tint: "text-amber-600 dark:text-amber-400" },
  glossary: { label: "Glossary", Icon: Sparkles, dot: "bg-slate-400", tint: "text-slate-500" },
}

// relativeTime renders a compact, human "x ago" / "in x" string.
function relativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ""
  const diffMs = Date.now() - t
  const abs = Math.abs(diffMs)
  const day = 86_400_000
  const min = 60_000
  const hr = 3_600_000
  const fmt = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`
  let phrase: string
  if (abs < min) phrase = "just now"
  else if (abs < hr) phrase = fmt(Math.round(abs / min), "min")
  else if (abs < day) phrase = fmt(Math.round(abs / hr), "hr")
  else if (abs < 30 * day) phrase = fmt(Math.round(abs / day), "day")
  else phrase = new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" })
  if (phrase === "just now") return phrase
  return diffMs >= 0 ? `${phrase} ago` : `in ${phrase}`
}

// dueState classifies a commitment's due date for emphasis.
function dueState(due?: string): { label: string; overdue: boolean } | null {
  if (!due) return null
  const d = new Date(due)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dueDay = new Date(d)
  dueDay.setHours(0, 0, 0, 0)
  const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  return { label, overdue: dueDay.getTime() < today.getTime() }
}

// toDateInputValue converts a stored due value (ISO timestamp or YYYY-MM-DD)
// into the "YYYY-MM-DD" a native <input type="date"> expects. Empty when unset
// or unparseable.
function toDateInputValue(due?: string): string {
  if (!due) return ""
  const d = new Date(due)
  if (Number.isNaN(d.getTime())) return ""
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export default function WorkspaceMemoryPanel({
  channelUUID,
  channelName,
}: {
  channelUUID?: string
  channelName?: string
} = {}) {
  const { toast } = useToast()
  const router = useRouter()
  const channels = useSelector((s: RootState) => s.users.userSidebar.userChannels)
  const projects = useSelector((s: RootState) => s.users.userSidebar.userProjects)
  // Current user's UUID — needed to resolve the "other participant" in a
  // 1:1 DM grouping id so DM-scoped items deep-link to the right chat.
  const { data: selfProfile } = useFetchOnlyOnce<{ data?: { user_uuid?: string } }>(GetEndpointUrl.SelfProfile)
  const currentUserId = selfProfile?.data?.user_uuid
  // Channel exclusion state — only meaningful when scoped to a channel.
  const [excluded, setExcluded] = useState<boolean | null>(null)
  const [excludeBusy, setExcludeBusy] = useState(false)

  useEffect(() => {
    if (!channelUUID) {
      setExcluded(null)
      return
    }
    let alive = true
    getChannelMemoryExclusion(channelUUID)
      .then((v) => alive && setExcluded(v))
      .catch(() => alive && setExcluded(null)) // not admin / not accessible → hide toggle
    return () => {
      alive = false
    }
  }, [channelUUID])

  const toggleExclusion = useCallback(async () => {
    if (!channelUUID || excluded === null) return
    const next = !excluded
    setExcludeBusy(true)
    setExcluded(next) // optimistic
    try {
      await setChannelMemoryExclusion(channelUUID, next)
    } catch {
      setExcluded(!next) // rollback
    } finally {
      setExcludeBusy(false)
    }
  }, [channelUUID, excluded])
  const [items, setItems] = useState<MemoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabValue>("all")
  const [statusView, setStatusView] = useState<MemoryStatus>("open")
  const [busyId, setBusyId] = useState<string | null>(null)

  // Deep-link target: a nudge (or any link) can open ?item=<id> to jump
  // straight to one commitment. We force the Open view + All kinds so the
  // item is in the list, then scroll to and briefly highlight it.
  const searchParams = useSearchParams()
  const deepLinkItemId = searchParams?.get("item") || ""
  const [highlightId, setHighlightId] = useState<string>("")

  // Resolve a memory item's "where it came from" backlink. The routing
  // decision (label + href + kind) lives in a pure, unit-tested helper
  // (resolveMemoryBacklink); here we only attach the per-kind icon/prefix.
  // Names prefer the server-resolved value, falling back to the client
  // sidebar so older cached items still resolve.
  const resolveBacklink = useCallback(
    (it: MemoryItem): Backlink | null => {
      const r = resolveMemoryBacklink(it, {
        currentUserId,
        channelNameByUUID: (uuid) =>
          channels?.find((c: { ch_uuid: string; ch_name: string }) => c.ch_uuid === uuid)?.ch_name,
        projectNameByUUID: (uuid) =>
          projects?.find((p: { project_uuid: string; project_name: string }) => p.project_uuid === uuid)?.project_name,
      })
      if (!r) return null
      switch (r.kind) {
        case "channel":
          return { label: r.label, href: r.href, Icon: Hash, prefix: "#" }
        case "project":
          return { label: r.label, href: r.href, Icon: Folder }
        case "group":
          return { label: r.label, href: r.href, Icon: Users }
        case "dm":
          return { label: r.label, href: r.href, Icon: MessageCircle }
        default:
          return { label: r.label, href: r.href, Icon: Hash }
      }
    },
    [channels, projects, currentUserId],
  )

  // Pending commits keyed by item id. We optimistically remove the row and
  // schedule the real API call after a short grace window so the toast's
  // "Undo" can cancel it entirely — no inverse call, no flicker, Gmail-style.
  // We retain the `commit` fn (not just the timer) so we can FLUSH a pending
  // mutation immediately rather than drop it — a resolve done 1s before
  // navigating away, reloading, or switching status views must still persist.
  const pendingRef = React.useRef<Map<string, { item: MemoryItem; commit: () => Promise<void>; timer: ReturnType<typeof setTimeout> }>>(new Map())
  const UNDO_MS = 5000

  // flushPending fires every still-pending commit immediately (fire-and-
  // forget) and clears the queue. Used on reload / status-switch / unmount so
  // a deferred action is never lost or resurrected by a refetch.
  const flushPending = useCallback(() => {
    const pending = pendingRef.current
    pending.forEach(({ commit, timer }) => {
      clearTimeout(timer)
      void commit().catch(() => {})
    })
    pending.clear()
  }, [])

  // Fetch the items for the active status view; kind tabs filter in-memory
  // so switching kinds is instant and never flashes a loader. Refetches
  // when the status view changes (Open / Resolved / Dismissed). Any pending
  // (within-undo-window) action is flushed first so a reload can't resurrect
  // a row the user just resolved/dismissed/deleted.
  const load = useCallback(async () => {
    flushPending()
    setLoading(true)
    try {
      const res = await listWorkspaceMemory(undefined, [statusView], channelUUID)
      setItems(res.items)
    } catch {
      toast({ title: "Couldn't load workspace memory", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast, channelUUID, statusView, flushPending])

  useEffect(() => {
    load()
  }, [load])

  // Deep-link: when arriving with ?item=<id>, make sure the item is visible —
  // it's an open commitment, so switch to the Open view + All kinds. Runs once
  // per distinct deep-link id.
  useEffect(() => {
    if (!deepLinkItemId) return
    setStatusView("open")
    setTab("all")
  }, [deepLinkItemId])

  // After the list loads, scroll to the deep-linked item and pulse-highlight
  // it so the user sees exactly which commitment the nudge was about. Cleared
  // after the animation; if the item isn't in the list (already resolved), we
  // simply do nothing.
  useEffect(() => {
    if (!deepLinkItemId || loading) return
    if (!items.some((i) => i.id === deepLinkItemId)) return
    setHighlightId(deepLinkItemId)
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(`memory-item-${deepLinkItemId}`)
      el?.scrollIntoView({ behavior: "smooth", block: "center" })
    })
    const t = setTimeout(() => setHighlightId(""), 2600)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t)
    }
  }, [deepLinkItemId, loading, items])

  // On unmount, flush any still-pending commits so an action taken inside the
  // undo window isn't lost when the user navigates away or the panel closes.
  useEffect(() => {
    return () => {
      flushPending()
    }
  }, [flushPending])

  // deferAction optimistically removes the row from the current view, shows
  // an undoable toast, and commits the API call after the grace window.
  // `commit` performs the real mutation; `label` is the past-tense verb.
  const deferAction = useCallback(
    (item: MemoryItem, commit: () => Promise<void>, label: string) => {
      const id = item.id
      // The toast viewport shows ONE toast at a time, so only one action can
      // be undone at any moment. Commit every OTHER still-pending action now
      // (its undo window is no longer visible anyway) so nothing lingers in a
      // hidden, un-undoable state. The same-id entry is also flushed here.
      pendingRef.current.forEach(({ commit: c, timer }) => {
        clearTimeout(timer)
        void c().catch(() => {})
      })
      pendingRef.current.clear()

      // Optimistic removal from the visible list.
      setItems((cur) => cur.filter((i) => i.id !== id))

      const run = async () => {
        pendingRef.current.delete(id)
        try {
          await commit()
        } catch (e: unknown) {
          // Commit failed — restore the row and tell the user.
          setItems((cur) =>
            cur.some((i) => i.id === id) ? cur : [...cur, item],
          )
          toast({ title: "Action failed", description: errMessage(e), variant: "destructive" })
        }
      }

      const timer = setTimeout(run, UNDO_MS)
      pendingRef.current.set(id, { item, commit, timer })

      const undo = () => {
        const p = pendingRef.current.get(id)
        if (!p) return
        clearTimeout(p.timer)
        pendingRef.current.delete(id)
        // Restore the row in place (re-sorted by the memo below).
        setItems((cur) => (cur.some((i) => i.id === id) ? cur : [...cur, item]))
      }

      toast({
        title: label,
        duration: UNDO_MS,
        action: (
          <ToastAction altText="Undo" onClick={undo}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Undo
          </ToastAction>
        ),
      })
    },
    [toast],
  )

  const resolve = (item: MemoryItem) =>
    deferAction(item, () => updateMemoryStatus(item.id, "resolved"), "Marked resolved")
  const dismiss = (item: MemoryItem) =>
    deferAction(item, () => updateMemoryStatus(item.id, "dismissed" as MemoryStatus), "Dismissed")
  const remove = (item: MemoryItem) =>
    deferAction(item, () => deleteMemoryItem(item.id), "Deleted")
  // Reopen is only offered in the Resolved/Dismissed views; it's immediate
  // (no undo) since it's inherently non-destructive and reversible.
  const reopen = async (item: MemoryItem) => {
    setBusyId(item.id)
    setItems((cur) => cur.filter((i) => i.id !== item.id))
    try {
      await updateMemoryStatus(item.id, "open")
      toast({ title: "Reopened" })
    } catch (e: unknown) {
      setItems((cur) => (cur.some((i) => i.id === item.id) ? cur : [...cur, item]))
      toast({ title: "Couldn't reopen", description: errMessage(e), variant: "destructive" })
    } finally {
      setBusyId(null)
    }
  }

  // Create a task from a memory item (commitment → tracked task). On success
  // the backend resolves the memory, so we drop it from the open list.
  const createTask = async (id: string, projectUUID: string) => {
    setBusyId(id)
    try {
      const res = await createTaskFromMemory(id, { project_uuid: projectUUID })
      if (res?.success) {
        setItems((cur) => cur.filter((i) => i.id !== id))
        toast({ title: "Task created", description: res.message })
      } else {
        toast({ title: "Couldn't create task", description: res?.message, variant: "destructive" })
      }
    } catch (e: unknown) {
      toast({ title: "Couldn't create task", description: errMessage(e), variant: "destructive" })
    } finally {
      setBusyId(null)
    }
  }

  // Set a reminder for tomorrow morning (9am local) about a memory item.
  const remind = async (id: string) => {
    setBusyId(id)
    try {
      const d = new Date()
      d.setDate(d.getDate() + 1)
      d.setHours(9, 0, 0, 0)
      const res = await remindAboutMemory(id, d.toISOString())
      if (res?.success) {
        toast({ title: "Reminder set", description: res.message })
      } else {
        toast({ title: "Couldn't set reminder", description: res?.message, variant: "destructive" })
      }
    } catch (e: unknown) {
      toast({ title: "Couldn't set reminder", description: errMessage(e), variant: "destructive" })
    } finally {
      setBusyId(null)
    }
  }

  // Set or clear a commitment's due date ("YYYY-MM-DD", or "" to clear).
  // Optimistically patches the in-memory item so the "due"/"overdue" chip and
  // sort order update immediately, then persists.
  const setDue = async (id: string, due: string) => {
    const prev = items.find((i) => i.id === id)
    const prevDue = prev?.due_at
    setBusyId(id)
    // Optimistic: store as an ISO-ish value the dueState() parser accepts.
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, due_at: due || undefined } : i)))
    try {
      await updateMemoryDue(id, due)
      toast({ title: due ? "Due date set" : "Due date cleared" })
    } catch (e: unknown) {
      // Roll back on failure.
      setItems((cur) => cur.map((i) => (i.id === id ? { ...i, due_at: prevDue } : i)))
      toast({ title: "Couldn't update due date", description: errMessage(e), variant: "destructive" })
    } finally {
      setBusyId(null)
    }
  }

  const projectOptions = useMemo(
    () => (projects || []).map((p: { project_uuid: string; project_name: string }) => ({ uuid: p.project_uuid, name: p.project_name })),
    [projects],
  )

  const counts = useMemo(() => {
    const c: Record<string, number> = { decision: 0, commitment: 0, question: 0 }
    for (const it of items) c[it.kind] = (c[it.kind] || 0) + 1
    return c
  }, [items])

  const visible = useMemo(() => {
    const filtered = tab === "all" ? items : items.filter((i) => i.kind === tab)
    // Sort: overdue commitments first, then by recency.
    return [...filtered].sort((a, b) => {
      const ao = dueState(a.due_at)?.overdue ? 1 : 0
      const bo = dueState(b.due_at)?.overdue ? 1 : 0
      if (ao !== bo) return bo - ao
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [items, tab])

  const total = items.length

  // Status views the user can switch between. Only meaningful labels —
  // "Open" is the working set; Resolved/Dismissed are the review archives.
  const STATUS_VIEWS: { value: MemoryStatus; label: string }[] = [
    { value: "open", label: "Open" },
    { value: "resolved", label: "Resolved" },
    { value: "dismissed", label: "Dismissed" },
  ]

  return (
    <div className="flex flex-col h-full w-full bg-background">
      {/* Header */}
      <header className="flex-shrink-0 px-4 sm:px-8 pt-5 sm:pt-6 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="bg-primary/10 p-1.5 rounded-lg flex-shrink-0">
            <Sparkles className="h-[18px] w-[18px] text-primary" />
          </div>
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight truncate min-w-0">
            {channelName ? <>Memory in <span className="text-primary">#{channelName}</span></> : "Workspace Memory"}
          </h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={load}
            title="Refresh"
            aria-label="Refresh"
            className="ml-auto flex-shrink-0 h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">
          {channelName
            ? `Decisions, commitments, and open questions the AI captured in #${channelName}.`
            : "Decisions, commitments, and open questions the AI captured from your meetings, channels, DMs, and projects. Resolve them as they close out."}
        </p>
        {channelUUID && excluded !== null && (
          <button
            type="button"
            onClick={toggleExclusion}
            disabled={excludeBusy}
            className={`mt-2 inline-flex items-center gap-1.5 text-xs rounded-md px-2 py-1 border transition-colors ${
              excluded
                ? "border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/5"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
            title={excluded ? "AI memory is paused for this channel" : "Pause AI memory capture for this channel"}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${excluded ? "bg-amber-500" : "bg-emerald-500"}`} />
            {excluded ? "Memory paused for this channel" : "Capturing memory · click to pause"}
          </button>
        )}

        {/* Status switch — segmented control to move between the working set
            (Open) and the review archives (Resolved / Dismissed). */}
        <div
          className="mt-4 inline-flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5"
          role="tablist"
          aria-label="Memory status"
        >
          {STATUS_VIEWS.map((s) => {
            const active = statusView === s.value
            return (
              <button
                key={s.value}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setStatusView(s.value)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      </header>

      {/* Filter tabs with live counts. Horizontally scrollable on narrow
          screens so the kind row never wraps or clips. */}
      <div className="flex-shrink-0 px-4 sm:px-8 border-b border-border/60">
        <div
          className="flex gap-1 -mb-px overflow-x-auto no-scrollbar"
          role="tablist"
          aria-label="Filter memory by kind"
        >
          {KIND_TABS.map((t) => {
            const n = t.value === "all" ? total : counts[t.value] || 0
            const active = tab === t.value
            return (
              <button
                key={t.value}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setTab(t.value)}
                className={`relative flex-shrink-0 whitespace-nowrap px-3 py-2.5 text-sm transition-colors border-b-2 ${
                  active
                    ? "border-primary text-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                <span
                  className={`ml-1.5 text-xs tabular-nums ${active ? "text-primary" : "text-muted-foreground/70"}`}
                >
                  {n}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-4 custom-scrollbar">
        {loading ? (
          <SkeletonList />
        ) : visible.length === 0 ? (
          <EmptyState tab={tab} hasAny={total > 0} statusView={statusView} />
        ) : (
          <ul className="space-y-1.5 max-w-3xl mx-auto">
            {visible.map((it) => (
              <MemoryRow
                key={it.id}
                item={it}
                busy={busyId === it.id}
                highlight={highlightId === it.id}
                statusView={statusView}
                backlink={resolveBacklink(it)}
                projects={projectOptions}
                onOpen={(href) => router.push(href)}
                onResolve={() => resolve(it)}
                onDismiss={() => dismiss(it)}
                onDelete={() => remove(it)}
                onReopen={() => reopen(it)}
                onCreateTask={(projectUUID) => createTask(it.id, projectUUID)}
                onRemind={() => remind(it.id)}
                onSetDue={(due) => setDue(it.id, due)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// MemoryRow is a single, calm list row: accent dot + content + a quiet
// primary affordance and an overflow menu that appear on hover/focus. In
// the Open view the primary action is "Resolve"; in Resolved/Dismissed
// views it's "Reopen".
function MemoryRow({
  item,
  busy,
  highlight,
  statusView,
  backlink,
  projects,
  onOpen,
  onResolve,
  onDismiss,
  onDelete,
  onReopen,
  onCreateTask,
  onRemind,
  onSetDue,
}: {
  item: MemoryItem
  busy: boolean
  highlight?: boolean
  statusView: MemoryStatus
  backlink: Backlink | null
  projects: { uuid: string; name: string }[]
  onOpen: (href: string) => void
  onResolve: () => void
  onDismiss: () => void
  onDelete: () => void
  onReopen: () => void
  onCreateTask: (projectUUID: string) => void
  onRemind: () => void
  onSetDue: (due: string) => void
}) {
  const meta = KIND_META[item.kind] ?? KIND_META.glossary
  const due = item.kind === "commitment" ? dueState(item.due_at) : null
  const isClosed = statusView !== "open"
  const BacklinkIcon = backlink?.Icon ?? Hash

  // Parsed Date for the picker (DateField works in Date objects; the API
  // speaks YYYY-MM-DD). Local-time midnight so the calendar highlights the
  // intended day regardless of timezone.
  const dueDateObj = React.useMemo(() => {
    if (!item.due_at) return undefined
    const s = toDateInputValue(item.due_at)
    if (!s) return undefined
    const [y, m, d] = s.split("-").map(Number)
    return new Date(y, m - 1, d)
  }, [item.due_at])

  const handlePickDue = (d: Date | undefined) => {
    if (!d) {
      onSetDue("")
      return
    }
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    onSetDue(`${y}-${m}-${day}`)
  }

  // Keep the hover-revealed action row pinned while a popover/menu is open,
  // so moving the cursor off the row into the (portaled) calendar or dropdown
  // doesn't fade the controls out from under the user.
  const [actionsPinned, setActionsPinned] = useState(false)

  return (
    <li
      id={`memory-item-${item.id}`}
      className={cn(
        "group relative rounded-lg border border-transparent hover:border-border hover:bg-accent/30 transition-colors px-3 py-2.5 flex items-start gap-3",
        busy && "opacity-50 pointer-events-none",
        highlight && "border-primary/60 bg-primary/5 ring-2 ring-primary/30 animate-msg-fade-in",
      )}
    >
      {/* Kind accent */}
      <span className="mt-1.5 flex-shrink-0" title={meta.label}>
        <span className={`block h-2 w-2 rounded-full ${meta.dot}`} />
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug break-words">{item.content}</p>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-xs text-muted-foreground">
          <span className={`inline-flex items-center gap-1 ${meta.tint}`}>
            <meta.Icon className="h-3 w-3" />
            {meta.label}
          </span>
          {due && (
            <span
              className={`inline-flex items-center gap-1 ${
                due.overdue ? "text-red-600 dark:text-red-400 font-medium" : ""
              }`}
            >
              <Clock className="h-3 w-3" />
              {due.overdue ? `overdue · ${due.label}` : `due ${due.label}`}
            </span>
          )}
          <span className="text-muted-foreground/70">{relativeTime(item.created_at)}</span>
          <span className="text-muted-foreground/50">·</span>
          <span className="text-muted-foreground/70 italic">{sourceOriginLabel(item)}</span>
          {backlink &&
            (backlink.href ? (
              <button
                type="button"
                onClick={() => onOpen(backlink.href)}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                title={`Open ${backlink.prefix ?? ""}${backlink.label}`}
              >
                <BacklinkIcon className="h-3 w-3" />
                <span className="max-w-[160px] truncate">
                  {backlink.prefix}
                  {backlink.label}
                </span>
                <ArrowUpRight className="h-3 w-3 opacity-60" />
              </button>
            ) : (
              <span
                className="inline-flex items-center gap-1 text-muted-foreground/80"
                title={`${backlink.prefix ?? ""}${backlink.label}`}
              >
                <BacklinkIcon className="h-3 w-3" />
                <span className="max-w-[160px] truncate">
                  {backlink.prefix}
                  {backlink.label}
                </span>
              </span>
            ))}
        </div>
      </div>

      {/* Actions. On touch/mobile there is no hover, so actions are always
          visible; on desktop they stay quiet until hover/focus to keep the
          list calm. While a popover/menu is open we pin them visible so the
          cursor can travel into the (portaled) calendar without the row
          fading out. */}
      <div
        className={cn(
          "flex items-center gap-0.5 flex-shrink-0 transition-opacity",
          actionsPinned
            ? "opacity-100"
            : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
        )}
      >
        {/* Due-date picker — open commitments only. Reuses the task DateField
            (Popover on desktop, Drawer on mobile, with Clear). */}
        {!isClosed && item.kind === "commitment" && (
          <DateField
            isAdmin
            compact
            label={item.due_at ? "Due" : "Set due"}
            value={dueDateObj}
            onSelect={handlePickDue}
            onClear={() => onSetDue("")}
            onOpenChange={setActionsPinned}
            className={cn(due?.overdue && "border-red-500/40 text-red-600 dark:text-red-400")}
          />
        )}
        {isClosed ? (
          // Resolved / Dismissed view: the primary action is Reopen.
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-muted-foreground hover:text-foreground hover:bg-accent"
            disabled={busy}
            onClick={onReopen}
            title="Reopen"
            aria-label="Reopen"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="text-xs hidden sm:inline">Reopen</span>
          </Button>
        ) : (
          // Open view: the primary action is Resolve.
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
            disabled={busy}
            onClick={onResolve}
            title="Resolve"
            aria-label="Resolve"
          >
            <Check className="h-3.5 w-3.5" />
            <span className="text-xs hidden sm:inline">Resolve</span>
          </Button>
        )}
        <DropdownMenu onOpenChange={setActionsPinned}>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground"
              disabled={busy}
              aria-label="More actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {!isClosed && (
              <>
                {/* Create task — submenu only when there are multiple
                    projects. A single project skips the sub for a one-click
                    affordance. Only relevant for open items. */}
                {projects.length === 1 ? (
                  <DropdownMenuItem onClick={() => onCreateTask(projects[0].uuid)}>
                    <CheckSquare className="h-4 w-4" />
                    <span className="truncate">Create task in {projects[0].name}</span>
                  </DropdownMenuItem>
                ) : projects.length > 1 ? (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <CheckSquare className="h-4 w-4" />
                      Create task in…
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-64 overflow-y-auto min-w-[11rem]">
                      {projects.map((p) => (
                        <DropdownMenuItem key={p.uuid} onClick={() => onCreateTask(p.uuid)}>
                          <span className="truncate">{p.name}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : (
                  <DropdownMenuItem disabled>
                    <CheckSquare className="h-4 w-4" />
                    <span className="text-muted-foreground">No projects available</span>
                  </DropdownMenuItem>
                )}
                {/* Set due date — commitments only. Rendered as a DateField
                    in the action row (below), not here, since a date picker
                    can't work inside a Radix dropdown. */}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onRemind}>
                  <Bell className="h-4 w-4" />
                  Remind me tomorrow
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDismiss}>
                  <X className="h-4 w-4" />
                  Dismiss
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {isClosed && (
              <>
                <DropdownMenuItem onClick={onReopen}>
                  <RotateCcw className="h-4 w-4" />
                  Reopen
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}

function SkeletonList() {
  return (
    <ul className="space-y-1.5 max-w-3xl mx-auto" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="rounded-lg px-3 py-3 flex items-start gap-3">
          <span className="mt-1.5 h-2 w-2 rounded-full bg-muted animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 bg-muted rounded animate-pulse" style={{ width: `${70 - i * 6}%` }} />
            <div className="h-2.5 w-24 bg-muted/70 rounded animate-pulse" />
          </div>
        </li>
      ))}
    </ul>
  )
}

function EmptyState({
  tab,
  hasAny,
  statusView,
}: {
  tab: TabValue
  hasAny: boolean
  statusView: MemoryStatus
}) {
  // Distinguish "nothing at all yet" from "nothing in this filter".
  const filtered = hasAny && tab !== "all"

  // Closed views (Resolved / Dismissed) get their own calm copy so an empty
  // archive doesn't read like the feature was never used.
  if (!filtered && statusView !== "open") {
    const word = statusView === "resolved" ? "resolved" : "dismissed"
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-6">
        <div className="bg-muted/50 rounded-full p-3 mb-4">
          <CheckCircle2 className="h-6 w-6 text-muted-foreground/60" />
        </div>
        <p className="text-sm font-medium">Nothing {word} yet</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs leading-relaxed">
          Items you {word === "resolved" ? "resolve" : "dismiss"} will show up here, so you can review or reopen them.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="bg-muted/50 rounded-full p-3 mb-4">
        <Sparkles className="h-6 w-6 text-muted-foreground/60" />
      </div>
      {filtered ? (
        <>
          <p className="text-sm font-medium">All clear here</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            No {statusView} items of this kind right now.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium">Nothing captured yet</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm leading-relaxed">
            As your team makes decisions and commitments in meetings, channels, DMs, and projects,
            the AI will capture them here automatically.
          </p>
        </>
      )}
    </div>
  )
}
