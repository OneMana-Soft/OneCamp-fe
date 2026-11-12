"use client"

import { useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { WhenField } from "@/components/ui/when-field"
import { toLocalInputValue } from "@/lib/messages/schedulePresets"
import { whenProblem } from "@/lib/time/whenWords"
import { reminderChoices } from "@/lib/utils/later"

/**
 * Remind me: a moment of the person's choosing, within the next year (the
 * server's, ValidateRemindAt, WhenField's own window), in words ("tomorrow
 * 9", "next Monday") or the app's date and time fields (D14), for a message,
 * a task, a doc or a project. A dialog on a computer, the phone's sheet with
 * its actions pinned in the footer (ResponsiveDialog). Loaded when Pick a
 * date and time… is chosen: the bookmark sits on every message.
 */
export default function ReminderPicker({ initial, onPick, onClose }: { initial?: Date; onPick: (at: Date) => void; onClose: () => void }) {
  const now = new Date()
  const formId = useId()
  const problemId = useId()
  // Read as it opens: the reminder set while still ahead, else tomorrow morning.
  const [value, setValue] = useState(() => toLocalInputValue(initial && initial > now ? initial : reminderChoices(now).find((c) => c.key === "tomorrow")!.at))
  const at = value ? new Date(value) : null
  const problem = whenProblem(at, now)
  return (
    <ResponsiveDialog
      title="Remind me"
      description="It comes back to the top of Later, and to your phone if notifications are on."
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={Boolean(problem)} aria-describedby={problem ? problemId : undefined}>
            Set reminder
          </Button>
        </>
      }
    >
      <form
        id={formId}
        data-reminder-picker=""
        onSubmit={(e) => {
          e.preventDefault()
          if (!problem && at) onPick(at)
        }}
      >
        <WhenField value={value} onChange={setValue} onPick={onPick} messageId={problemId} />
      </form>
    </ResponsiveDialog>
  )
}
