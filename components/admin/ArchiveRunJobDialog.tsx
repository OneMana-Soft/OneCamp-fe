"use client"

import { useState } from "react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Tile } from "@/components/ui/graphics/Tile"
import { RefreshCw } from "@/lib/icons"
import { archiveEntity } from "@/components/admin/archiveEntities"
import { archiveProblem } from "@/components/admin/archiveProblem"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
  entityLabel: string
  entityType?: string
}

/**
 * Archiving one kind of thing now, rather than on its schedule.
 *
 * The dialog stays open until the server answers, so it can say it is
 * archiving and say a refusal in place: it used to close the moment its
 * button was pressed (an AlertDialog's action closes it), so "Running…" never
 * showed and a failure became a toast titled "Error". Its title's icon is the
 * kind's own tile, where it was a warning triangle over an action that can be
 * undone.
 */
export default function ArchiveRunJobDialog({ open, onOpenChange, onConfirm, entityLabel, entityType }: Props) {
  const [isRunning, setIsRunning] = useState(false)
  const [problem, setProblem] = useState("")
  const entity = archiveEntity(entityType ?? "")
  const name = (entityType ? entity.label : entityLabel).toLowerCase()
  const Icon = entity.icon

  const handleConfirm = async (e: React.MouseEvent) => {
    // An AlertDialog's action closes it; this one closes when the server has answered.
    e.preventDefault()
    setIsRunning(true)
    setProblem("")
    try {
      await onConfirm()
    } catch (err: unknown) {
      setProblem(archiveProblem(err, "Couldn't start archiving. Try again in a moment."))
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!isRunning) onOpenChange(o) }}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2.5">
            <Tile hue={entity.hue} size="sm">
              <Icon />
            </Tile>
            Archive old {name} now?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Every one of the <strong className="text-foreground">{name}</strong> older than its archive rule allows
                is archived now, rather than on the next scheduled run.
              </p>
              <p>Archived items are hidden, not deleted, and can be restored. It runs in the background; you can leave this page.</p>
              {(entityType === "posts" || entityType === "chats") && (
                <p className="text-xs">
                  What OneCamp AI remembered from them (decisions, commitments, questions) is archived with them, so it
                  stops showing up in AI search and briefings. Restoring brings it back.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {problem && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-danger-ink">
            {problem}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRunning}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isRunning} className="gap-1.5">
            {isRunning && <RefreshCw className="h-4 w-4 animate-spin" />}
            {isRunning ? "Archiving…" : "Archive now"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
