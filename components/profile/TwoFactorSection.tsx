"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { QRCodeSVG } from "qrcode.react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SettingsCardError, SettingsRowsSkeleton } from "@/components/ui/settingsSection"
import {
    AlertTriangle,
    Check,
    Copy,
    Download,
    LoaderCircle,
    ShieldCheck,
} from "@/lib/icons"
import { TwoFactorCodeField } from "@/components/auth/TwoFactorCodeField"
import { downloadTextFile } from "@/lib/utils/file/downloadTextFile"
import TwoFactorService, { type TwoFactorStatus } from "@/services/twoFactorService"

/**
 * Turning two-step verification on and off, in profile settings.
 *
 * Sits beside ChangePasswordSection and copies its shell deliberately: both are "your account security",
 * and a second card with its own visual language would read as belonging to a different product.
 *
 * The screen is a small state machine rather than a set of independent booleans, because the states are
 * genuinely exclusive and several pairs are actively harmful together. Showing an enrolment QR next to a
 * "turn off" button, or leaving recovery codes on screen after moving on, are both reachable by accident
 * from a pile of flags and unreachable from one `view`.
 */
type View =
    /** Collapsed. The only state that renders when nothing is happening. */
    | { name: "summary" }
    /** Scanning a QR (step 1), then entering the first code (step 2). Nothing is enforced yet. */
    | { name: "enrolling"; secret: string; uri: string; step: 1 | 2 }
    /** The one and only showing of the recovery codes. */
    | { name: "codes"; codes: string[] }
    /** Confirming a code in order to turn the factor off. */
    | { name: "disabling" }

/** How few remaining recovery codes is worth warning about. */
const LOW_RECOVERY_CODE_THRESHOLD = 3

