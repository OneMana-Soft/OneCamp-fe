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
import { Button } from "@/components/ui/button"
import { SettingsSection, sectionActionClass } from "@/components/ui/settingsSection"
import { cn } from "@/lib/utils/helpers/cn"
import { CheckCircle2, Copy, Download, Info, Loader2, RefreshCw } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { checkForUpdates, updateSummary, type UpdateStatus, type UpdateTone } from "@/services/updatesService"

// News in the status colours: an available update is information (info),
// not an action, so it no longer takes the accent, which means "press me".
const TONE_ICON: Record<UpdateTone, React.ReactNode> = {
    current: <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-ink" />,
    available: <Download className="mt-0.5 h-4 w-4 shrink-0 text-info-ink" />,
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

    // A flat section like every other tab's: it was a bordered card with a
    // 14px title, beside the health check's 16px one. On a phone the button
    // goes under the words (the section's action slot does that): beside them
    // it squeezed the description to two or three words a line.
    return (
        <SettingsSection
            title="Updates"
            description={
                <>
                    Looks up the newest release on your edition{status?.source ? ` at ${status.source}` : ""}. It only
                    asks when you click, and sends nothing about this workspace.
                </>
            }
            action={
                <Button variant="outline" size="sm" onClick={check} disabled={checking} className={cn(sectionActionClass, "gap-1.5")}>
                    {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                    {status ? "Check again" : "Check for updates"}
                </Button>
            }
        >
            {(summary || error) && (
                <div className="space-y-3" aria-live="polite">
                    {error && <p className="text-sm text-danger-ink">{error}</p>}
                    {summary && (
                        // The answer as words under the title, not a box in a box:
                        // the command keeps its own code block.
                        <div className="space-y-3">
                            <div className="flex items-start gap-2" data-update-tone={summary.tone}>
                                {TONE_ICON[summary.tone]}
                                <div className="min-w-0 space-y-1">
                                    <p className="text-sm font-medium">{summary.title}</p>
                                    <p className="text-sm text-muted-foreground">{summary.body}</p>
                                </div>
                            </div>
                            {summary.command && (
                                <div className="flex items-center gap-2">
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
                </div>
            )}
        </SettingsSection>
    )
}

export default UpdatesCard
