"use client"

/**
 * RetentionCard: how long this workspace keeps its detailed records before it
 * redacts them, the redaction window.
 *
 * This was an environment variable, so changing it meant editing deploy config
 * and restarting. The person who owns a retention policy is usually compliance
 * or legal, who cannot edit a compose file, so it was never set at all.
 *
 * The floor is EXPLAINED rather than silently applied. A field that quietly
 * turns 30 into 190 looks broken; one that says "Minimum 190 days." beside it
 * is a control. The 190-day floor is the server's (EU AI Act record keeping
 * plus margin); this only says it, it never computes one.
 *
 * Design v3 (A11): one number row ("365 days") with the floor inline, the rest
 * behind "How it works", and the card's own footer to save, since it is a
 * typed number (batched), not a switch.
 */

import React, { useCallback, useEffect, useRef, useState } from "react"

import { getRetentionPolicy, setRetentionPolicy, type RetentionPolicy } from "@/services/settingsService"
import { ErrorState } from "@/components/ui/error-state"
import { SettingRow, SettingsCard, SettingsCardFooter, SettingsRowsSkeleton, SettingsSection } from "@/components/ui/settingsSection"
import { NumberUnitInput } from "@/components/ui/settingsControls"
import { useToast } from "@/hooks/use-toast"
import { apiErrorMessage, apiErrorStatus } from "@/lib/utils/apiError"
import { Disclosure } from "@/components/ui/disclosure"

const asDraft = (p: RetentionPolicy) => (p.window_days > 0 ? String(p.window_days) : "")

const RetentionCard: React.FC = () => {
    const [policy, setPolicy] = useState<RetentionPolicy | null>(null)
    const [state, setState] = useState<"loading" | "failed" | "ready">("loading")
    const [failure, setFailure] = useState<string | undefined>(undefined)
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
        } catch (e) {
            setFailure(apiErrorStatus(e) ? apiErrorMessage(e) : undefined)
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
            // Say when the floor intervened rather than letting the number
            // change under them with no explanation.
            if (parsed > 0 && applied.window_days !== parsed) {
                toast({
                    title: `Saved as ${applied.window_days} days`,
                    description: `The minimum is ${applied.minimum_days_floor} days, so a shorter window is raised rather than accepted.`,
                })
            } else {
                toast({ title: applied.keeps_everything ? "Keeping everything" : `Keeping ${applied.window_days} days`, tone: "success" })
            }
        } catch (e) {
            toast({ title: "Couldn't save the redaction window", description: apiErrorMessage(e, "Try again in a moment."), tone: "error" })
        } finally {
            setSaving(false)
        }
    }

    let body: React.ReactNode
    if (state === "loading") {
        body = (
            <SettingsCard aria-label="Loading the redaction window">
                <SettingsRowsSkeleton rows={1} control="field" />
            </SettingsCard>
        )
    } else if (state === "failed" || !policy) {
        body = <ErrorState compact subject="the redaction window" detail={failure} onRetry={() => void load()} />
    } else {
        body = (
            <SettingsCard
                dirty={dirty}
                footer={
                    <SettingsCardFooter
                        hint="Applies from the next nightly sweep."
                        dirty={dirty}
                        saving={saving}
                        onSave={() => void save()}
                        onReset={() => {
                            setDraft(asDraft(policy))
                            setError("")
                        }}
                    />
                }
            >
                <SettingRow
                    label="Days to keep"
                    controlId="retention-days"
                    description={
                        <>
                            {/* The floor, inline, in the server's own number. */}
                            <span data-retention-floor="">Minimum {policy.minimum_days_floor} days.</span> Empty keeps everything.
                        </>
                    }
                >
                    <NumberUnitInput
                        ref={daysRef}
                        id="retention-days"
                        name="retention-days"
                        unit="days"
                        min={0}
                        autoComplete="off"
                        value={draft}
                        onChange={(e) => {
                            setDraft(e.target.value)
                            setError("")
                        }}
                        placeholder="All"
                        className="w-28"
                        invalid={!!error}
                        aria-describedby={error ? "retention-days-error retention-days-desc" : "retention-days-desc"}
                    />
                </SettingRow>
                {error && (
                    <p id="retention-days-error" role="alert" className="-mt-2 px-4 pb-3 text-sm text-danger-ink">
                        {error}
                    </p>
                )}
                <Disclosure data-retention-how="" className="set-row !min-h-0 text-xs text-ink-2" summary="How it works" summaryClassName="font-medium hover:text-foreground">
                    <p className="mt-1.5 max-w-[60ch] text-pretty">
                        A shorter window is raised to the minimum rather than accepted, so this setting cannot be used to fall below
                        the six-month statutory minimum by accident. Records are redacted, not deleted: the row and its hashes stay,
                        so an erasure request does not break the audit chain and counts do not change.
                        {policy.swept_stores && policy.swept_stores.length > 0 && <> Applies to: {policy.swept_stores.join(", ")}.</>}
                    </p>
                </Disclosure>
            </SettingsCard>
        )
    }

    return (
        <SettingsSection
            id="audit-retention"
            title="Redaction window"
            description="How long detailed records are kept before they are redacted."
        >
            {body}
        </SettingsSection>
    )
}

export default RetentionCard
