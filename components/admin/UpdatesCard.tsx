"use client"

/**
 * UpdatesCard: which OneCamp this server runs, and whether a newer one exists.
 *
 * A self-hosted workspace updates only when its admin re-runs the installer,
 * and nothing here used to say a newer release existed, so fixes shipped and
 * sat unused. This asks only when the admin clicks: the server then makes one
 * plain request for the current releases, carrying nothing about this
 * workspace. The host and the command come from the server.
 */

import React, { useCallback, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Copy, Download, Info, Loader2, RefreshCw } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { checkForUpdates, updateSummary, type UpdateStatus, type UpdateTone } from "@/services/updatesService"

const TONE_ICON: Record<UpdateTone, React.ReactNode> = {
    current: <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-ink" />,
    available: <Download className="mt-0.5 h-4 w-4 shrink-0 text-primary" />,
    unknown: <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />,
}

const UpdatesCard: React.FC = () => {
    const { toast } = useToast()
    const [status, setStatus] = useState<UpdateStatus | null>(null)
    const [checking, setChecking] = useState(false)
    const [error, setError] = useState("")

    const check = useCallback(async () => {
        setChecking(true)
        setError("")
        try {
            setStatus(await checkForUpdates())
        } catch (e) {
            setError(apiErrorMessage(e, "Couldn't check for updates."))
        } finally {
            setChecking(false)
        }
    }, [])

    const copy = useCallback(
        async (text: string) => {
            try {
                await navigator.clipboard.writeText(text)
                toast({ title: "Copied", description: "Paste it on the server, with your licence key in place of YOUR-LICENSE-KEY." })
            } catch {
                toast({ title: "Couldn't copy", description: "Select the command and copy it yourself.", variant: "destructive" })
            }
        },
        [toast],
    )

    const summary = status ? updateSummary(status) : null

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div className="space-y-1.5">
                    <CardTitle>Updates</CardTitle>
                    <CardDescription>
                        Looks up the newest release on your edition{status?.source ? ` at ${status.source}` : ""}. It
                        only asks when you click, and sends nothing about this workspace.
                    </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={check} disabled={checking} className="shrink-0">
                    {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    {status ? "Check again" : "Check for updates"}
                </Button>
            </CardHeader>
            {(summary || error) && (
                <CardContent className="space-y-3" aria-live="polite">
                    {error && <p className="text-sm text-danger-ink">{error}</p>}
                    {summary && (
                        <div className="rounded-lg border border-border bg-card px-3 py-2.5">
                            <div className="flex items-start gap-2">
                                {TONE_ICON[summary.tone]}
                                <div className="min-w-0 space-y-1">
                                    <p className="text-sm font-medium">{summary.title}</p>
                                    <p className="text-sm text-muted-foreground">{summary.body}</p>
                                </div>
                            </div>
                            {summary.command && (
                                <div className="mt-3 flex items-center gap-2">
                                    <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs">
                                        {summary.command}
                                    </code>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0"
                                        aria-label="Copy the update command"
                                        onClick={() => void copy(summary.command!)}
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            )}
        </Card>
    )
}

export default UpdatesCard
