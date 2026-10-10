"use client"

/**
 * RetentionCard — how long this workspace keeps its detailed records before it
 * redacts them: the redaction window.
 *
 * This was an environment variable, so changing it meant editing deploy config
 * and restarting. That put the control in the hands of whoever deploys, and the
 * person who owns a retention policy is usually compliance or legal, who cannot
 * edit a compose file. The practical result was that it was never set at all.
 *
 * The floor is EXPLAINED rather than silently applied. A field that quietly
 * turns 30 into 190 looks broken; one that says the six-month minimum exists so
 * the setting cannot be used to fail an obligation by accident is a control.
 *
 * Titled for what it does. It was "Retention", the word Archive uses for when
 * whole records are archived, and the two are different decisions.
 */

import React, { useCallback, useEffect, useRef, useState } from "react"

import { getRetentionPolicy, setRetentionPolicy, type RetentionPolicy } from "@/services/settingsService"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { SaveBar, SettingRow, SettingsList, SettingsSection } from "@/components/ui/settingsSection"
import { useToast } from "@/hooks/use-toast"
import { apiErrorMessage } from "@/lib/utils/apiError"

const asDraft = (p: RetentionPolicy) => (p.window_days > 0 ? String(p.window_days) : "")

const RetentionCard: React.FC = () => {
    const [policy, setPolicy] = useState<RetentionPolicy | null>(null)
    const [state, setState] = useState<"loading" | "failed" | "ready">("loading")
    const [draft, setDraft] = useState("")
    const [saving, setSaving] = useState(false)
    // Said under the field, not in a toast that leaves with the mistake.
    const [error, setError] = useState("")
    const daysRef = useRef<HTMLInputElement>(null)
    const { toast } = useToast()

    // A failed read used to make the whole card vanish, so an admin couldn't
    // tell a window that was never set from one they simply couldn't see.
    const load = useCallback(async () => {
        setState("loading")
        try {
            const p = await getRetentionPolicy()
            setPolicy(p)
            setDraft(asDraft(p))
            setState("ready")
        } catch {
            setState("failed")
        }
    }, [])

    useEffect(() => {
        void load()
    }, [load])

    const dirty = !!policy && draft.trim() !== asDraft(policy)

    const save = async () => {
        const parsed = draft.trim() === "" ? 0 : Number(draft)
        if (!Number.isInteger(parsed) || parsed < 0) {
            setError("Enter a whole number of days, or leave it empty to keep everything.")
            daysRef.current?.focus()
            return
        }
        setSaving(true)
        try {
            const applied = await setRetentionPolicy(parsed)
            setPolicy(applied)
            setDraft(asDraft(applied))
            // Say when the floor intervened rather than letting the number change
            // under them with no explanation.
            if (parsed > 0 && applied.window_days !== parsed) {
                toast({
                    title: `Saved as ${applied.window_days} days`,
                    description: `The minimum is ${applied.minimum_days_floor} days, so a shorter window is raised rather than accepted.`,
                })
            } else {
                toast({
                    title: applied.keeps_everything ? "Keeping everything" : `Keeping ${applied.window_days} days`,
                })
            }
        } catch (e) {
            toast({ title: "Couldn't save the redaction window", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    let body: React.ReactNode
    if (state === "loading") {
        body = (
            <SettingsList>
                <div aria-busy="true" aria-label="Loading the redaction window" className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="space-y-1.5">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-3 w-72 max-w-full" />
                    </div>
                    <Skeleton className="h-8 w-40" />
                </div>
            </SettingsList>
        )
    } else if (state === "failed" || !policy) {
        body = <ErrorState subject="the redaction window" onRetry={() => void load()} />
    } else {
        body = (
            <>
                <SettingsList>
                    <div>
                        <SettingRow
                            label="Days to keep"
                            description={
                                <>
                                    Minimum {policy.minimum_days_floor} days. A shorter window is raised to it rather than
                                    accepted, so this setting cannot be used to fall below the six-month statutory minimum
                                    by accident. Leave it empty to keep everything, which is the default.
                                    {policy.swept_stores && policy.swept_stores.length > 0 && (
                                        <> Applies to: {policy.swept_stores.join(", ")}.</>
                                    )}
                                </>
                            }
                            controlId="retention-days"
                        >
                            <Input
                                ref={daysRef}
                                id="retention-days"
                                name="retention-days"
                                inputMode="numeric"
                                autoComplete="off"
                                value={draft}
                                onChange={(e) => {
                                    setDraft(e.target.value)
                                    setError("")
                                }}
                                placeholder="Keep everything"
                                className="h-8 w-40 tabular-nums"
                                aria-invalid={error ? true : undefined}
                                aria-describedby={error ? "retention-days-error retention-days-desc" : "retention-days-desc"}
                            />
                        </SettingRow>
                        {error && (
                            <p id="retention-days-error" role="alert" className="-mt-1 px-4 pb-3 text-sm text-danger-ink">
                                {error}
                            </p>
                        )}
                    </div>
                </SettingsList>
                <SaveBar
                    dirty={dirty}
                    saving={saving}
                    onSave={() => void save()}
                    onDiscard={() => {
                        setDraft(asDraft(policy))
                        setError("")
                    }}
                    what="redaction window"
                />
            </>
        )
    }

    return (
        <SettingsSection
            title="Redaction window"
            description={
                <>
                    How long detailed records are kept before they are redacted. Records are{" "}
                    <strong className="font-medium text-foreground">redacted, not deleted</strong>: the row and its hashes stay,
                    so an erasure request does not break the audit chain and counts do not change.
                </>
            }
        >
            {body}
        </SettingsSection>
    )
}

export default RetentionCard
