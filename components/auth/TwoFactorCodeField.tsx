"use client"

import React from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils/helpers/cn"

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

interface TwoFactorCodeFieldProps {
    /** Unique per instance; two of these can be on one page. */
    id: string
    value: string
    /** Receives the NORMALISED value. */
    onChange: (value: string) => void
    /** Called when a complete authenticator code has been entered, for auto-submit. */
    onComplete?: (value: string) => void
    usingRecoveryCode: boolean
    disabled?: boolean
    /**
     * A code is being checked: the field can't be changed, but it keeps focus.
     * Use this rather than `disabled` where the cursor must come back to the
     * field after a wrong code: a browser won't focus a disabled field, and one
     * that is disabled while focused loses the focus, so the next code typed
     * went nowhere.
     */
    busy?: boolean
    /** Shown beneath the field and announced. Empty string for none. */
    error?: string
    /** Overrides the default, e.g. "Enter a code to confirm". */
    label?: string
    inputRef?: React.Ref<HTMLInputElement>
    autoFocus?: boolean
    /** Classes for the label, so a page can match its own field labels. */
    labelClassName?: string
    /** Classes for the input, so a page can match its own control height. */
    inputClassName?: string
}

export function TwoFactorCodeField({
    id,
    value,
    onChange,
    onComplete,
    usingRecoveryCode,
    disabled,
    busy,
    error = "",
    label,
    inputRef,
    autoFocus,
    labelClassName,
    inputClassName,
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
        // gap-2 between label and field, as Field and the sign-in fields have.
        <div className="space-y-2">
            <Label htmlFor={id} className={labelClassName}>
                {label ?? (usingRecoveryCode ? "Recovery code" : "6-digit code")}
            </Label>
            <Input
                id={id}
                ref={inputRef}
                value={value}
                onChange={(e) => handleChange(e.target.value)}
                disabled={disabled}
                readOnly={busy}
                aria-busy={busy || undefined}
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
                // No height class: Input defaults to h-11 md:h-8, and the 44px mobile half is a touch
                // target floor asserted by e2e/designSystem.spec.ts.
                className={cn("font-mono tracking-widest", error !== "" && "border-destructive/50", inputClassName)}
            />
            {error !== "" && (
                // role=alert so a screen reader hears the rejection. Without it the only signal is a
                // colour change, which is no signal at all.
                <p id={errorId} role="alert" className="text-xs text-danger-ink">
                    {error}
                </p>
            )}
        </div>
    )
}

interface TwoFactorCellsProps {
    id: string
    value: string
    /** Receives the NORMALISED value (digits only). */
    onChange: (value: string) => void
    /** Called once six digits are in, for auto-submit. */
    onComplete?: (value: string) => void
    /** Checking a code: the field keeps focus but can't change. */
    busy?: boolean
    error?: string
    /** Changes on each wrong code, to play the shake again. */
    invalidKey?: number
    inputRef?: React.Ref<HTMLInputElement>
    label?: string
}

/**
 * The sign-in's code as six cells (design v3, admin.md F4): 44×52, r10,
 * raised at e1, mono 22/28, 8px apart with a wider 16px gap after the third.
 *
 * ONE REAL INPUT drives them, laid invisibly over the row, so everything a
 * browser does with a code field keeps working: paste of all six digits, the
 * phone's one-time-code autofill from a message, backspace moving back (it
 * deletes the last digit of the one value), a screen reader reading one field.
 * The cells only draw what it holds: the active cell carries the halo and a
 * blinking caret, each digit pops in, a complete code sends a moss ring
 * across the row, and a wrong one rings it in danger and shakes it.
 */
export function TwoFactorCells({ id, value, onChange, onComplete, busy, error = "", invalidKey = 0, inputRef, label }: TwoFactorCellsProps) {
    const [focused, setFocused] = React.useState(false)
    const errorId = `${id}-error`
    const digits = value.split("")
    const active = Math.min(digits.length, AUTHENTICATOR_CODE_LENGTH - 1)
    // The shake plays again on each wrong code without remounting the row (which would take the
    // cursor out of the field): the animation is restarted in place.
    const rowRef = React.useRef<HTMLDivElement>(null)
    React.useEffect(() => {
        const row = rowRef.current
        if (!row || invalidKey === 0) return
        row.removeAttribute("data-shake")
        void row.offsetWidth
        row.setAttribute("data-shake", "")
    }, [invalidKey])
    const handleChange = (raw: string) => {
        const next = normaliseTwoFactorCode(raw, false)
        onChange(next)
        if (onComplete && isCompleteAuthenticatorCode(next, false)) onComplete(next)
    }
    return (
        <div className="space-y-2">
            <Label htmlFor={id} className="auth-label">
                {label ?? "6-digit code"}
            </Label>
            <div
                ref={rowRef}
                className="auth-otp"
                data-otp=""
                data-invalid={error !== "" && invalidKey > 0 ? "" : undefined}
                data-complete={busy && value.length === AUTHENTICATOR_CODE_LENGTH ? "" : undefined}
            >
                <input
                    id={id}
                    ref={inputRef}
                    value={value}
                    onChange={(e) => handleChange(e.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    readOnly={busy}
                    aria-busy={busy || undefined}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={AUTHENTICATOR_CODE_LENGTH}
                    aria-invalid={error !== "" || undefined}
                    aria-describedby={error !== "" ? errorId : undefined}
                />
                {Array.from({ length: AUTHENTICATOR_CODE_LENGTH }, (_, i) => (
                    <React.Fragment key={i}>
                        {i === 3 && <span className="auth-otp-gap" aria-hidden="true" />}
                        <span
                            className="auth-otp-cell font-mono"
                            aria-hidden="true"
                            data-otp-cell=""
                            data-active={focused && !busy && i === active ? "" : undefined}
                            style={{ "--i": i } as React.CSSProperties}
                        >
                            {digits[i] ? (
                                <span key={digits[i] + i} className="auth-otp-digit">
                                    {digits[i]}
                                </span>
                            ) : focused && !busy && i === active ? (
                                <span className="auth-otp-caret" />
                            ) : null}
                        </span>
                    </React.Fragment>
                ))}
            </div>
            {error !== "" && (
                <p id={errorId} role="alert" className="auth-field-error">
                    {error}
                </p>
            )}
        </div>
    )
}
