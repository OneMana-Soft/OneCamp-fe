"use client"

/**
 * RetentionCard — how long this workspace keeps its records.
 *
 * This was an environment variable, so changing it meant editing deploy config
 * and restarting. That put the control in the hands of whoever deploys, and the
 * person who owns a retention policy is usually compliance or legal, who cannot
 * edit a compose file. The practical result was that it was never set at all.
 *
 * The floor is EXPLAINED rather than silently applied. A field that quietly
 * turns 30 into 190 looks broken; one that says the six-month minimum exists so
 * the setting cannot be used to fail an obligation by accident is a control.
 */

import React, { useCallback, useEffect, useState } from "react"

import { getRetentionPolicy, setRetentionPolicy, type RetentionPolicy } from "@/services/settingsService"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FileArchive, Loader2 } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"

export const RetentionCard: React.FC = () => {
    const [policy, setPolicy] = useState<RetentionPolicy | null>(null)
    const [draft, setDraft] = useState("")
    const [saving, setSaving] = useState(false)
    const { toast } = useToast()

    const load = useCallback(async () => {
        try {
            const p = await getRetentionPolicy()
            setPolicy(p)
            setDraft(p.window_days > 0 ? String(p.window_days) : "")
        } catch {
            setPolicy(null)
        }
    }, [])

    useEffect(() => {
        void load()
    }, [load])

    const save = async () => {
        const parsed = draft.trim() === "" ? 0 : Number(draft)
        if (Number.isNaN(parsed) || parsed < 0) {
            toast({ title: "Enter a number of days, or leave it empty to keep everything", variant: "destructive" })
            return
        }
        setSaving(true)
        try {
            const applied = await setRetentionPolicy(parsed)
            setPolicy(applied)
            setDraft(applied.window_days > 0 ? String(applied.window_days) : "")
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
        } catch {
            toast({ title: "Could not save the retention policy", variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    if (!policy) return null

    return (
        <Card className="border-border/60">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                    <FileArchive className="h-5 w-5 text-primary" />
                    Retention
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    How long detailed records are kept. Records are <strong>redacted, not deleted</strong>: the row and
                    its hashes stay, so an erasure request does not break the audit chain and counts do not change.
                </p>

                <div className="space-y-1.5">
                    <Label htmlFor="retention-days" className="text-xs">
                        Days to keep
                    </Label>
                    <div className="flex items-center gap-2">
                        <Input
                            id="retention-days"
                            inputMode="numeric"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            placeholder="Empty means keep everything"
                            className="max-w-56"
                        />
                        <Button size="sm" onClick={save} disabled={saving}>
                            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                            Save
                        </Button>
                    </div>
                    <p className="text-2xs text-muted-foreground">
                        Minimum {policy.minimum_days_floor} days. A shorter window is raised to it rather than accepted,
                        so this setting cannot be used to fall below the six-month statutory minimum by accident. Leave
                        it empty to keep everything, which is the default.
                    </p>
                </div>

                {policy.swept_stores && policy.swept_stores.length > 0 && (
                    <p className="text-2xs text-muted-foreground">
                        Applies to: {policy.swept_stores.join(", ")}.
                    </p>
                )}
            </CardContent>
        </Card>
    )
}

export default RetentionCard
