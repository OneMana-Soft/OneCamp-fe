"use client"

// PendingActionsTray renders the durable AI write-approval cards for one
// conversation surface (a DM group, a channel, a group chat) just above the
// composer. Because the approvals are durable and store-backed, a card here
// survives the tab that created it: close the tab mid-flow, come back later,
// and the Approve/Deny card is still waiting (reconciled on load, kept live
// over MQTT).
//
// Approving runs the action server-side, at most once, AS the current user with
// their permissions re-checked (the bot holds no standalone write privilege).

import { useEffect, useMemo, useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import { RootState } from "@/store/store"
import { Sparkles, ShieldCheck, AlertTriangle, Check, X, Loader2 } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"
import {
    getOpenPendingActions,
    approvePendingAction,
    rejectPendingAction,
    type PendingAction,
} from "@/services/pendingActionService"
import {
    setPendingActions,
    markPendingActionStatus,
    removePendingAction,
} from "@/store/slice/pendingActionSlice"

interface PendingActionsTrayProps {
    // The conversation surface to render approvals for (e.g. the DM grouping id
    // or a channel uuid). Only actions whose surface_id matches are shown.
    surfaceId: string
}

export default function PendingActionsTray({ surfaceId }: PendingActionsTrayProps) {
    const dispatch = useDispatch()
    const hydrated = useSelector((s: RootState) => s.pendingAction.hydrated)
    const allActions = useSelector((s: RootState) => s.pendingAction.actions)
    const [busy, setBusy] = useState<Record<string, boolean>>({})

    // Reconcile-on-load: hydrate the durable open approvals once. Silent (no
    // global loading bar); on error we keep the current state.
    useEffect(() => {
        if (hydrated) return
        let cancelled = false
        getOpenPendingActions()
            .then((actions) => {
                if (!cancelled) dispatch(setPendingActions(actions))
            })
            .catch(() => {
                /* keep current state on error */
            })
        return () => {
            cancelled = true
        }
    }, [hydrated, dispatch])

    const actions = useMemo(
        () => allActions.filter((a) => a.surface_id === surfaceId && a.status === "pending"),
        [allActions, surfaceId],
    )

    if (actions.length === 0) return null

    const setBusyFor = (id: string, v: boolean) => setBusy((b) => ({ ...b, [id]: v }))

    const handleApprove = async (a: PendingAction) => {
        if (busy[a.id]) return
        setBusyFor(a.id, true)
        dispatch(markPendingActionStatus({ id: a.id, status: "executing" }))
        try {
            const resolved = await approvePendingAction(a.id)
            dispatch(removePendingAction(a.id))
            if (resolved?.status === "failed") {
                toast({
                    title: "Action failed",
                    description: resolved.error || "The action could not be completed.",
                    variant: "destructive",
                })
            } else if (resolved?.status === "executed") {
                toast({ title: "Done", description: resolved.result || a.description || "Action completed." })
            } else if (resolved?.status === "expired") {
                toast({ title: "Expired", description: "This request expired before it ran.", variant: "destructive" })
            } else if (resolved && resolved.status !== "pending") {
                toast({ title: "Already handled", description: "This request was already resolved." })
            } else {
                toast({ title: "Done", description: a.description || "Action completed." })
            }
        } catch {
            // Network / unexpected error: restore the card so the user can retry.
            dispatch(markPendingActionStatus({ id: a.id, status: "pending" }))
            toast({ title: "Error", description: "Could not process the approval. Please try again.", variant: "destructive" })
        } finally {
            setBusyFor(a.id, false)
        }
    }

    const handleReject = async (a: PendingAction) => {
        if (busy[a.id]) return
        setBusyFor(a.id, true)
        try {
            await rejectPendingAction(a.id)
            dispatch(removePendingAction(a.id))
            toast({ title: "Dismissed", description: "I won't run that." })
        } catch {
            toast({ title: "Error", description: "Could not dismiss. Please try again.", variant: "destructive" })
        } finally {
            setBusyFor(a.id, false)
        }
    }

    return (
        <div className="mb-2 flex flex-col gap-2">
            {actions.map((a) => {
                const isBusy = !!busy[a.id]
                const destructive = !!a.destructive
                return (
                    <div
                        key={a.id}
                        className={
                            "rounded-xl border backdrop-blur-sm px-3.5 py-3 shadow-sm " +
                            (destructive
                                ? "border-amber-500/40 bg-amber-500/[0.06]"
                                : "border-border bg-card/80")
                        }
                    >
                        <div className="flex items-start gap-2.5">
                            <div
                                className={
                                    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full " +
                                    (destructive
                                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                        : "bg-primary/10 text-primary")
                                }
                            >
                                {destructive ? <AlertTriangle size={15} /> : <Sparkles size={15} />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div
                                    className={
                                        "flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide " +
                                        (destructive ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")
                                    }
                                >
                                    {destructive ? <AlertTriangle size={12} /> : <ShieldCheck size={12} />}
                                    {destructive ? "Destructive · approval needed" : "Approval needed"}
                                </div>
                                <p className="mt-0.5 text-sm text-foreground break-words">
                                    {a.description || a.tool_name}
                                </p>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                    {destructive
                                        ? "This is irreversible. Runs as you, with your permissions."
                                        : "Runs as you, with your permissions."}
                                </p>
                            </div>
                        </div>
                        <div className="mt-2.5 flex items-center justify-end gap-2">
                            <Button
                                size="sm"
                                variant="ghost"
                                disabled={isBusy}
                                onClick={() => handleReject(a)}
                                className="h-8 gap-1.5 text-muted-foreground"
                            >
                                <X size={15} />
                                Dismiss
                            </Button>
                            <Button
                                size="sm"
                                disabled={isBusy}
                                onClick={() => handleApprove(a)}
                                className={
                                    "h-8 gap-1.5 " +
                                    (destructive
                                        ? "bg-amber-600 text-white hover:bg-amber-700 focus-visible:ring-amber-500"
                                        : "")
                                }
                            >
                                {isBusy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                                {isBusy ? "Running..." : destructive ? "Approve anyway" : "Approve"}
                            </Button>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
