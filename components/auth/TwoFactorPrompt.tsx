"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Loader2, ShieldCheck } from "@/lib/icons"
import { TwoFactorCodeField } from "@/components/auth/TwoFactorCodeField"

/**
 * The second step of a two-factor sign-in.
 *
 * ONE FIELD FOR BOTH KINDS OF CODE. The server tries the authenticator code first and falls back to a
 * recovery code, so this does not ask the user to declare which they are holding — a person who has just
 * lost their phone should not have to find the right tab before they can get in. The toggle below only
 * changes the hint and the keyboard; either value works in either mode.
 *
 * Entry rules — digits-only, the base32 recovery alphabet, and auto-submit on the sixth digit — live in
 * TwoFactorCodeField, shared with the two settings screens that also take a code.
 */
export interface TwoFactorPromptProps {
    /** Called with whatever the user entered. Returns the failure to show, or null on success. */
    onSubmit: (code: string) => Promise<{ msg: string; expired: boolean } | null>
    /** Returns to the password step, for an expired challenge or a change of mind. */
    onCancel: () => void
    /** Shown above the field, from the server, e.g. "Enter the code from your authenticator app." */
    prompt?: string
}

export function TwoFactorPrompt({ onSubmit, onCancel, prompt }: TwoFactorPromptProps) {
    const [code, setCode] = useState("")
    const [usingRecoveryCode, setUsingRecoveryCode] = useState(false)
    const [error, setError] = useState("")
    const [expired, setExpired] = useState(false)
    const [busy, setBusy] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    // Focused on mount and whenever the mode changes. The user's hands are already on the keyboard
    // having just typed a password; making them click into the next field is friction with no purpose.
    useEffect(() => {
        inputRef.current?.focus()
    }, [usingRecoveryCode])

    const submit = useCallback(
        async (value: string) => {
            const trimmed = value.trim()
            if (trimmed === "" || busy) return

            setBusy(true)
            setError("")
            try {
                const failure = await onSubmit(trimmed)
                if (failure) {
                    setError(failure.msg)
                    setExpired(failure.expired)
                    // Cleared so the next attempt starts empty. Leaving a rejected code in the field
                    // invites editing one character of something already wrong, and the auto-submit
                    // would then fire on a value the user was still working on.
                    setCode("")
                    inputRef.current?.focus()
                }
            } finally {
                setBusy(false)
            }
        },
        [busy, onSubmit],
    )

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault()
                void submit(code)
            }}
            className="space-y-4"
        >
            <div className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="space-y-1">
                    <p className="text-sm font-medium">Two-step verification</p>
                    <p className="text-xs text-muted-foreground">
                        {prompt || "Enter the code from your authenticator app."}
                    </p>
                </div>
            </div>

            <TwoFactorCodeField
                id="totp-code"
                value={code}
                onChange={(next) => {
                    setError("")
                    setCode(next)
                }}
                // Guarded on `busy` inside submit(), so a fast paste followed by a keystroke cannot
                // fire the request twice.
                onComplete={(next) => void submit(next)}
                usingRecoveryCode={usingRecoveryCode}
                disabled={busy}
                error={error}
                inputRef={inputRef}
            />

            {/*
                An expired challenge cannot be recovered from in this screen — the password step has to
                happen again — so the primary action changes to the one that actually helps. Leaving
                "Verify" as the main button would invite the user to keep submitting codes against a
                challenge the server has already forgotten.

                h-11 md:h-10 matches the "Sign In" button this screen replaces, so the primary action
                does not change size when the second step appears.
            */}
            {expired ? (
                <Button type="button" onClick={onCancel} className="w-full h-11 md:h-10">
                    Start again
                </Button>
            ) : (
                <Button
                    type="submit"
                    disabled={busy || code.trim() === ""}
                    className="w-full h-11 md:h-10 gap-2"
                >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    {busy ? "Verifying…" : "Verify"}
                </Button>
            )}

            {/* Same treatment as the "Forgot password?" link on the step before this one. */}
            <div className="flex items-center justify-between text-sm">
                <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => {
                        setUsingRecoveryCode((v) => !v)
                        setCode("")
                        setError("")
                    }}
                >
                    {usingRecoveryCode ? "Use your authenticator app" : "Use a recovery code"}
                </button>
                <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    onClick={onCancel}
                >
                    Back to sign in
                </button>
            </div>
        </form>
    )
}
