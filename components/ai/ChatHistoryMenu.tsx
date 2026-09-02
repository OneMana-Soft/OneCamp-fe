"use client"

/**
 * ChatHistoryMenu — the list of past conversations with the assistant.
 *
 * The reason this did not exist is worth recording, because it was not an
 * oversight in the UI. There was nothing to list. Conversation history lived
 * only in Redis under a 30 minute TTL, the session id lived only in React state
 * so a reload lost it, and nothing indexed a person's sessions at all. Every
 * layer had to change before a menu could be written.
 *
 * Loads when the menu opens rather than on mount: this sits in a panel that is
 * open most of the day, and a list nobody is looking at should not be polled.
 */

import React, { useCallback, useState } from "react"

import {
    deleteChatSession,
    getChatSession,
    listChatSessions,
    type ChatSessionSummary,
} from "@/services/aiService"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { History, Loader2, Trash2 } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { withAI } from "@/components/common/withFeature"

export interface ResumedConversation {
    sessionId: string
    messages: Array<{ role: "user" | "assistant"; content: string }>
}

interface Props {
    /** Hands the caller a conversation to render and continue writing into. */
    onResume: (conversation: ResumedConversation) => void
}

const ChatHistoryMenuUngated: React.FC<Props> = ({ onResume }) => {
    const [sessions, setSessions] = useState<ChatSessionSummary[] | null>(null)
    const [loading, setLoading] = useState(false)
    const [busyId, setBusyId] = useState<string | null>(null)
    const { toast } = useToast()

    const load = useCallback(async () => {
        setLoading(true)
        try {
            setSessions(await listChatSessions())
        } catch {
            setSessions([])
            toast({ title: "Could not load your conversations", variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }, [toast])

    const resume = async (id: string) => {
        setBusyId(id)
        try {
            const messages = await getChatSession(id)
            onResume({ sessionId: id, messages: messages.map((m) => ({ role: m.role, content: m.content })) })
        } catch {
            toast({ title: "Could not open that conversation", variant: "destructive" })
        } finally {
            setBusyId(null)
        }
    }

    const remove = async (e: React.MouseEvent, id: string) => {
        // Without this the menu item's own handler fires and the conversation
        // opens as it is being deleted.
        e.preventDefault()
        e.stopPropagation()
        setBusyId(id)
        try {
            await deleteChatSession(id)
            setSessions((prev) => (prev || []).filter((s) => s.id !== id))
        } catch {
            toast({ title: "Could not delete that conversation", variant: "destructive" })
        } finally {
            setBusyId(null)
        }
    }

    return (
        <DropdownMenu onOpenChange={(open) => open && load()}>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Past conversations" title="Past conversations">
                    <History className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="text-2xs font-medium text-muted-foreground">
                    Past conversations
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                {loading && (
                    <div className="flex items-center gap-2 px-2 py-3 text-2xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading
                    </div>
                )}

                {!loading && sessions?.length === 0 && (
                    <p className="px-2 py-3 text-2xs text-muted-foreground">
                        Nothing here yet. Conversations are saved as you have them.
                    </p>
                )}

                {!loading &&
                    sessions?.map((s) => (
                        <DropdownMenuItem
                            key={s.id}
                            onClick={() => resume(s.id)}
                            disabled={busyId === s.id}
                            className="flex items-start gap-2"
                        >
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs">{s.title || "Untitled conversation"}</span>
                                <span className="block text-3xs text-muted-foreground">
                                    {s.message_count} message{s.message_count === 1 ? "" : "s"}
                                </span>
                            </span>
                            <button
                                type="button"
                                onClick={(e) => remove(e, s.id)}
                                aria-label={`Delete ${s.title || "conversation"}`}
                                className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        </DropdownMenuItem>
                    ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

// Gated on the AI subsystem: hidden entirely on the AI-free edition, and on the
// AI edition whenever an admin has switched AI off. Wrapping the export covers
// every render site rather than asking each one to remember.
export const ChatHistoryMenu = withAI(ChatHistoryMenuUngated)
export default ChatHistoryMenu
