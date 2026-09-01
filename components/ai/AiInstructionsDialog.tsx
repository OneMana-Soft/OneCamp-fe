"use client"

/**
 * AiInstructionsDialog — a member's personal AI custom instructions
 * (ChatGPT/Notion-style). Free text that shapes how the assistant answers YOU
 * (tone, role, defaults, preferred language), applied on top of the workspace
 * prompt for your requests only. Minimal: one textarea, load on open, save/clear.
 */

import React, { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Sparkles } from "@/lib/icons"
import { getMyAIInstructions, setMyAIInstructions } from "@/services/aiModelService"

const MAX_LEN = 2000

const AiInstructionsDialog: React.FC<{
  open: boolean
  onOpenChange: (v: boolean) => void
}> = ({ open, onOpenChange }) => {
  const { toast } = useToast()
  const [value, setValue] = useState("")
  const [initial, setInitial] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    getMyAIInstructions()
      .then((v) => {
        if (cancelled) return
        setValue(v)
        setInitial(v)
      })
      .catch(() => {
        /* non-fatal */
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const dirty = value.trim() !== initial.trim()

  const save = async () => {
    setSaving(true)
    try {
      await setMyAIInstructions(value.trim())
      setInitial(value.trim())
      toast({ title: "Instructions saved" })
      onOpenChange(false)
    } catch {
      toast({ title: "Error", description: "Couldn't save your instructions", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Custom instructions
          </DialogTitle>
          <DialogDescription>
            Tell the assistant how you&apos;d like it to respond — your role, preferred tone, default
            language, or anything to always keep in mind. Applies to your AI only.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. I'm a product manager. Keep answers brief and action-oriented, and default to British English."
            rows={6}
            maxLength={MAX_LEN}
            disabled={loading || saving}
            className="resize-none text-sm"
          />
          <span className="pointer-events-none absolute bottom-2 right-3 text-2xs text-muted-foreground">
            {value.length}/{MAX_LEN}
          </span>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={loading || saving || !dirty} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default AiInstructionsDialog
