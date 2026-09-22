"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { RefreshCw } from "@/lib/icons";
import { usePost } from "@/hooks/usePost"
import { useToast } from "@/hooks/use-toast"
import { PostEndpointUrl } from "@/services/endPoints"
import { PURGEABLE } from "@/lib/purgeLine"

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

const ENTITY_LABELS: Record<string, string> = {
  posts: "Channel Posts", chats: "Direct Messages", tasks: "Tasks",
  recordings: "Recordings", attachments: "Attachments", docs: "Documents",
}

export default function ArchiveEditPolicyDialog({ open, onOpenChange, onSuccess, policy }: Props) {
  const post = usePost()
  const { toast } = useToast()

  const [retentionDays, setRetentionDays] = useState(365)
  const [autoArchive, setAutoArchive] = useState(false)
  const [completedTasks, setCompletedTasks] = useState(true)
  const [inactiveDays, setInactiveDays] = useState(90)
  const [compressAttachments, setCompressAttachments] = useState(false)
  const [purgeAfterDays, setPurgeAfterDays] = useState(0)
  const canPurge = !!policy && PURGEABLE.includes(policy.entity_type)

  useEffect(() => {
    if (open && policy) {
      setRetentionDays(policy.retention_days)
      setAutoArchive(policy.auto_archive)
      setCompletedTasks(policy.archive_completed_tasks)
      setInactiveDays(policy.archive_inactive_channels_days)
      setCompressAttachments(policy.compress_attachments)
      setPurgeAfterDays(policy.purge_after_days ?? 0)
    }
  }, [open, policy])

  const handleSubmit = async () => {
    if (!policy) return
    if (retentionDays < 7 || retentionDays > 3650) {
      toast({ title: "Validation Error", description: "Retention days must be between 7 and 3650", variant: "destructive" })
      return
    }
    if (canPurge && purgeAfterDays !== 0 && (purgeAfterDays < 7 || purgeAfterDays > 3650)) {
      toast({ title: "Validation Error", description: "Remove for good after 0 (keep) or 7 to 3650 days", variant: "destructive" })
      return
    }
    try {
      await post.makeRequest({
        apiEndpoint: PostEndpointUrl.UpdateArchivePolicy,
        appendToUrl: `/${policy.entity_type}`,
        method: "PUT",
        payload: {
          retention_days: retentionDays,
          auto_archive: autoArchive,
          archive_completed_tasks: completedTasks,
          archive_inactive_channels_days: inactiveDays,
          compress_attachments: compressAttachments,
          ...(canPurge ? { purge_after_days: purgeAfterDays } : {}),
        },
        showToast: true,
      })
      onSuccess()
      onOpenChange(false)
    } catch {
      // handled by usePost
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Edit Policy: {policy ? ENTITY_LABELS[policy.entity_type] || policy.entity_type : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="ret-days">Retention Days</Label>
            <Input id="ret-days" type="number" min={7} max={3650} value={retentionDays}
              onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) setRetentionDays(v) }} />
            <p className="text-xs text-muted-foreground">Range: 7 – 3,650 days</p>
          </div>
          <div className="flex items-center justify-between">
            <div><Label>Auto Archive</Label><p className="text-xs text-muted-foreground mt-0.5">Archive on a scheduled basis</p></div>
            <Switch checked={autoArchive} onCheckedChange={setAutoArchive} />
          </div>
          <div className="flex items-center justify-between">
            <div><Label>Archive Completed Tasks</Label><p className="text-xs text-muted-foreground mt-0.5">Only archive tasks marked as done</p></div>
            <Switch checked={completedTasks} onCheckedChange={setCompletedTasks} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="inactive-days">Inactive Channel Days</Label>
            <Input id="inactive-days" type="number" min={7} max={3650} value={inactiveDays}
              onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) setInactiveDays(v) }} />
            <p className="text-xs text-muted-foreground">Days of inactivity before a channel is eligible for archival</p>
          </div>
          <div className="flex items-center justify-between">
            <div><Label>Compress Attachments</Label><p className="text-xs text-muted-foreground mt-0.5">Compress files before archiving</p></div>
            <Switch checked={compressAttachments} onCheckedChange={setCompressAttachments} />
          </div>
          {canPurge && (
            <div className="grid gap-2 border-t border-border/50 pt-4">
              <Label htmlFor="purge-days">Remove for good after</Label>
              <Input id="purge-days" type="number" min={0} max={3650} value={purgeAfterDays}
                onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) setPurgeAfterDays(v) }} />
              <p className="text-xs text-muted-foreground">
                {purgeAfterDays === 0
                  ? "0: archived items are kept and can be restored. Set 7 to 3,650 days to delete them from storage that long after archiving. This frees disk and cannot be undone."
                  : `Archived ${ENTITY_LABELS[policy?.entity_type ?? ""]?.toLowerCase() ?? "items"} are deleted from storage ${purgeAfterDays} days after archiving. Frees disk; cannot be undone.`}
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={post.isSubmitting}>
            {post.isSubmitting ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
