"use client"

import { useCallback, useEffect, useState } from "react"
import { QRCodeSVG } from "qrcode.react"

import { Button } from "@/components/ui/button"
import {
    AlertTriangle,
    Check,
    CheckCircle2,
    Copy,
    Download,
    LoaderCircle,
    Shield,
    ShieldCheck,
    Smartphone,
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
    /** Scanning a QR and entering the first code. Nothing is enforced yet. */
    | { name: "enrolling"; secret: string; uri: string }
    /** The one and only showing of the recovery codes. */
    | { name: "codes"; codes: string[] }
    /** Confirming a code in order to turn the factor off. */
    | { name: "disabling" }

/** How few remaining recovery codes is worth warning about. */
const LOW_RECOVERY_CODE_THRESHOLD = 3

export function TwoFactorSection() {
    const [status, setStatus] = useState<TwoFactorStatus | null>(null)
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

    const refreshStatus = useCallback(async () => {
        const result = await TwoFactorService.getStatus()
        // A failed read leaves `status` null and the card hidden, matching ChangePasswordSection. An
        // "unavailable" placeholder in a security panel reads as "your account is unprotected", which
        // is a worse lie than saying nothing while the request is retried on the next open.
        if (result.ok) setStatus(result.data)
    }, [])

    useEffect(() => {
        void refreshStatus()
    }, [refreshStatus])

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
                setView({ name: "enrolling", secret: result.data.secret, uri: result.data.uri })
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
            setError("Could not copy. Select the codes and copy them manually.")
        }
    }

    const downloadCodes = (codes: string[]) => {
        // Shared helper rather than a local anchor, because getting this wrong is invisible in Chrome:
        // a detached anchor's click() is ignored by Firefox, and revoking the object URL immediately
        // races the download. Either fault means the button appears to work and no file arrives —
        // for the one artefact in this product that cannot be re-issued.
        if (!downloadTextFile("onecamp-recovery-codes.txt", recoveryCodesText(codes))) {
            setError("Could not download. Copy the codes instead.")
        }
    }

    if (status === null) return null

    const enrolled = status.enrolled
    const lowOnCodes = enrolled && status.unusedRecoveryCodes <= LOW_RECOVERY_CODE_THRESHOLD

    const description = enrolled
        ? `On — a code from your authenticator app is required to sign in. ${status.unusedRecoveryCodes} recovery ${
              status.unusedRecoveryCodes === 1 ? "code" : "codes"
          } left.`
        : "Require a code from your phone as well as your password"

    return (
        <div className="bg-muted/10 p-5 rounded-2xl border space-y-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                    {/* The warning TOKEN, not a raw amber utility. The sibling card uses the raw hue and
                        is part of the backlog app/statusColour.test.ts pins; copying it here pushed the
                        count from 350 to 351 and failed the ratchet, which is the guard working. That
                        scanner reads comments too, so this one describes the class rather than spelling
                        it — a note about not using a hue should not itself count as a usage. */}
                    <div className={`p-2 rounded-full ${enrolled ? "bg-success/10" : "bg-warning/10"}`}>
                        {enrolled ? (
                            <ShieldCheck className="h-5 w-5 text-success" />
                        ) : (
                            <Shield className="h-5 w-5 text-warning" />
                        )}
                    </div>
                    <div>
                        <h3 className="text-sm font-medium">Two-step verification</h3>
                        <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                </div>

                {/* No control while the codes are on screen: every button here navigates away from the
                    only chance to save them. */}
                {view.name === "summary" && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        disabled={busy}
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
                        {busy && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                        {enrolled ? "Turn off" : "Turn on"}
                    </Button>
                )}
                {view.name !== "summary" && view.name !== "codes" && (
                    <Button variant="ghost" size="sm" className="shrink-0" onClick={backToSummary}>
                        Cancel
                    </Button>
                )}
            </div>

            {notice !== "" && view.name === "summary" && (
                <div className="flex items-center space-x-2 text-sm text-success animate-in fade-in">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{notice}</span>
                </div>
            )}

            {/* Shown in the summary, not buried in the enrolment flow: a user who is low on codes has
                nothing to do here yet, but they should know before the day it matters. */}
            {lowOnCodes && view.name === "summary" && (
                <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <p className="text-muted-foreground">
                        {status.unusedRecoveryCodes === 0
                            ? "You have no recovery codes left. If you lose your authenticator app you will need an administrator to reset this. Turn two-step verification off and on again to get a new set."
                            : "You are running low on recovery codes. Turn two-step verification off and on again to get a new set."}
                    </p>
                </div>
            )}

            {operatorError !== "" && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <div className="space-y-1">
                        <p className="font-medium">Two-step verification is not configured on this server</p>
                        <p className="text-muted-foreground">{operatorError}</p>
                    </div>
                </div>
            )}

            {view.name === "summary" && error !== "" && (
                <p className="text-sm text-destructive animate-in fade-in">{error}</p>
            )}

            {view.name === "enrolling" && (
                <form
                    onSubmit={(e) => {
                        e.preventDefault()
                        void confirmSetup(code)
                    }}
                    className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200"
                >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                        {/*
                            EXPLICIT WHITE BACKGROUND AND DARK MODULES, not theme colours. A QR code is
                            read by a camera, not by a person, and it needs light quiet-zone contrast to
                            resolve. Inheriting the dark theme would render an unscannable code that
                            looks perfectly fine to whoever is testing in light mode.
                        */}
                        <div className="shrink-0 self-center rounded-lg bg-white p-3 sm:self-start">
                            <QRCodeSVG value={view.uri} size={148} bgColor="#ffffff" fgColor="#000000" level="M" />
                        </div>

                        <div className="min-w-0 flex-1 space-y-3">
                            <div className="flex items-start gap-2">
                                <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                <p className="text-xs text-muted-foreground">
                                    Scan this with an authenticator app, then enter the 6-digit code it shows.
                                </p>
                            </div>

                            <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">
                                    Can&apos;t scan? Enter this key instead:
                                </p>
                                {/* break-all so a 32-character key does not push the card wide on a
                                    phone; selectable because typing it is the whole point of showing it. */}
                                <code className="block break-all rounded bg-muted/60 px-2 py-1.5 font-mono text-xs">
                                    {view.secret}
                                </code>
                            </div>
                        </div>
                    </div>

                    <TwoFactorCodeField
                        id="totp-enrol-code"
                        value={code}
                        onChange={(next) => {
                            setError("")
                            setCode(next)
                        }}
                        onComplete={(next) => void confirmSetup(next)}
                        // Enrolment proves possession of the NEW secret, so only an authenticator code
                        // can do it. No recovery codes exist yet — they are issued by this step.
                        usingRecoveryCode={false}
                        disabled={busy}
                        error={error}
                        label="Enter the 6-digit code to finish"
                        autoFocus
                    />

                    <Button type="submit" className="w-full h-12" disabled={busy || code.trim() === ""}>
                        {busy && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                        Turn on two-step verification
                    </Button>
                </form>
            )}

            {view.name === "codes" && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                        <div className="space-y-1">
                            <p className="text-sm font-medium">Save your recovery codes now</p>
                            <p className="text-xs text-muted-foreground">
                                These are shown once and cannot be retrieved later. Each one works a single
                                time, in place of your authenticator app.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-muted/40 p-3 font-mono text-xs sm:grid-cols-2">
                        {view.codes.map((c) => (
                            <span key={c} className="select-all tracking-wider">
                                {c}
                            </span>
                        ))}
                    </div>

                    {error !== "" && <p className="text-xs text-destructive">{error}</p>}

                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => void copyCodes(view.codes)}
                        >
                            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            {copied ? "Copied" : "Copy"}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => downloadCodes(view.codes)}
                        >
                            <Download className="h-4 w-4" />
                            Download
                        </Button>
                    </div>

                    {/*
                        An explicit acknowledgement, and the only way out of this view. A plain "Done"
                        button is pressed reflexively; a checkbox that gates it makes the user answer the
                        question. The codes cannot be shown again, so a reflexive dismissal here is an
                        account one bad day away from an administrator reset.
                    */}
                    <label className="flex items-start gap-2 text-xs">
                        <input
                            type="checkbox"
                            checked={savedAcknowledged}
                            onChange={(e) => setSavedAcknowledged(e.target.checked)}
                            className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary"
                        />
                        <span className="text-muted-foreground">
                            I have saved these codes somewhere I can get to without my phone
                        </span>
                    </label>

                    <Button
                        type="button"
                        className="w-full h-12"
                        disabled={!savedAcknowledged}
                        onClick={backToSummary}
                    >
                        Done
                    </Button>
                </div>
            )}

            {view.name === "disabling" && (
                <form
                    onSubmit={(e) => {
                        e.preventDefault()
                        void disable(code)
                    }}
                    className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200"
                >
                    <p className="text-xs text-muted-foreground">
                        Enter a current code to turn this off. Removing your second factor is the first thing
                        someone with a stolen session would try, so it has to be proved.
                    </p>

                    <TwoFactorCodeField
                        id="totp-disable-code"
                        value={code}
                        onChange={(next) => {
                            setError("")
                            setCode(next)
                        }}
                        // No auto-submit here, unlike the other two. Turning protection OFF should take a
                        // deliberate press rather than completing itself on the sixth digit.
                        usingRecoveryCode={usingRecoveryCode}
                        disabled={busy}
                        error={error}
                        autoFocus
                    />

                    <div className="flex items-center justify-between gap-3">
                        <button
                            type="button"
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => {
                                setUsingRecoveryCode((v) => !v)
                                setCode("")
                                setError("")
                            }}
                        >
                            {usingRecoveryCode ? "Use your authenticator app" : "Use a recovery code"}
                        </button>
                    </div>

                    <Button
                        type="submit"
                        variant="destructive"
                        className="w-full h-12"
                        disabled={busy || code.trim() === ""}
                    >
                        {busy && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                        Turn off two-step verification
                    </Button>
                </form>
            )}
        </div>
    )
}
