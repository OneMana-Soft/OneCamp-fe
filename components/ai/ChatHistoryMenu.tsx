"use client"

/**
 * ChatHistoryMenu: the list of past conversations with the assistant
 * (hub.md AI11).
 *
 * The reason this did not exist is worth recording, because it was not an
 * oversight in the UI. There was nothing to list. Conversation history lived
 * only in Redis under a 30 minute TTL, the session id lived only in React state
 * so a reload lost it, and nothing indexed a person's sessions at all. Every
 * layer had to change before a menu could be written.
 *
 * A 320 px popover: a search field, then Today, Yesterday and Earlier, each a
 * 32 px row with the title and its time, the open conversation marked with the
 * selection's brand edge. Delete confirms in the row itself. Loads when it
 * opens rather than on mount: this sits in a panel that is open most of the
 * day, and a list nobody is looking at should not be polled. (Rename waits for
 * an endpoint; the server has none.)
 */

import React, { useCallback, useMemo, useState } from "react"

import { deleteChatSession, getChatSession, listChatSessions, type ChatSessionSummary } from "@/services/aiService"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { HubRowSkeleton } from "@/components/ui/hubRow"
import { History, Search, Trash2 } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { withAI } from "@/components/common/withFeature"
import { cn } from "@/lib/utils/helpers/cn"
import { clockTime } from "@/lib/utils/date/clock"
import { shortDate } from "@/lib/utils/date/shortDate"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { apiErrorMessage } from "@/lib/utils/apiError"

export interface ResumedConversation {
    sessionId: string
    messages: Array<{ role: "user" | "assistant"; content: string }>
}

interface Props {
    /** Hands the caller a conversation to render and continue writing into. */
    onResume: (conversation: ResumedConversation) => void
    /** The conversation on screen, marked in the list. */
    currentId?: string | null
}

export type HistoryGroup = "Today" | "Yesterday" | "Earlier"

/** Which day group a conversation falls in, by its last message, in the device's day. Pure. */
export function historyGroup(updatedAt: string, now = new Date()): HistoryGroup {
    const at = new Date(updatedAt)
    const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const diff = Math.round((day(now) - day(at)) / 86_400_000)
    return diff <= 0 ? "Today" : diff === 1 ? "Yesterday" : "Earlier"
}

function when(updatedAt: string, group: HistoryGroup): string {
    const d = new Date(updatedAt)
    if (Number.isNaN(d.getTime())) return ""
    return group !== "Earlier" ? clockTime(d) : shortDate(d)
}

