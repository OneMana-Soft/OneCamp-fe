"use client"

// useCommandRunner wires the chat composer's slash-command experience:
//   1. registers the backend command provider so the "/" menu shows scoped
//      app/core commands (merged with formatting commands),
//   2. listens for the `chat-slash-command` event the menu dispatches,
//      executes the command server-side, and routes the response, and
//   3. handles client actions (open search, set status, post message, ...)
//      and interactive Block Kit cards (execute → ephemeral card → interact).
//
// It is scoped to a single conversation surface (channel uuid or dm grouping
// id) so each open conversation shows only its own command output.

import { useCallback, useEffect, useRef } from "react"
import { useDispatch } from "react-redux"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { useToast } from "@/hooks/use-toast"
import {
    executeCommand,
    fetchCommandCatalog,
    interactCommand,
    newTriggerID,
} from "@/services/commandService"
import {
    setBackendCommandProvider,
    type BackendCommandEntry,
} from "@/components/minimal-tiptap/extensions/slash-command/slashCommand"
import { upsertCard, dismissCard } from "@/store/slice/commandSlice"
import type {
    BlockElement,
    CatalogCommand,
    ClientAction,
    CommandResponse,
} from "@/types/command"

export interface CommandSurfaceContext {
    surfaceKey: string          // channel uuid or dm grouping id
    channelId?: string
    dmGroupId?: string
    threadTs?: string
    // postMessage lets a command like /shrug or /me inject content into the
    // composer / send a message using the surface's own send path.
    onComposerText?: (text: string) => void
    onComposerHtml?: (html: string) => void
}

const TIMEZONE = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC"