export function TwoFactorSection() {
    // null while it is checked, "failed" when it couldn't be.
    const [status, setStatus] = useState<TwoFactorStatus | null | "failed">(null)
    const [view, setView] = useState<View>({ name: "summary" })
    const [code, setCode] = useState("")
    const [usingRecoveryCode, setUsingRecoveryCode] = useState(false)
    const [error, setError] = useState("")
    /** Set only for conditions the USER cannot act on, so they get different words and no code field. */
    const [operatorError, setOperatorError] = useState("")
    const [notice, setNotice] = useState("")
    const [busy, setBusy] = useState(false)
    const [copied, setCopied] = useState(false)
    const [savedAcknowledged, setSavedAcknowledged] = useState(false)
    // The code field, for putting the cursor back in it after a refused code.
    const codeRef = useRef<HTMLInputElement>(null)

    /**
     * The first read, and Try again. A failed read says that the check failed, with a retry: never
     * "Off", which in a security panel reads as "your account is unprotected", and no longer nothing
     * at all, which hid the setting from someone who had come to change it.
     */
    const load = useCallback(async () => {
        setStatus(null)
        const result = await TwoFactorService.getStatus()
        setStatus(result.ok ? result.data : "failed")
    }, [])

    /** After a change: a failed re-read keeps what was on screen rather than replacing it. */
    const refreshStatus = useCallback(async () => {
        const result = await TwoFactorService.getStatus()
        if (result.ok) setStatus(result.data)
    }, [])

    useEffect(() => {
        void load()
    }, [load])

    const resetEntry = () => {
        setCode("")
        setUsingRecoveryCode(false)
        setError("")
        setOperatorError("")
    }

    const backToSummary = () => {
        setView({ name: "summary" })
        setSavedAcknowledged(false)
        setCopied(false)
        resetEntry()
    }

    const beginSetup = async () => {
        setBusy(true)
        resetEntry()
        setNotice("")
        try {
            const result = await TwoFactorService.beginSetup()
            if (result.ok) {
                setView({ name: "enrolling", secret: result.data.secret, uri: result.data.uri, step: 1 })
                return
            }
            // TOTP_KEK is an operator condition. The person clicking "Turn on" can do nothing about it,
            // so it is reported as a server-side gap rather than as something they got wrong.
            if (result.code === "totp_kek_missing") {
                setOperatorError(result.msg)
                return
            }
            setError(result.msg)
        } finally {
            setBusy(false)
        }
    }

    const confirmSetup = async (value: string) => {
        const entered = value.trim()
        if (entered === "" || busy) return
        setBusy(true)
        setError("")
        try {
            const result = await TwoFactorService.confirmSetup(entered)
            if (result.ok) {
                // Straight to the codes. This response is the ONLY time they exist in plain text, so
                // nothing may sit between here and showing them.
                setView({ name: "codes", codes: result.data })
                setCode("")
                await refreshStatus()
                return
            }
            setError(result.msg)
            setCode("")
            codeRef.current?.focus()
        } finally {
            setBusy(false)
        }
    }

    const disable = async (value: string) => {
        const entered = value.trim()
        if (entered === "" || busy) return
        setBusy(true)
        setError("")
        try {
            const result = await TwoFactorService.disable(entered)
            if (result.ok) {
                setNotice("Two-step verification is off.")
                await refreshStatus()
                backToSummary()
                return
            }
            setError(result.msg)
            setCode("")
            // Back to the field for the next code: Turn off was pressed, so the
            // focus is on the button.
            codeRef.current?.focus()
        } finally {
            setBusy(false)
        }
    }

    const recoveryCodesText = (codes: string[]) =>
        // Plain lines, no header. This gets pasted into a password manager note, where a preamble is
        // noise the user has to delete.
        codes.join("\n")

    const copyCodes = async (codes: string[]) => {
        try {
            await navigator.clipboard.writeText(recoveryCodesText(codes))
            setCopied(true)
            window.setTimeout(() => setCopied(false), 2000)
        } catch {
            // Clipboard is permission-gated and absent over plain HTTP. The codes are already on screen
            // and selectable, so this is a convenience failing, not a loss — say so and move on.
            setError("Couldn't copy. Select the codes and copy them yourself.")
        }
    }

    const downloadCodes = (codes: string[]) => {
        // Shared helper rather than a local anchor, because getting this wrong is invisible in Chrome:
        // a detached anchor's click() is ignored by Firefox, and revoking the object URL immediately
        // races the download. Either fault means the button appears to work and no file arrives —
        // for the one artefact in this product that cannot be re-issued.
        if (!downloadTextFile("onecamp-recovery-codes.txt", recoveryCodesText(codes))) {
            setError("Couldn't download. Copy the codes instead.")
        }
    }

    // The row keeps its place while it is checked, so the rows under it do not jump.
    if (status === null) {
        return (
            <div role="status" aria-label="Checking two-step verification" className="contents">
                <SettingsRowsSkeleton rows={1} control="button" />
            </div>
        )
    }

    if (status === "failed") return <SettingsCardError title="Couldn't check two-step verification" onRetry={() => void load()} />

    const enrolled = status.enrolled
    const lowOnCodes = enrolled && status.unusedRecoveryCodes <= LOW_RECOVERY_CODE_THRESHOLD
    const left = `${status.unusedRecoveryCodes} recovery ${status.unusedRecoveryCodes === 1 ? "code" : "codes"} left`

    // Closing the dialog: never while the codes are on screen (only Done, once
    // they are saved, leaves that step), otherwise back to the row.
    const onDialogChange = (open: boolean) => {
        if (open || view.name === "codes") return
        backToSummary()
    }

    const step = view.name === "enrolling" ? view.step : view.name === "codes" ? 3 : 0

    return (
        <div data-setting-row="" className="set-row space-y-3">
            <div className="flex items-center justify-between gap-6">
                <div className="min-w-0">
                    <h3 className="text-sm font-medium leading-5">Two-step verification</h3>
                    {enrolled ? (
                        <p data-two-factor="on" className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            <ShieldCheck className="size-3.5 text-success-ink" aria-hidden="true" />
                            <span className="font-medium text-foreground">On · authenticator app</span>
                            <span aria-hidden="true">·</span>
                            <span>{left}</span>
                        </p>
                    ) : (
                        <p data-two-factor="off" className="text-xs text-muted-foreground text-pretty">
                            Off. Turn it on to need a code from your phone as well as your password.
                        </p>
                    )}
                </div>
                <Button
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                    disabled={busy && view.name === "summary"}
                    onClick={() => {
                        setNotice("")
                        if (enrolled) {
                            resetEntry()
                            setView({ name: "disabling" })
                        } else {
                            void beginSetup()
                        }
                    }}
                >
                    {busy && view.name === "summary" && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                    {enrolled ? "Turn off" : "Turn on"}
                </Button>
            </div>

            {notice !== "" && view.name === "summary" && (
                <p role="status" className="flex items-center gap-1.5 text-xs text-success-ink">
                    <Check className="size-3.5" aria-hidden="true" />
                    {notice}
                </p>
            )}

            {/* Shown in the summary, not buried in the enrolment flow: a user who is low on codes has
                nothing to do here yet, but they should know before the day it matters. */}
            {lowOnCodes && view.name === "summary" && (
                <div className="you-note">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-ink" aria-hidden="true" />
                    <p className="text-xs text-muted-foreground text-pretty">
                        {status.unusedRecoveryCodes === 0
                            ? "You have no recovery codes left. If you lose your authenticator app you will need an administrator to reset this. Turn two-step verification off and on again to get a new set."
                            : "You are running low on recovery codes. Turn two-step verification off and on again to get a new set."}
                    </p>
                </div>
            )}

            {operatorError !== "" && (
                <div role="alert" className="you-note">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger-ink" aria-hidden="true" />
                    <div className="space-y-0.5">
                        <p className="text-xs font-medium">Two-step verification is not configured on this server</p>
                        <p className="text-xs text-muted-foreground">{operatorError}</p>
                    </div>
                </div>
            )}

            {view.name === "summary" && error !== "" && <p role="alert" className="text-xs text-danger-ink">{error}</p>}

            <Dialog open={view.name !== "summary"} onOpenChange={onDialogChange}>
                <DialogContent className="sm:max-w-md">
                    {view.name === "disabling" ? (
                        <>
                            <DialogHeader>
                                <DialogTitle>Turn off two-step verification?</DialogTitle>
                                <DialogDescription>
                                    Enter a current code to turn this off. Removing your second factor is the first thing
                                    someone with a stolen session would try, so it has to be proved.
                                </DialogDescription>
                            </DialogHeader>
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault()
                                    void disable(code)
                                }}
                                className="space-y-3"
                            >
                                <TwoFactorCodeField
                                    id="totp-disable-code"
                                    value={code}
                                    onChange={(next) => {
                                        setError("")
                                        setCode(next)
                                    }}
                                    // No auto-submit here. Turning protection OFF should take a
                                    // deliberate press rather than completing itself on the sixth digit.
                                    usingRecoveryCode={usingRecoveryCode}
                                    busy={busy}
                                    inputRef={codeRef}
                                    error={error}
                                    autoFocus
                                />
                                <button
                                    type="button"
                                    className="rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                                    onClick={() => {
                                        setUsingRecoveryCode((v) => !v)
                                        setCode("")
                                        setError("")
                                    }}
                                >
                                    {usingRecoveryCode ? "Use your authenticator app" : "Use a recovery code"}
                                </button>
                                <div className="flex justify-end gap-2 pt-1">
                                    <Button type="button" variant="ghost" onClick={backToSummary}>
                                        Cancel
                                    </Button>
                                    <Button type="submit" variant="destructive" disabled={busy || code.trim() === ""}>
                                        {busy && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                                        Turn off two-step verification
                                    </Button>
                                </div>
                            </form>
                        </>
                    ) : view.name !== "summary" ? (
                        <>
                            <DialogHeader>
                                <p data-step={step} className="text-2xs font-medium text-ink-3">Step {step} of 3</p>
                                <DialogTitle>
                                    {step === 1 ? "Scan this code" : step === 2 ? "Enter the code it shows" : "Save your recovery codes"}
                                </DialogTitle>
                                <DialogDescription>
                                    {step === 1
                                        ? "Open an authenticator app on your phone and scan the code."
                                        : step === 2
                                          ? "Type the 6-digit code from your authenticator app to finish."
                                          : "These are shown once and can't be shown again. Each one works a single time, in place of your authenticator app."}
                                </DialogDescription>
                            </DialogHeader>
                            <ol aria-hidden="true" className="grid grid-cols-3 gap-1">
                                {[1, 2, 3].map((i) => (
                                    <li key={i} className={i <= step ? "h-1 rounded-sm bg-brand" : "h-1 rounded-sm bg-press"} />
                                ))}
                            </ol>

                            {view.name === "enrolling" && view.step === 1 && (
                                <div className="space-y-4">
                                    {/*
                                        EXPLICIT WHITE BACKGROUND AND DARK MODULES, not theme colours, in dark too.
                                        A QR code is read by a camera, not by a person, and it needs light
                                        quiet-zone contrast to resolve.
                                    */}
                                    <div data-qr-tile="" className="you-qr">
                                        <QRCodeSVG value={view.uri} size={144} bgColor="#ffffff" fgColor="#000000" level="M" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground">Can&apos;t scan? Enter this key instead:</p>
                                        {/* break-all so a 32-character key does not push the dialog wide on a phone. */}
                                        <code className="block break-all rounded-md bg-sunken px-2.5 py-1.5 font-mono text-2xs">{view.secret}</code>
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <Button type="button" variant="ghost" onClick={backToSummary}>
                                            Cancel
                                        </Button>
                                        <Button type="button" onClick={() => setView({ ...view, step: 2 })}>
                                            Next
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {view.name === "enrolling" && view.step === 2 && (
                                <form
                                    onSubmit={(e) => {
                                        e.preventDefault()
                                        void confirmSetup(code)
                                    }}
                                    className="space-y-4"
                                >
                                    <TwoFactorCodeField
                                        id="totp-enrol-code"
                                        value={code}
                                        onChange={(next) => {
                                            setError("")
                                            setCode(next)
                                        }}
                                        onComplete={(next) => void confirmSetup(next)}
                                        // Enrolment proves possession of the NEW secret, so only an authenticator code
                                        // can do it. No recovery codes exist yet: they are issued by this step.
                                        usingRecoveryCode={false}
                                        // Busy, not disabled, while the code is checked: a browser drops the focus
                                        // of a field that becomes disabled and won't give it back.
                                        busy={busy}
                                        inputRef={codeRef}
                                        error={error}
                                        label="Enter the 6-digit code to finish"
                                        autoFocus
                                    />
                                    <div className="flex justify-end gap-2">
                                        <Button type="button" variant="ghost" onClick={() => setView({ ...view, step: 1 })}>
                                            Back
                                        </Button>
                                        <Button type="submit" disabled={code.trim() === ""} busy={busy}>
                                            Turn on two-step verification
                                        </Button>
                                    </div>
                                </form>
                            )}

                            {view.name === "codes" && (
                                <div className="space-y-3">
                                    <div data-recovery-codes="" className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg bg-sunken p-3 font-mono text-xs">
                                        {view.codes.map((c) => (
                                            <span key={c} className="select-all">
                                                {c}
                                            </span>
                                        ))}
                                    </div>
                                    {error !== "" && <p role="alert" className="text-xs text-danger-ink">{error}</p>}
                                    <div className="flex flex-wrap gap-2">
                                        <Button type="button" variant="secondary" size="sm" onClick={() => void copyCodes(view.codes)}>
                                            {copied ? <Check className="size-3.5 text-success-ink" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
                                            {copied ? "Copied" : "Copy"}
                                        </Button>
                                        <Button type="button" variant="secondary" size="sm" onClick={() => downloadCodes(view.codes)}>
                                            <Download className="size-3.5" aria-hidden="true" />
                                            Download
                                        </Button>
                                    </div>
                                    {/*
                                        An explicit acknowledgement, and the only way out of this step. A plain "Done"
                                        is pressed reflexively; a checkbox that gates it makes the person answer the
                                        question. The codes cannot be shown again.
                                    */}
                                    <label className="flex items-start gap-2 text-xs">
                                        <input
                                            type="checkbox"
                                            checked={savedAcknowledged}
                                            onChange={(e) => setSavedAcknowledged(e.target.checked)}
                                            className="mt-0.5 size-4 shrink-0 rounded accent-primary"
                                        />
                                        <span className="text-muted-foreground">I have saved these codes somewhere I can get to without my phone</span>
                                    </label>
                                    <div className="flex justify-end">
                                        <Button type="button" disabled={!savedAcknowledged} onClick={backToSummary}>
                                            Done
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : null}
                </DialogContent>
            </Dialog>
        </div>
    )
}
