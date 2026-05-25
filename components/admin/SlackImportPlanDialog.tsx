"use client"

/**
 * SlackImportPlanDialog — runs the planning pass on a freshly uploaded
 * job, surfaces the counts and conflicts, and lets the operator tweak
 * options (skip subtypes, channel prefix, file size cap) before they
 * commit to running.
 *
 * The planning call is synchronous (it parses the zip and counts
 * everything). For very large exports it can take 10–60s; we show a
 * spinner and the dialog can be safely closed and reopened — the plan
 * is persisted on the job row.
 */

import React, { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { LoaderCircle, AlertTriangle, CheckCircle2 } from "@/lib/icons"
import { PlayCircle } from "lucide-react"
import {
  planSlackImport,
  runSlackImport,
  type SlackImportOptions,
  type SlackImportPlan,
} from "@/services/slackImportService"

interface Props {
  jobId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: () => void
}

export const SlackImportPlanDialog: React.FC<Props> = ({ jobId, open, onOpenChange, onComplete }) => {
  const { toast } = useToast()

  const [planning, setPlanning] = useState(true)
  const [running, setRunning] = useState(false)
  const [plan, setPlan] = useState<SlackImportPlan | null>(null)

  // Operator-tunable knobs. Defaults match backend defaults.
  const [skipSubtypes, setSkipSubtypes] = useState(true)
  const [channelPrefix, setChannelPrefix] = useState("")
  const [maxFileMB, setMaxFileMB] = useState(1024) // 1 GB default

  // Run the planning pass once when the dialog opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      setPlanning(true)
      try {
        const opts = currentOptions()
        const p = await planSlackImport(jobId, opts)
        if (!cancelled) setPlan(p)
      } catch (err) {
        if (!cancelled) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const e = err as any
          toast({
            title: "Planning failed",
            description: e?.response?.data?.error || e?.message || "Unable to plan import.",
            variant: "destructive",
          })
        }
      } finally {
        if (!cancelled) setPlanning(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, jobId])

  const currentOptions = (): SlackImportOptions => ({
    skip_subtypes: skipSubtypes,
    channel_prefix: channelPrefix.trim() || undefined,
    max_file_bytes: Math.max(1, maxFileMB) * 1024 * 1024,
  })

  const handleRun = async () => {
    setRunning(true)
    try {
      await runSlackImport(jobId, currentOptions())
      toast({ title: "Import started" })
      onComplete()
      onOpenChange(false)
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = err as any
      toast({
        title: "Could not start",
        description: e?.response?.data?.error || e?.message,
        variant: "destructive",
      })
    } finally {
      setRunning(false)
    }
  }

  const handleClose = (next: boolean) => {
    if (running) return
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Plan and run import</DialogTitle>
          <DialogDescription>
            Counts and conflicts are computed from the staged file. Adjust knobs below if needed,
            then run the import. Nothing is written until you click <strong>Run import</strong>.
          </DialogDescription>
        </DialogHeader>

        {planning && (
          <div className="py-12 flex flex-col items-center gap-3 text-muted-foreground text-sm">
            <LoaderCircle className="h-6 w-6 animate-spin" />
            Reading export… (this can take a minute on multi-GB files)
          </div>
        )}

        {!planning && plan && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <PlanStat label="Users (total)" value={plan.user_count} />
              <PlanStat label="Will reuse" value={plan.user_merge} positive />
              <PlanStat label="Will create" value={plan.user_new} />
              <PlanStat label="Channels" value={plan.channel_count} />
              <PlanStat label="Conflicts" value={plan.channel_conflict} warn={plan.channel_conflict > 0} />
              <PlanStat label="Messages" value={plan.message_count.toLocaleString()} />
              <PlanStat label="Threads" value={plan.thread_count.toLocaleString()} />
              <PlanStat label="Files" value={plan.file_count.toLocaleString()} />
              <PlanStat
                label="File size"
                value={`${(plan.file_bytes / (1024 * 1024)).toFixed(1)} MB`}
              />
            </div>

            {plan.warnings && plan.warnings.length > 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                <div className="flex items-center gap-2 font-medium mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  {plan.warnings.length} warning{plan.warnings.length === 1 ? "" : "s"}
                </div>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground max-h-40 overflow-auto">
                  {plan.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t border-border/50 pt-4 space-y-3">
              <div className="font-medium text-sm">Options</div>

              <div className="flex items-start gap-3">
                <Switch
                  id="skip_subtypes"
                  checked={skipSubtypes}
                  onCheckedChange={setSkipSubtypes}
                  disabled={running}
                />
                <div>
                  <Label htmlFor="skip_subtypes" className="font-medium">
                    Skip system messages
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Drops &quot;Akash joined the channel&quot;, topic changes, etc.
                  </p>
                </div>
              </div>

              <div>
                <Label htmlFor="channel_prefix">Channel name prefix</Label>
                <Input
                  id="channel_prefix"
                  placeholder="(none)"
                  value={channelPrefix}
                  onChange={(e) => setChannelPrefix(e.target.value)}
                  disabled={running}
                  maxLength={32}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Optional prefix to prepend to every imported channel name. Useful when
                  re-importing into the same OneCamp.
                </p>
              </div>

              <div>
                <Label htmlFor="max_file_mb">Per-file size cap (MB)</Label>
                <Input
                  id="max_file_mb"
                  type="number"
                  min={1}
                  max={10240}
                  value={maxFileMB}
                  onChange={(e) => setMaxFileMB(Number(e.target.value || 0))}
                  disabled={running}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Files larger than this are skipped with a warning. Default 1024 MB.
                </p>
              </div>
            </div>
          </div>
        )}

        {!planning && !plan && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Could not produce a plan. Check the job&apos;s error message and try again.
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={running}>
            Close
          </Button>
          <Button onClick={handleRun} disabled={planning || running || !plan}>
            {running ? (
              <>
                <LoaderCircle className="h-4 w-4 mr-1.5 animate-spin" />
                Starting…
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4 mr-1.5" />
                Run import
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const PlanStat: React.FC<{ label: string; value: React.ReactNode; positive?: boolean; warn?: boolean }> = ({
  label,
  value,
  positive,
  warn,
}) => (
  <div className="border border-border/50 rounded-md p-3 bg-background/30">
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    <div
      className={`text-lg font-semibold mt-0.5 ${
        warn ? "text-amber-500" : positive ? "text-green-600" : ""
      }`}
    >
      {value}
    </div>
    {warn && <Badge variant="outline" className="mt-1 text-[10px]">Review warnings</Badge>}
    {positive && (
      <Badge variant="outline" className="mt-1 text-[10px] bg-green-500/10 text-green-600 border-green-500/20 gap-1">
        <CheckCircle2 className="h-3 w-3" />
        match
      </Badge>
    )}
  </div>
)
