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
import { useAppRouter } from "@/lib/navigation/appRouter"
import { useToast } from "@/hooks/use-toast"
import {
    executeCommand,
    interactCommand,
    newTriggerID,
} from "@/services/commandService"
import { COMMAND_POST, type CommandPost } from "@/components/minimal-tiptap/extensions/slash-command/slashCommand"
import { setBackendCommandProvider, type BackendCommandEntry } from "@/components/command/commandItems"
import { upsertCard, dismissCard } from "@/store/slice/commandSlice"
import type {
    BlockElement,
    ClientAction,
    CommandResponse,
} from "@/types/command"
import { browserTZ } from "@/lib/utils/timeZone"
import { executeRequest } from "@/lib/command/executeRequest"
import { escapeText } from "@/lib/codec/htmlEscape"
import { useCommandCatalog } from "@/components/command/useCommandCatalog"

export interface CommandSurfaceContext {
    surfaceKey: string          // channel uuid or dm grouping id
    channelId?: string
    dmGroupId?: string
    threadTs?: string
}

export function useCommandRunner(ctx: CommandSurfaceContext) {
    const dispatch = useDispatch()
    const router = useAppRouter()
    const { toast } = useToast()

    // The catalog, filtered client-side as the person types to keep the
    // typeahead instant. Registered for this surface only, once it has
    // commands, so an open "/" menu takes them in when they come; taken back on
    // unmount, so docs (which never mount this) keep formatting-only. Registered
    // empty, it had the menu say "Commands" over formatting alone while they
    // were on their way, and for good when they couldn't be read.
    const catalog = useCommandCatalog(ctx.channelId)
    useEffect(() => {
        const all = catalog?.commands
        if (!all?.length) return
        // Apps first. With nothing typed, ten at most, but never at an app's
        // expense: built-ins come first in the catalog, and ten of them filled
        // "/" before any installed app's command, which showed only once its
        // name was typed. For a typed query the menu ranks every command by
        // how well it answers (slashScore), apps first only among equals: an
        // app's description holding the letters put /zoom above "/me".
        const apps = all.filter((c) => !c.is_builtin)
        const appsFirst = [...apps, ...all.filter((c) => c.is_builtin)]
        const provider = (query: string): BackendCommandEntry[] =>
            query ? appsFirst : appsFirst.slice(0, Math.max(10, apps.length))
        return setBackendCommandProvider(provider, ctx.surfaceKey)
    }, [catalog, ctx.surfaceKey])

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
                case "post_message": {
                    // A message from the person (Giphy's Send, /shrug, /me): it
                    // goes out from this surface's own message box.
                    const html = p.html || (p.text ? `<p>${escapeText(p.text)}</p>` : "")
                    if (!html) break
                    const post: CommandPost = { surface: ctx.surfaceKey, html, taken: false }
                    window.dispatchEvent(new CustomEvent(COMMAND_POST, { detail: post }))
                    if (!post.taken) {
                        toast({ variant: "destructive", title: "Couldn't post that", description: "Open the conversation's message box, then try again." })
                    }
                    break
                }
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
                // An answer that replaces its card with an action alone (Giphy's
                // Send) leaves nothing to show: the card goes.
                if (resp.replace_original) {
                    dispatch(dismissCard({ surface_key: ctx.surfaceKey, trigger_id: resp.trigger_id || triggerId }))
                }
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
            try {
                // The people picked go too: the text shows only their names.
                const resp = await executeCommand(
                    executeRequest(command, typed, ctx, browserTZ(), triggerId, mentions),
                )
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
                surface?: string | null
            }
            if (!detail?.command) return
            // Only the conversation whose composer sent it, once: every
            // runner on screen ran each command, so with two conversations
            // side by side /poll posted in both (FE-BUG-11). The same
            // conversation open twice runs it in the first.
            if (detail.surface !== ctx.surfaceKey) return
            e.stopImmediatePropagation()
            void runCommand(detail.command, detail.typed || "", detail.mentions)
        }
        window.addEventListener("chat-slash-command", handler)
        return () => window.removeEventListener("chat-slash-command", handler)
    }, [runCommand, ctx.surfaceKey])

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
