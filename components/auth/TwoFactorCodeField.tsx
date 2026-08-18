"use client"

import React from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * The one code field, used everywhere a second factor is typed.
 *
 * There are three such places — completing a sign-in, confirming an enrolment, and turning the factor
 * off — and the entry rules are identical in all of them, because they are set by the code formats
 * rather than by the screen. Keeping one implementation is why the recovery-code alphabet is right in
 * all three rather than in whichever one was written last.
 */

/** Length of an authenticator code. Six is fixed by the enrolment URI's `digits` parameter. */
export const AUTHENTICATOR_CODE_LENGTH = 6

/**
 * Display length of a recovery code: ten base32 characters plus the grouping hyphen.
 * Mirrors models/postgres/User.NewRecoveryCode, which emits `XXXXX-XXXXX`.
 */
const RECOVERY_CODE_MAX_LENGTH = 11

/**
 * Base32 as the server generates it — A–Z and 2–7 — plus the hyphen it groups with.
 *
 * The excluded characters are the point: that alphabet has no 0/O and no 1/I/l pair, which is why it
 * was chosen for something read off paper and typed. Filtering to it means a transcription slip is
 * rejected at the keystroke instead of coming back as "invalid code" after a round trip.
 */
const RECOVERY_CODE_CHARS = /[^A-Z2-7-]/g

/**
 * Cleans what the user typed into what the server will accept.
 *
 * Exported and tested directly, because it is the part that can be wrong in a way no amount of clicking
 * through the UI reliably reveals.
 *
 * @param raw the field's current value, as typed or pasted
 * @param usingRecoveryCode which format to normalise for
 */
export function normaliseTwoFactorCode(raw: string, usingRecoveryCode: boolean): string {
    if (usingRecoveryCode) {
        // Uppercased as typed so the field matches the card being read from. The server normalises
        // again — stripping spaces and hyphens before hashing — so a paste with either still matches.
        return raw.toUpperCase().replace(RECOVERY_CODE_CHARS, "").slice(0, RECOVERY_CODE_MAX_LENGTH)
    }
    // Digits only, so a pasted "123 456" or "code: 123456" resolves to something enterable rather than
    // being rejected for containing what the user was sent.
    return raw.replace(/\D/g, "").slice(0, AUTHENTICATOR_CODE_LENGTH)
}

/** True when `value` is a complete authenticator code and can be submitted without being asked. */
export function isCompleteAuthenticatorCode(value: string, usingRecoveryCode: boolean): boolean {
    // Never true for recovery codes. Those are long, typed from paper, and submitting on a length
    // match would fire mid-word — the user would watch their own typing get rejected.
    return !usingRecoveryCode && value.length === AUTHENTICATOR_CODE_LENGTH
}

export interface TwoFactorCodeFieldProps {
    /** Unique per instance; two of these can be on one page. */
    id: string
    value: string
    /** Receives the NORMALISED value. */
    onChange: (value: string) => void
    /** Called when a complete authenticator code has been entered, for auto-submit. */
    onComplete?: (value: string) => void
    usingRecoveryCode: boolean
    disabled?: boolean
    /** Shown beneath the field and announced. Empty string for none. */
    error?: string
    /** Overrides the default, e.g. "Enter a code to confirm". */
    label?: string
    inputRef?: React.Ref<HTMLInputElement>
    autoFocus?: boolean
}

export function TwoFactorCodeField({
    id,
    value,
    onChange,
    onComplete,
    usingRecoveryCode,
    disabled,
    error = "",
    label,
    inputRef,
    autoFocus,
}: TwoFactorCodeFieldProps) {
    const errorId = `${id}-error`

    const handleChange = (raw: string) => {
        const next = normaliseTwoFactorCode(raw, usingRecoveryCode)
        onChange(next)
        if (onComplete && isCompleteAuthenticatorCode(next, usingRecoveryCode)) {
            onComplete(next)
        }
    }

    return (
        <div className="space-y-1.5">
            <Label htmlFor={id} className="text-xs">
                {label ?? (usingRecoveryCode ? "Recovery code" : "6-digit code")}
            </Label>
            <Input
                id={id}
                ref={inputRef}
                value={value}
                onChange={(e) => handleChange(e.target.value)}
                disabled={disabled}
                // Numeric on mobile for digits, text for recovery codes: a hyphen is unreachable on a
                // numeric keypad, which would make recovery unusable on a phone — the exact device
                // situation recovery codes exist for.
                inputMode={usingRecoveryCode ? "text" : "numeric"}
                // one-time-code lets a phone offer the SMS/authenticator code from the notification
                // shade. Off for recovery codes, which no autofill source has.
                autoComplete={usingRecoveryCode ? "off" : "one-time-code"}
                placeholder={usingRecoveryCode ? "XXXXX-XXXXX" : "000000"}
                aria-invalid={error !== "" || undefined}
                aria-describedby={error !== "" ? errorId : undefined}
                autoFocus={autoFocus}
                // No height class: Input defaults to h-11 md:h-9, and the 44px mobile half is a touch
                // target floor asserted by e2e/designSystem.spec.ts.
                className={`font-mono tracking-widest ${error !== "" ? "border-destructive/50" : ""}`}
            />
            {error !== "" && (
                // role=alert so a screen reader hears the rejection. Without it the only signal is a
                // colour change, which is no signal at all.
                <p id={errorId} role="alert" className="text-xs text-destructive">
                    {error}
                </p>
            )}
        </div>
    )
}