const ChatHistoryMenuUngated: React.FC<Props> = ({ onResume, currentId }) => {
    const [open, setOpen] = useState(false)
    const [sessions, setSessions] = useState<ChatSessionSummary[] | null>(null)
    const [loading, setLoading] = useState(false)
    const [busyId, setBusyId] = useState<string | null>(null)
    const [confirming, setConfirming] = useState<string | null>(null)
    const [query, setQuery] = useState("")
    const { toast } = useToast()

    const load = useCallback(async () => {
        setLoading(true)
        try {
            // Said by the toast below, once: the request's own stays quiet.
            setSessions(await listChatSessions(OWN_ERRORS))
        } catch (e) {
            setSessions([])
            toast({ title: "Couldn't load your conversations", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }, [toast])

    const resume = async (id: string) => {
        setBusyId(id)
        try {
            const messages = await getChatSession(id)
            onResume({ sessionId: id, messages: messages.map((m) => ({ role: m.role, content: m.content })) })
            setOpen(false)
        } catch {
            toast({ title: "Could not open that conversation", variant: "destructive" })
        } finally {
            setBusyId(null)
        }
    }

    const remove = async (id: string) => {
        setBusyId(id)
        try {
            await deleteChatSession(id)
            setSessions((prev) => (prev || []).filter((s) => s.id !== id))
        } catch {
            toast({ title: "Could not delete that conversation", variant: "destructive" })
        } finally {
            setBusyId(null)
            setConfirming(null)
        }
    }

    const groups = useMemo(() => {
        const q = query.trim().toLowerCase()
        const out: Record<HistoryGroup, ChatSessionSummary[]> = { Today: [], Yesterday: [], Earlier: [] }
        for (const s of sessions ?? []) {
            if (q && !(s.title || "").toLowerCase().includes(q)) continue
            out[historyGroup(s.updated_at || s.created_at)].push(s)
        }
        return out
    }, [sessions, query])
    const none = !loading && sessions !== null && Object.values(groups).every((g) => g.length === 0)

    return (
        <Popover
            open={open}
            onOpenChange={(o) => {
                setOpen(o)
                if (o) void load()
                else setConfirming(null)
            }}
        >
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label="Past conversations"
                    title="History"
                    data-touch-target=""
                    className="grid size-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand [&_svg]:size-4"
                >
                    <History />
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 rounded-lg p-1 shadow-e3" data-history="">
                <label className="field-surface flex h-8 items-center gap-2 rounded-md px-2">
                    <Search className="size-3.5 text-ink-3" aria-hidden />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search conversations"
                        aria-label="Search conversations"
                        className="min-w-0 flex-1 bg-transparent text-ui-sm outline-none placeholder:text-ink-3"
                    />
                </label>
                <div className="mt-1 max-h-[min(60vh,420px)] overflow-y-auto">
                    {loading ? (
                        <div aria-label="Loading your conversations" role="status">
                            {[0, 1, 2].map((i) => (
                                <HubRowSkeleton key={i} density="compact" />
                            ))}
                        </div>
                    ) : null}
                    {none ? <p className="px-2 py-3 text-ui-sm text-ink-2">{query ? "No conversation matches" : "No earlier chats"}</p> : null}
                    {!loading &&
                        (Object.keys(groups) as HistoryGroup[]).map((g) =>
                            groups[g].length === 0 ? null : (
                                <div key={g} role="group" aria-label={g}>
                                    <p className="flex h-7 items-center px-2 text-meta font-medium text-ink-3">{g}</p>
                                    {groups[g].map((s) =>
                                        confirming === s.id ? (
                                            <div key={s.id} data-history-confirm="" className="flex h-8 items-center gap-1.5 rounded-md bg-hover px-2 text-ui-sm">
                                                <span className="min-w-0 flex-1 truncate">Delete this chat?</span>
                                                <Button size="xs" variant="ghost" className="text-danger-ink" onClick={() => void remove(s.id)} disabled={busyId === s.id}>
                                                    Delete
                                                </Button>
                                                <Button size="xs" variant="ghost" onClick={() => setConfirming(null)}>
                                                    Cancel
                                                </Button>
                                            </div>
                                        ) : (
                                            <div
                                                key={s.id}
                                                data-history-row=""
                                                data-current={currentId === s.id ? "" : undefined}
                                                className={cn(
                                                    "group/hist relative flex h-8 items-center gap-2 rounded-md pl-2 pr-1 transition-colors hover:bg-hover",
                                                    currentId === s.id && "bg-press before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-brand",
                                                )}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => void resume(s.id)}
                                                    disabled={busyId === s.id}
                                                    className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:underline"
                                                >
                                                    <span className="min-w-0 flex-1 truncate text-ui-sm font-book">{s.title || "Untitled conversation"}</span>
                                                    <span className="shrink-0 text-meta tabular-nums text-ink-3 group-hover/hist:hidden">{when(s.updated_at || s.created_at, g)}</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setConfirming(s.id)}
                                                    aria-label={`Delete ${s.title || "conversation"}`}
                                                    className="hidden size-6 shrink-0 place-items-center rounded-sm text-ink-3 hover:text-danger-ink focus-visible:grid group-hover/hist:grid [@media(hover:none)]:grid [&_svg]:size-3.5"
                                                >
                                                    <Trash2 />
                                                </button>
                                            </div>
                                        ),
                                    )}
                                </div>
                            ),
                        )}
                </div>
            </PopoverContent>
        </Popover>
    )
}

// Gated on the AI subsystem: hidden entirely on the AI-free edition, and on the
// AI edition whenever an admin has switched AI off.
export const ChatHistoryMenu = withAI(ChatHistoryMenuUngated)
