"use client"

import { useId, useRef, useState, type ComponentType } from "react"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTile,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { reasonOf } from "@/components/ui/saveStatus"
import { AlertCircle, AlertTriangle, Archive, Check, CircleHelp, LogOut, Power, RotateCcw, Send, Trash2, UserMinus } from "@/lib/icons"

export type ConfirmIcon = ComponentType<{ className?: string }>

/**
 * The glyph on a confirm's tile when the caller names none, read from what
 * the confirm does (design v3, admin §8 H3): a power glyph to stop or turn
 * off, user-minus to take a person out, a door to leave, a bin to delete, a
 * warning for any other loss; for a safe question, the matching glyph or a
 * question mark. Pure.
 */
export function confirmIconFor({ title, confirmText, destructive }: { title: string; confirmText?: string; destructive?: boolean }): ConfirmIcon {
    const verb = (confirmText || "").toLowerCase()
    const all = `${verb} ${title.toLowerCase()}`
    if (destructive) {
        if (/^(stop|turn off|disable|kill|shut|pause)\b/.test(verb) || /^(stop|turn off|disable)\b/.test(title.toLowerCase())) return Power
        if (/\bdeactivate\b/.test(all) || (/^(remove|kick)\b/.test(verb) && /\b(member|members|person|people|user|users|guest|guests|admin|admins|from)\b/.test(all))) return UserMinus
        if (/^(leave|sign out|log out)\b/.test(verb)) return LogOut
        if (/^(delete|discard|clear|erase|remove|revoke)\b/.test(verb)) return Trash2
        return AlertTriangle
    }
    if (/^(archive|unarchive)\b/.test(verb)) return Archive
    if (/^(restore|undo|roll back|revert)\b/.test(verb)) return RotateCcw
    if (/^(send|publish|post)\b/.test(verb)) return Send
    return CircleHelp
}

interface ConfirmAlertDialogProps {
    /** The outcome as a question, naming the thing: "Delete #design?". */
    title: string
    /** The consequence, in a sentence or two. */
    description: string
    /**
     * Runs on confirm. When it returns a promise the dialog stays open with a
     * spinner in the action until it settles: it closes when it resolves, and
     * a rejection's reason shows inside the dialog, which shakes. Otherwise
     * the dialog closes at once, as it always has.
     */
    onConfirm?: () => unknown
    confirmText?: string
    cancelText?: string
    /** The action loses something: its button is danger-solid, the tile is danger, and focus starts on Cancel. */
    destructive?: boolean
    /** The tile's glyph; a sensible one is picked from the words when absent. */
    icon?: ConfirmIcon
    /**
     * Type-to-confirm (H4): the action stays disabled until this phrase is
     * typed exactly (case-sensitive, spaces at the ends ignored).
     */
    requireText?: string
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/** Whether what was typed matches the phrase: case-sensitive, trimmed. Pure. */
export const requireTextMatches = (typed: string, phrase: string) => typed.trim() === phrase.trim()

export function ConfirmAlertDialog({
    title,
    open,
    onOpenChange,
    description,
    onConfirm,
    confirmText = "Confirm",
    cancelText = "Cancel",
    destructive = false,
    icon,
    requireText,
}: ConfirmAlertDialogProps) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")
    const [shake, setShake] = useState(false)
    const [typed, setTyped] = useState("")
    const [fieldShake, setFieldShake] = useState(false)
    const action = useRef<HTMLButtonElement>(null)
    const fieldId = useId()
    const matches = !requireText || requireTextMatches(typed, requireText)
    const Icon = icon ?? confirmIconFor({ title, confirmText, destructive })

    // Restarts a one-shot animation: off, then on next frame, then off again.
    const pulse = (set: (v: boolean) => void, ms: number) => {
        set(false)
        requestAnimationFrame(() => set(true))
        setTimeout(() => set(false), ms)
    }

    const fail = (err: unknown) => {
        setError(reasonOf(err))
        pulse(setShake, 300)
    }

    const run = async () => {
        if (!matches || busy) return
        setError("")
        let result: unknown
        try {
            result = onConfirm?.()
        } catch (err) {
            fail(err)
            return
        }
        if (result && typeof (result as PromiseLike<unknown>).then === "function") {
            setBusy(true)
            try {
                await result
                setBusy(false)
                onOpenChange(false)
            } catch (err) {
                setBusy(false)
                fail(err)
            }
            return
        }
        onOpenChange(false)
    }

    return (
        <AlertDialog
            open={open}
            onOpenChange={(next) => {
                // The dialog stays until the server answers.
                if (!next && busy) return
                onOpenChange(next)
            }}
        >
            <AlertDialogContent
                data-shake={shake ? "true" : undefined}
                aria-busy={busy || undefined}
                onOpenAutoFocus={(event) => {
                    // Cancel first on a destructive confirm (Radix's own
                    // default); the action first on a safe one.
                    if (destructive) return
                    event.preventDefault()
                    action.current?.focus({ preventScroll: true })
                }}
            >
                <AlertDialogHeader>
                    <AlertDialogTile tone={destructive ? "danger" : "neutral"} className="mb-2">
                        <Icon />
                    </AlertDialogTile>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
                </AlertDialogHeader>
                {requireText && (
                    <div className="grid gap-1.5">
                        <label htmlFor={fieldId} className="text-xs text-foreground">
                            Type <code className="rounded-sm bg-sunken px-1.5 py-0.5 font-mono text-xs ring-1 ring-inset ring-line">{requireText}</code> to confirm
                        </label>
                        <div className="v3-require-field relative" data-shake={fieldShake ? "true" : undefined}>
                            <Input
                                id={fieldId}
                                value={typed}
                                onChange={(e) => setTyped(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key !== "Enter") return
                                    e.preventDefault()
                                    if (matches) void run()
                                    else pulse(setFieldShake, 280)
                                }}
                                autoComplete="off"
                                autoCapitalize="off"
                                spellCheck={false}
                                aria-invalid={typed.trim() !== "" && !matches ? true : undefined}
                                className="pr-9"
                                disabled={busy}
                            />
                            {matches && (
                                <Check data-require-match="" aria-hidden="true" className="v3-require-check pointer-events-none absolute right-3 top-2 size-4 text-camp-moss-ink" />
                            )}
                        </div>
                    </div>
                )}
                {error && (
                    <p role="alert" className="flex items-start gap-1.5 text-xs text-danger-ink">
                        <AlertCircle aria-hidden="true" className="mt-px size-3.5 shrink-0" />
                        <span>{error}</span>
                    </p>
                )}
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={busy}>{cancelText}</AlertDialogCancel>
                    <AlertDialogAction
                        ref={action}
                        disabled={!matches}
                        aria-busy={busy || undefined}
                        data-confirm-action=""
                        onClick={(e) => {
                            // Radix closes on click unless told not to; the
                            // dialog closes itself once the action is done.
                            e.preventDefault()
                            void run()
                        }}
                        variant={destructive ? "dangerSolid" : "default"}
                    >
                        {/* Busy, the Button's own spinner turns before the label
                            (app/interaction.css): a second one here drew two. */}
                        {confirmText}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
