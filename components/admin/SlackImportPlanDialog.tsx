"use client"

/**
 * SlackImportPlanDialog — runs the planning pass on a freshly uploaded
 * job, surfaces the counts and conflicts, and lets the operator tweak
 * options (skip subtypes, channel prefix, file size cap) before they
 * commit to running.
 *
 * The planning call is synchronous (it parses the zip and counts
 * everything). For very large exports it can take 10–60s; we show
 * rows of the plan's shape and the dialog can be safely closed and
 * reopened — the plan is persisted on the job row.
 *
 * The counts are made with the options as they stood. When an option
 * changes, the dialog says the counts are from before it and offers to
 * count again: they used to stay as they were, so "3 names already taken"
 * could be wrong by the time Run was pressed. A size cap left empty is
 * said under its field; it used to become a cap of 1 MB without a word.
 */

import React, { useEffect, useId, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SettingRow, SettingsList, SwitchRow } from "@/components/ui/settingsSection"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { useToast } from "@/hooks/use-toast"
import { LoaderCircle, AlertTriangle } from "@/lib/icons"
import { PlayCircle } from "lucide-react"
import { cn } from "@/lib/utils/helpers/cn"
import { fieldLabel, fieldRow } from "@/lib/ui/fieldRow"
import { readableBytes } from "@/lib/readableBytes"
import {
  planSlackImport,
  runSlackImport,
  type SlackImportOptions,
  type SlackImportPlan,
} from "@/services/slackImportService"
import { importProblemOf, jobChanged, type ImportProblem } from "@/services/importService"

interface Props {
  jobId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: () => void
  /** Loads the import again, when it moved on while it was being planned. */
  onChanged?: () => void
}

const CAP_MIN_MB = 1
const CAP_MAX_MB = 10240

/** The file size cap as typed, or why it can't be used. Pure. */
export function capFromInput(raw: string): { mb: number } | { error: string } {
  const v = Number(raw.trim())
  if (raw.trim() === "" || !Number.isInteger(v) || v < CAP_MIN_MB || v > CAP_MAX_MB) {
    return { error: `Enter a size from ${CAP_MIN_MB} to ${CAP_MAX_MB.toLocaleString("en")} MB.` }
  }
  return { mb: v }
}

const n = (v: number) => v.toLocaleString("en")

