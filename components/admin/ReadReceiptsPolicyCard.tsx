"use client"

// The workspace's read receipts: on (each person can turn theirs off), or
// off for everyone. On by default, as in Teams and Zulip.

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { Eye, Loader2 } from "@/lib/icons"
import { getWorkspaceSettings, setReadReceiptsPolicy } from "@/services/settingsService"

export default function ReadReceiptsPolicyCard() {
    const { toast } = useToast()
    const [enabled, setEnabled] = useState(true)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        getWorkspaceSettings()
            .then((s) => setEnabled(s?.read_receipts_enabled !== false))
            .catch(() => toast({ title: "Couldn't load the read receipts setting", variant: "destructive" }))
            .finally(() => setLoading(false))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const toggle = async (next: boolean) => {
        setSaving(true)
        setEnabled(next)
        try {
            const applied = await setReadReceiptsPolicy(next)
            setEnabled(applied)
            toast({ title: applied ? "Read receipts on" : "Read receipts off" })
        } catch {
            setEnabled(!next)
            toast({ title: "Couldn't save the read receipts setting", variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    return (
        <Card className="border-border/60">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Eye className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg font-semibold">Read receipts</CardTitle>
                </div>
                <CardDescription>
                    In DMs and group chats of up to 20 people, show &quot;Seen&quot; under a person&apos;s latest message
                    once the others have read it. Each person can turn theirs off in their notification settings.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-between rounded-lg border border-border bg-card/50 p-4">
                    <div className="pr-4">
                        <h3 className="text-sm font-semibold">Allow read receipts</h3>
                        <p className="text-xs text-muted-foreground">When off, nobody sees who has read their messages.</p>
                    </div>
                    {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                        <Switch checked={enabled} disabled={saving} onCheckedChange={toggle} aria-label="Allow read receipts" />
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