export function useCommandRunner(ctx: CommandSurfaceContext) {
    const dispatch = useDispatch()
    const router = useRouter()
    const { toast } = useToast()

    // Catalog: fetched once per channel mount, cached by SWR. The backend
    // also caches per-user, so this is cheap. We filter client-side as the
    // user types to keep the typeahead instant.
    const { data: catalog } = useSWR(
        ["command-catalog", ctx.channelId || "global"],
        () => fetchCommandCatalog(ctx.channelId),
        { revalidateOnFocus: false, dedupingInterval: 60_000 },
    )

    const catalogRef = useRef<CatalogCommand[]>([])
    useEffect(() => {
        catalogRef.current = catalog?.commands || []
    }, [catalog])

    // Register the provider that feeds the "/" menu. We register on mount and
    // clear on unmount so docs (which never mount this) keep formatting-only.
    useEffect(() => {
        const provider = (query: string): BackendCommandEntry[] => {
            const all = catalogRef.current
            if (!query) return all.slice(0, 10)
            const q = query.toLowerCase()
            return all
                .filter(
                    (c) =>
                        c.command.toLowerCase().includes(q) ||
                        c.description.toLowerCase().includes(q),
                )
                .slice(0, 10)
        }
        setBackendCommandProvider(provider)
        return () => setBackendCommandProvider(null)
    }, [])

    // Mentions captured from the composer at command time, keyed by lowercased
    // label → user UUID. Lets /dm @Akash use the EXACT user the picker chose
    // (the mention node's data-id) instead of fuzzy-matching the display name.
    const mentionsRef = useRef<Record<string, string>>({})

    // applyClientAction performs FE-side directives.
    const applyClientAction = useCallback(
        (action: ClientAction) => {
            const p = action.payload || {}
            switch (action.type) {
                case "open_search":
                    window.dispatchEvent(new CustomEvent("open-search", { detail: { query: p.query || "" } }))
                    break
                case "open_shortcuts":
                    window.dispatchEvent(new CustomEvent("open-shortcuts-modal"))
                    break
                case "open_apps":
                    window.dispatchEvent(new CustomEvent("open-apps", { detail: p }))
                    break
                // The CommandActionBridge owns all execution + user feedback
                // (toasts) for these directives, so we only re-broadcast the
                // event here and let the bridge confirm. This keeps a single
                // source of truth and avoids double toasts.
                case "set_presence":
                    window.dispatchEvent(
                        new CustomEvent("set-presence", { detail: { presence: p.presence } }),
                    )
                    break
                case "set_status":
                    window.dispatchEvent(new CustomEvent("set-status", { detail: p }))
                    break
                case "open_status_picker":
                    window.dispatchEvent(new CustomEvent("open-status-picker"))
                    break
                case "set_dnd":
                    window.dispatchEvent(new CustomEvent("set-dnd", { detail: p }))
                    break
                case "open_dm": {
                    // If the composer captured a mention UUID for this target,
                    // forward it so the bridge sends to the exact user instead
                    // of fuzzy-matching the display name.
                    const key = String(p.target || "").trim().toLowerCase().replace(/^@/, "")
                    const uuid = key ? mentionsRef.current[key] : ""
                    window.dispatchEvent(
                        new CustomEvent("open-dm-with", { detail: { ...p, target_uuid: uuid || undefined } }),
                    )
                    break
                }
                case "open_channel":
                    window.dispatchEvent(new CustomEvent("open-channel-by-name", { detail: p }))
                    break
                case "toggle_media":
                    window.dispatchEvent(
                        new CustomEvent("toggle-media-collapsed", {
                            detail: { collapsed: p.collapsed === "true" },
                        }),
                    )
                    break
                case "post_message":
                    if (p.html && ctx.onComposerHtml) ctx.onComposerHtml(p.html)
                    else if (p.text && ctx.onComposerText) ctx.onComposerText(p.text)
                    break
                case "navigate":
                    if (p.href) router.push(p.href)
                    break
                default:
                    break
            }
        },
        [router, toast, ctx],
    )

    // route a response: client action, ephemeral/interactive card, or toast.
    const routeResponse = useCallback(
        (resp: CommandResponse, triggerId: string, command: string) => {
            if (!resp) return
            // Warm the browser cache for any preload URLs (e.g. the full Giphy
            // result set) so an interactive Shuffle swaps to an already-loaded
            // image instantly instead of downloading on each click.
            if (resp.preload_urls && resp.preload_urls.length > 0 && typeof window !== "undefined") {
                for (const u of resp.preload_urls.slice(0, 20)) {
                    const img = new window.Image()
                    img.src = u
                }
            }
            if (resp.client_action) {
                applyClientAction(resp.client_action)
                return
            }
            if ((resp.blocks && resp.blocks.length > 0) || resp.text) {
                dispatch(
                    upsertCard({
                        trigger_id: resp.trigger_id || triggerId,
                        surface_key: ctx.surfaceKey,
                        command,
                        response: resp,
                        created_at: Date.now(),
                    }),
                )
            }
        },
        [applyClientAction, dispatch, ctx.surfaceKey],
    )

    // Execute a command. `typed` is the full text the user typed after "/".
    const runCommand = useCallback(
        async (command: string, typed: string, mentions?: Record<string, string>) => {
            const triggerId = newTriggerID()
            // Remember the mention→uuid map for this invocation so client
            // actions (open_dm) can resolve the exact user the picker chose.
            mentionsRef.current = mentions || {}
            // Strip the leading "/command " to get the args text.
            const argsText = typed.replace(/^\/?\S+\s*/, "")
            try {
                const resp = await executeCommand({
                    command,
                    text: argsText,
                    channel_id: ctx.channelId,
                    dm_group_id: ctx.dmGroupId,
                    thread_ts: ctx.threadTs,
                    timezone: TIMEZONE,
                    trigger_id: triggerId,
                })
                routeResponse(resp, triggerId, command)
            } catch {
                toast({
                    variant: "destructive",
                    title: "Command failed",
                    description: `Couldn't run /${command}.`,
                })
            }
        },
        [ctx, routeResponse, toast],
    )

    // Listen for the menu's dispatched event.
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail as {
                command: string
                typed: string
                mentions?: Record<string, string>
            }
            if (!detail?.command) return
            void runCommand(detail.command, detail.typed || "", detail.mentions)
        }
        window.addEventListener("chat-slash-command", handler)
        return () => window.removeEventListener("chat-slash-command", handler)
    }, [runCommand])

    // Handle a Block Kit button/select click on a card.
    const handleInteract = useCallback(
        async (triggerId: string, command: string, el: BlockElement) => {
            try {
                const resp = await interactCommand({
                    trigger_id: triggerId,
                    action_id: el.action_id,
                    value: el.value,
                    command,
                    channel_id: ctx.channelId,
                    dm_group_id: ctx.dmGroupId,
                })
                routeResponse(resp, triggerId, command)
            } catch {
                toast({ variant: "destructive", title: "Action failed" })
            }
        },
        [ctx, routeResponse, toast],
    )

    const dismiss = useCallback(
        (triggerId: string) => {
            dispatch(dismissCard({ surface_key: ctx.surfaceKey, trigger_id: triggerId }))
        },
        [dispatch, ctx.surfaceKey],
    )

    return { runCommand, handleInteract, dismiss }
}