export const SlackImportPlanDialog: React.FC<Props> = ({ jobId, open, onOpenChange, onComplete, onChanged }) => {
  const { toast } = useToast()
  const ids = useId()

  const [planning, setPlanning] = useState(true)
  const [running, setRunning] = useState(false)
  const [plan, setPlan] = useState<SlackImportPlan | null>(null)
  // Why planning failed, said in the dialog in place of a plan, as the other
  // importers' plan dialog does: the import moved on meanwhile, or the last
  // run is still stopping (409 run_alive), or anything else. It was a
  // "Planning failed" toast over a dialog with no plan and no way to try again.
  const [problem, setProblem] = useState<ImportProblem | null>(null)
  const [attempt, setAttempt] = useState(0)

  // The options. Defaults match the backend's.
  const [skipSubtypes, setSkipSubtypes] = useState(true)
  const [channelPrefix, setChannelPrefix] = useState("")
  const [maxFileMB, setMaxFileMB] = useState("1024") // 1 GB default
  // The options the counts on screen were made with.
  const [plannedWith, setPlannedWith] = useState("")

  const cap = capFromInput(maxFileMB)
  const capError = "error" in cap ? cap.error : ""

  const currentOptions = (): SlackImportOptions => ({
    skip_subtypes: skipSubtypes,
    channel_prefix: channelPrefix.trim() || undefined,
    max_file_bytes: ("mb" in cap ? cap.mb : 1024) * 1024 * 1024,
  })
  const optionsKey = JSON.stringify(currentOptions())
  const stale = !!plan && !planning && plannedWith !== "" && plannedWith !== optionsKey

  // Run the planning pass when the dialog opens, and again when asked.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      setPlanning(true)
      setProblem(null)
      const opts = currentOptions()
      try {
        const p = await planSlackImport(jobId, opts)
        if (!cancelled) {
          setPlan(p)
          setPlannedWith(JSON.stringify(opts))
        }
      } catch (err) {
        if (cancelled) return
        const p = importProblemOf(err, "Couldn't plan this import. Try again.")
        setProblem(p)
        // Run started it from another tab, say: the import is loaded again
        // behind the dialog, to show what it is now.
        if (jobChanged(p)) onChanged?.()
      } finally {
        if (!cancelled) setPlanning(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, jobId, attempt])

  const handleRun = async () => {
    if (capError) return
    setRunning(true)
    try {
      await runSlackImport(jobId, currentOptions())
      toast({ title: "Import started" })
      onComplete()
      onOpenChange(false)
    } catch (err) {
      // The request shows no toast of its own: this is the one.
      toast({
        title: "Couldn't start the import",
        description: importProblemOf(err).message,
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

  const people =
    plan && (plan.user_new || plan.user_merge)
      ? `${n(plan.user_count)} (${n(plan.user_new)} new, ${n(plan.user_merge)} already here)`
      : plan
        ? n(plan.user_count)
        : ""
  const channels =
    plan && plan.channel_conflict > 0
      ? `${n(plan.channel_count)} (${n(plan.channel_conflict)} ${plan.channel_conflict === 1 ? "name" : "names"} already taken)`
      : plan
        ? n(plan.channel_count)
        : ""

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Plan and run the import</DialogTitle>
          <DialogDescription>
            What the export holds, counted from the uploaded file. Change the options if you need to, then run it.
            Nothing is imported until you press <strong>Run import</strong>.
          </DialogDescription>
        </DialogHeader>

        {planning && !plan && (
          <div role="status" aria-label="Reading the export" className="space-y-2 py-2">
            <SkeletonRows rows={5} avatar={false} lines={1} />
            <p className="text-xs text-muted-foreground">Reading the export. This can take a minute on a large file.</p>
          </div>
        )}

        {plan && (
          <div className="space-y-4 py-2">
            <dl className="space-y-1.5">
              <div className={fieldRow("center", "mb-0")}>
                <dt className={fieldLabel}>People</dt>
                <dd className="text-sm">{people}</dd>
              </div>
              <div className={fieldRow("center", "mb-0")}>
                <dt className={fieldLabel}>Channels</dt>
                <dd className={cn("text-sm", plan.channel_conflict > 0 && "text-warning-ink")}>{channels}</dd>
              </div>
              <div className={fieldRow("center", "mb-0")}>
                <dt className={fieldLabel}>Messages</dt>
                <dd className="text-sm">{n(plan.message_count)}</dd>
              </div>
              <div className={fieldRow("center", "mb-0")}>
                <dt className={fieldLabel}>Threads</dt>
                <dd className="text-sm">{n(plan.thread_count)}</dd>
              </div>
              <div className={fieldRow("center", "mb-0")}>
                <dt className={fieldLabel}>Files</dt>
                <dd className="text-sm">{`${n(plan.file_count)} (${readableBytes(plan.file_bytes)})`}</dd>
              </div>
            </dl>

            {(stale || planning) && (
              <div role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                {planning ? (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Counting again…
                  </span>
                ) : (
                  <>
                    <span className="text-muted-foreground">These counts are from before your changes.</span>
                    <Button size="sm" variant="outline" className="h-8" onClick={() => setAttempt((a) => a + 1)} disabled={!!capError}>
                      Count again
                    </Button>
                  </>
                )}
              </div>
            )}

            {plan.warnings && plan.warnings.length > 0 && (
              <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs">
                <div className="mb-2 flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4 text-warning-ink" aria-hidden="true" />
                  {plan.warnings.length} {plan.warnings.length === 1 ? "warning" : "warnings"}
                </div>
                <ul className="max-h-40 list-disc space-y-1 overflow-auto pl-5 text-muted-foreground">
                  {plan.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <section aria-labelledby={`${ids}-options`} className="space-y-2">
              <h3 id={`${ids}-options`} className="text-sm font-medium">
                Options
              </h3>
              <SettingsList>
                <SwitchRow
                  label="Skip system messages"
                  description={"Leaves out “Priya joined the channel”, topic changes and the like."}
                  checked={skipSubtypes}
                  disabled={running}
                  onChange={setSkipSubtypes}
                />
                <SettingRow
                  label="Channel name prefix (optional)"
                  description="Put in front of every imported channel's name. Useful when importing into a OneCamp that already has channels of the same names."
                  controlId={`${ids}-prefix`}
                >
                  <Input
                    id={`${ids}-prefix`}
                    aria-describedby={`${ids}-prefix-desc`}
                    placeholder="slack-…"
                    value={channelPrefix}
                    onChange={(e) => setChannelPrefix(e.target.value)}
                    disabled={running}
                    maxLength={32}
                    autoComplete="off"
                    className="h-8 w-40"
                  />
                </SettingRow>
                <SettingRow
                  label="Skip files larger than (MB)"
                  description="Larger files are left out with a warning. Up to 10,240 MB; 1,024 MB unless changed."
                  controlId={`${ids}-cap`}
                >
                  <div className="flex flex-col items-start gap-1 sm:items-end">
                    <Input
                      id={`${ids}-cap`}
                      type="number"
                      inputMode="numeric"
                      min={CAP_MIN_MB}
                      max={CAP_MAX_MB}
                      value={maxFileMB}
                      onChange={(e) => setMaxFileMB(e.target.value)}
                      disabled={running}
                      aria-invalid={capError ? true : undefined}
                      aria-describedby={`${ids}-cap-desc${capError ? ` ${ids}-cap-error` : ""}`}
                      className="h-8 w-28"
                    />
                    {capError && (
                      <p id={`${ids}-cap-error`} className="text-xs font-medium text-danger-ink">
                        {capError}
                      </p>
                    )}
                  </div>
                </SettingRow>
              </SettingsList>
            </section>
          </div>
        )}

        {!planning && !plan && (
          problem ? (
            <div role="alert" className="space-y-3 py-4">
              <p className="break-words text-sm text-danger-ink">{problem.message}</p>
              {/* An import that moved on has nothing to plan again here. */}
              {!jobChanged(problem) && (
                <Button size="sm" variant="outline" onClick={() => setAttempt((a) => a + 1)}>Try again</Button>
              )}
            </div>
          ) : (
            <div className="space-y-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">Couldn&apos;t make a plan from the export.</p>
              <Button size="sm" variant="outline" onClick={() => setAttempt((a) => a + 1)}>Try again</Button>
            </div>
          )
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={running}>
            Close
          </Button>
          <Button onClick={handleRun} disabled={planning || running || !plan || !!capError}>
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
