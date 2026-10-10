"use client"

import { useState, useEffect, useId, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { SettingRow, SettingsList, SwitchRow } from "@/components/ui/settingsSection"
import { RefreshCw } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { PostEndpointUrl } from "@/services/endPoints"
import { PURGEABLE } from "@/lib/purgeLine"
import { archiveEntity } from "@/components/admin/archiveEntities"
import { archiveProblem } from "@/components/admin/archiveProblem"

interface PolicyData {
  id: string
  entity_type: string
  retention_days: number
  auto_archive: boolean
  archive_completed_tasks: boolean
  archive_inactive_channels_days: number
  compress_attachments: boolean
  /** Days after archiving before files or recordings are removed for good; 0 keeps them. */
  purge_after_days?: number
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  policy: PolicyData | null
}

const DAYS_MIN = 7
const DAYS_MAX = 3650
const RANGE = `${DAYS_MIN} to ${DAYS_MAX.toLocaleString("en")}`

/** Whole days within the server's range, or null. */
function days(raw: string): number | null {
  const v = Number(raw.trim())
  return raw.trim() !== "" && Number.isInteger(v) && v >= DAYS_MIN && v <= DAYS_MAX ? v : null
}

/**
 * One kind's archive rule. It offers only what does something for that kind:
 * when to archive, whether to do it on the schedule, finished tasks only (for
 * tasks), and deleting archived files for good (for files and recordings).
 * Every rule used to offer "Inactive channel days" and "Compress attachments"
 * as well, which the server stores and never reads; they are left as they
 * were. What a number is missing is said under it, where it was a toast.
 */
export default function ArchiveEditPolicyDialog({ open, onOpenChange, onSuccess, policy }: Props) {
  const { toast } = useToast()
  const ids = useId()

  const [retentionDays, setRetentionDays] = useState("365")
  const [autoArchive, setAutoArchive] = useState(false)
  const [completedTasks, setCompletedTasks] = useState(true)
  const [purgeAfterDays, setPurgeAfterDays] = useState("0")
  const [errors, setErrors] = useState<{ retention?: string; purge?: string }>({})
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState("")
  const retentionRef = useRef<HTMLInputElement>(null)
  const purgeRef = useRef<HTMLInputElement>(null)

  const kind = policy?.entity_type ?? ""
  const name = archiveEntity(kind).label.toLowerCase()
  const canPurge = !!policy && PURGEABLE.includes(kind)
  const isTasks = kind === "tasks"

  useEffect(() => {
    if (open && policy) {
      setRetentionDays(String(policy.retention_days))
      setAutoArchive(policy.auto_archive)
      setCompletedTasks(policy.archive_completed_tasks)
      setPurgeAfterDays(String(policy.purge_after_days ?? 0))
      setErrors({})
      setProblem("")
    }
  }, [open, policy])

  const handleSubmit = async () => {
    if (!policy) return
    const retention = days(retentionDays)
    const purgeRaw = purgeAfterDays.trim()
    const purge = purgeRaw === "0" ? 0 : days(purgeAfterDays)
    const found: { retention?: string; purge?: string } = {}
    if (retention === null) found.retention = `Enter a number of days from ${RANGE}.`
    if (canPurge && purge === null) found.purge = `Enter 0, or a number of days from ${RANGE}.`
    setErrors(found)
    if (found.retention) return retentionRef.current?.focus()
    if (found.purge) return purgeRef.current?.focus()

    setSaving(true)
    setProblem("")
    try {
      // Only what the dialog shows. The server keeps any field a request
      // leaves out, so the two it stores and never reads stay as they were.
      await axiosInstance.put(
        `${PostEndpointUrl.UpdateArchivePolicy}/${kind}`,
        {
          retention_days: retention,
          auto_archive: autoArchive,
          ...(isTasks ? { archive_completed_tasks: completedTasks } : {}),
          ...(canPurge ? { purge_after_days: purge } : {}),
        },
        OWN_ERRORS,
      )
      toast({ title: "Archive rules saved", description: `For ${name}.` })
      onSuccess()
      onOpenChange(false)
    } catch (err: unknown) {
      setProblem(archiveProblem(err, "Couldn't save the rules. Check the numbers and try again."))
    } finally {
      setSaving(false)
    }
  }

  const purgeNow = purgeAfterDays.trim() === "0"

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Archive rules for {name}</DialogTitle>
          <DialogDescription>Archived items are hidden, not deleted, and can be restored.</DialogDescription>
        </DialogHeader>
        <SettingsList className="my-2">
          <SettingRow
            label="Archive items older than (days)"
            description={`From ${RANGE} days.`}
            controlId={`${ids}-retention`}
          >
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <Input
                ref={retentionRef}
                id={`${ids}-retention`}
                type="number"
                inputMode="numeric"
                min={DAYS_MIN}
                max={DAYS_MAX}
                value={retentionDays}
                onChange={(e) => {
                  setRetentionDays(e.target.value)
                  if (errors.retention) setErrors((x) => ({ ...x, retention: undefined }))
                }}
                aria-invalid={errors.retention ? true : undefined}
                aria-describedby={`${ids}-retention-desc${errors.retention ? ` ${ids}-retention-error` : ""}`}
                className="h-8 w-28"
              />
              {errors.retention && (
                <p id={`${ids}-retention-error`} className="text-xs font-medium text-danger-ink">
                  {errors.retention}
                </p>
              )}
            </div>
          </SettingRow>
          <SwitchRow
            label="Archive automatically"
            description="Once an hour, OneCamp archives what is older than this. Off: only when you press Archive now."
            checked={autoArchive}
            onChange={setAutoArchive}
          />
          {isTasks && (
            <SwitchRow
              label="Only archive finished tasks"
              description="Open tasks stay, however old they are."
              checked={completedTasks}
              onChange={setCompletedTasks}
            />
          )}
          {canPurge && (
            <SettingRow
              label="Delete from storage after (days)"
              description={
                purgeNow
                  ? `0 keeps archived ${name}, so they can be restored. From ${RANGE}: deleted for good that long after archiving, which frees disk and can't be undone.`
                  : `Archived ${name} are deleted for good ${purgeAfterDays.trim()} days after archiving. This frees disk and can't be undone.`
              }
              controlId={`${ids}-purge`}
            >
              <div className="flex flex-col items-start gap-1 sm:items-end">
                <Input
                  ref={purgeRef}
                  id={`${ids}-purge`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={DAYS_MAX}
                  value={purgeAfterDays}
                  onChange={(e) => {
                    setPurgeAfterDays(e.target.value)
                    if (errors.purge) setErrors((x) => ({ ...x, purge: undefined }))
                  }}
                  aria-invalid={errors.purge ? true : undefined}
                  aria-describedby={`${ids}-purge-desc${errors.purge ? ` ${ids}-purge-error` : ""}`}
                  className="h-8 w-28"
                />
                {errors.purge && (
                  <p id={`${ids}-purge-error`} className="text-xs font-medium text-danger-ink">
                    {errors.purge}
                  </p>
                )}
              </div>
            </SettingRow>
          )}
        </SettingsList>
        {problem && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-danger-ink">
            {problem}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <RefreshCw className="h-4 w-4 animate-spin mr-2" />}
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
