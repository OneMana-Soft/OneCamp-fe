"use client"

/**
 * SaveToMemoryButton — the one-click "turn this message into structured
 * knowledge" affordance that lives in the message hover toolbar.
 *
 * This is OneCamp's signature AI-native gesture: any message can become a
 * tracked Decision, Commitment, or Open Question with a single click, then
 * it flows into the same permission-scoped memory layer that powers AskAI,
 * the digest, and the team report. User-initiated capture = high-signal
 * (vs. auto-extraction noise), and it's linked to the source message so it
 * disappears if the message is deleted.
 */

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/hooks/use-toast"
import { captureMemory, CaptureMemoryInput, MemoryKind } from "@/services/memoryService"
import { removeHtmlTags } from "@/lib/utils/removeHtmlTags"
import { Lightbulb, Zap, CheckCircle2, HelpCircle, Loader2, Check } from "@/lib/icons"
import axios from "axios"

const errMessage = (e: unknown): string => {
  if (axios.isAxiosError(e)) return e.response?.data?.msg || e.response?.data?.message || e.message
  if (e instanceof Error) return e.message
  return "Couldn't save to memory"
}

type CaptureKind = Exclude<MemoryKind, "glossary">

const KIND_OPTIONS: {
  kind: CaptureKind
  label: string
  hint: string
  Icon: React.ComponentType<{ className?: string }>
  tint: string
}[] = [
  { kind: "decision", label: "Decision", hint: "A choice the team made", Icon: Zap, tint: "text-violet-600 dark:text-violet-400" },
  { kind: "commitment", label: "Commitment", hint: "Something someone will do", Icon: CheckCircle2, tint: "text-blue-600 dark:text-blue-400" },
  { kind: "question", label: "Open question", hint: "Something still unresolved", Icon: HelpCircle, tint: "text-amber-600 dark:text-amber-400" },
]

interface SaveToMemoryButtonProps {
  /** Raw message body (HTML or plain); stripped before capture. */
  messageText?: string
  /** Scope: exactly one of channelUUID or chatGrpID. */
  channelUUID?: string
  chatGrpID?: string
  /** Source provenance so the deletion cascade can clean up. */
  sourceType: string // "post" | "chat"
  sourceUUID: string
  className?: string
  /**
   * Called when the popover opens or closes so the parent toolbar can stay
   * pinned while the kind-picker is visible (mirrors the pattern used by
   * MessageDesktopDropdown → setIsDropdownOpen).
   */
  onOpenChange?: (open: boolean) => void
}

export const SaveToMemoryButton: React.FC<SaveToMemoryButtonProps> = ({
  messageText,
  channelUUID,
  chatGrpID,
  sourceType,
  sourceUUID,
  className,
  onOpenChange,
}) => {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState<CaptureKind | null>(null)
  const [saved, setSaved] = useState(false)
  // Commitment capture optionally collects a due date (so the overdue nudge
  // can fire). Picking "Commitment" reveals an inline date step instead of
  // saving immediately; the other kinds save on click as before.
  const [commitDue, setCommitDue] = useState<string>("")
  const [pickingDue, setPickingDue] = useState(false)

  const content = (messageText ? removeHtmlTags(messageText) : "").trim()
  // Capture only makes sense with text + a resolvable scope + source.
  const eligible = content.length > 0 && !!sourceUUID && (!!channelUUID || !!chatGrpID)

  const resetTransient = () => {
    setPickingDue(false)
    setCommitDue("")
  }

  const onPick = async (kind: CaptureKind, due?: string) => {
    if (!eligible || saving) return
    setSaving(kind)
    try {
      const input: CaptureMemoryInput = {
        kind,
        content,
        source_type: sourceType,
        source_uuid: sourceUUID,
        ...(channelUUID ? { channel_uuid: channelUUID } : {}),
        ...(chatGrpID ? { chat_grp_id: chatGrpID } : {}),
        ...(kind === "commitment" && due ? { due } : {}),
      }
      await captureMemory(input)
      setSaved(true)
      toast({ title: "Saved to memory", description: `Captured as a ${kind}.` })
      // Brief saved state, then close.
      setTimeout(() => {
        setOpen(false)
        onOpenChange?.(false)
        setSaved(false)
        resetTransient()
      }, 900)
    } catch (e: unknown) {
      const msg = errMessage(e)
      toast({
        title: msg.includes("not enabled") ? "Workspace Memory is off" : "Couldn't save",
        description: msg.includes("not enabled") ? "An admin can enable it in AI settings." : msg,
        variant: "destructive",
      })
    } finally {
      setSaving(null)
    }
  }

  // Clicking a kind: commitment opens the optional due-date step; others save.
  const onKindClick = (kind: CaptureKind) => {
    if (kind === "commitment") {
      setPickingDue(true)
      return
    }
    void onPick(kind)
  }

  if (!eligible) return null

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); onOpenChange?.(o); if (!o) resetTransient() }}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Save to memory"
              className={
                "h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors " +
                (className || "")
              }
            >
              <Lightbulb className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Save to memory</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-60 p-1.5">
        {pickingDue ? (
          // Commitment due-date step — optional. "Save" with no date captures
          // a commitment without a deadline (back-compatible behavior).
          <div className="p-1">
            <p className="px-1 pt-1 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
              Due date (optional)
            </p>
            <input
              type="date"
              value={commitDue}
              autoFocus
              onChange={(e) => setCommitDue(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/40"
            />
            <div className="mt-2 flex items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                className="flex-1 h-8"
                disabled={!!saving}
                onClick={() => onPick("commitment", commitDue || undefined)}
              >
                {saving === "commitment" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save commitment"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8"
                disabled={!!saving}
                onClick={() => setPickingDue(false)}
              >
                Back
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="px-2 pt-1 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
              Save as
            </p>
            <div className="flex flex-col">
              {KIND_OPTIONS.map(({ kind, label, hint, Icon, tint }) => (
                <button
                  key={kind}
                  type="button"
                  disabled={!!saving}
                  onClick={() => onKindClick(kind)}
                  className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-accent transition-colors disabled:opacity-60"
                >
                  <span className={`shrink-0 ${tint}`}>
                    {saving === kind ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : saved && saving === null ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm leading-tight">{label}</span>
                    <span className="block text-[11px] text-muted-foreground leading-tight">{hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
