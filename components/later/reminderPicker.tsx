"use client"

import { useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { DateTimeField } from "@/components/ui/date-time-field"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { toLocalInputValue } from "@/lib/messages/schedulePresets"
import { reminderChoices } from "@/lib/utils/later"

/**
 * Remind me: a date and time of the person's choosing, within the next year
 * (the server's, ValidateRemindAt), in the app's date and time fields (D14).
 * A dialog on a computer, the phone's sheet with its actions pinned in the
 * footer (ResponsiveDialog). Loaded when Pick a date and time… is chosen:
 * the bookmark sits on every message.
 */
export default function ReminderPicker({ initial, onPick, onClose }: { initial?: Date; onPick: (at: Date) => void; onClose: () => void }) {
  const now = new Date()
  const formId = useId()
  const problemId = useId()
  // Read as it opens: the reminder set while still ahead, else tomorrow morning.
  const [value, setValue] = useState(() => toLocalInputValue(initial && initial > now ? initial : reminderChoices(now).find((c) => c.key === "tomorrow")!.at))
  const max = new Date(now.getTime() + 365 * 86_400_000)
  const at = value ? new Date(value) : null
  const problem =
    !at || Number.isNaN(at.getTime())
      ? "Choose a date and time."
      : at <= now
        ? "Choose a time that has not passed yet."
        : at > max
          ? "Choose a time within the next year."
          : ""
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
        className="space-y-2"
      >
        <DateTimeField
          aria-label="Reminder date and time"
          aria-describedby={problem ? problemId : undefined}
          value={value}
          min={toLocalInputValue(now)}
          max={toLocalInputValue(max)}
          onChange={setValue}
        />
        {problem ? (
          <p id={problemId} className="text-meta text-danger-ink">
            {problem}
          </p>
        ) : null}
      </form>
    </ResponsiveDialog>
  )
}
