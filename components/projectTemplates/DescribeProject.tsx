"use client"

// "Describe it" in New project (AI edition): a sentence about the project,
// and the AI drafts its plan as a template the person reads in the picker
// before anything is made. On a small model running on the server's own CPU
// a draft takes a minute or two, so it says so while it works, and stops
// asking when the person cancels or closes the dialog.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Sparkles } from "@/lib/icons"
import { withAI } from "@/components/common/withFeature"
import { draftProjectPlan } from "@/hooks/useProjectTemplates"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { isAbort } from "@/lib/utils/abort"
import { TEMPLATE_LIMITS, type ProjectTemplate } from "@/lib/projectTemplates"

function DescribeProjectUngated({ onDrafted }: { onDrafted: (t: ProjectTemplate) => void }) {
  const [open, setOpen] = React.useState(false)
  const [text, setText] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const id = React.useId()
  const hintId = React.useId()
  const running = React.useRef<AbortController | null>(null)

  // Closing the dialog stops the asking; the draft itself finishes on the server.
  React.useEffect(() => () => running.current?.abort(), [])

  const ready = text.trim().length >= TEMPLATE_LIMITS.planMin

  const draft = async () => {
    if (busy || !ready) return
    const controller = new AbortController()
    running.current = controller
    setBusy(true)
    setError("")
    try {
      onDrafted(await draftProjectPlan(text, controller.signal))
      setOpen(false)
    } catch (err) {
      if (!isAbort(err)) setError(apiErrorMessage(err, "The plan couldn't be drafted just now. Try again, or pick a template."))
    } finally {
      if (running.current === controller) {
        running.current = null
        setBusy(false)
      }
    }
  }

  const cancel = () => {
    running.current?.abort()
    running.current = null
    setBusy(false)
    setOpen(false)
  }

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" className="h-8 w-fit gap-1.5 px-2 text-xs" onClick={() => setOpen(true)}>
        <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
        Describe it, and the AI drafts the plan
      </Button>
    )
  }
  return (
    <div className="grid gap-2 rounded-lg border border-dashed p-3">
      <label htmlFor={id} className="text-xs font-medium">
        What is the project, and by when?
      </label>
      <Textarea
        id={id}
        rows={2}
        maxLength={TEMPLATE_LIMITS.planMax}
        autoFocus
        value={text}
        disabled={busy}
        aria-describedby={hintId}
        placeholder="Launch our mobile app in six weeks, with a beta for 50 users first"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void draft()
          }
        }}
      />
      <p id={hintId} className="text-xs text-muted-foreground" aria-live="polite">
        {busy ? "Drafting the plan. On a small model this can take a minute or two." : "You'll see the plan before anything is made. Ctrl/⌘ Enter drafts it."}
      </p>
      {error && (
        <p role="alert" className="text-xs text-danger-ink">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={cancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" className="h-7 gap-1.5 text-xs" disabled={busy || !ready} onClick={() => void draft()}>
          <Sparkles className="h-3.5 w-3.5" />
          {busy ? "Drafting…" : "Draft the plan"}
        </Button>
      </div>
    </div>
  )
}

export const DescribeProject = withAI(DescribeProjectUngated)
