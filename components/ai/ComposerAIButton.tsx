"use client"

/**
 * ComposerAIButton — inline "write / improve with AI" in any message
 * composer (channel, chat, group). The AI-native equivalent of Notion's
 * inline ⌘K: draft from a prompt, or rewrite / fix / shorten / expand the
 * current draft, and drop the result straight into the composer.
 *
 * Design:
 *   - Decoupled & reusable: takes the current draft (`getText`) and an
 *     `onResult(html)` callback. The PARENT owns how the composer state is
 *     updated (its own redux dispatch), so this component never touches a
 *     specific composer's internals — it works for every composer.
 *   - Reuses the existing doc-AI backend (useDocAI.complete) — zero new
 *     backend. doc_id is omitted, which the endpoint allows.
 *   - Two modes, picked automatically: with a draft → improve actions;
 *     empty → "write" from a prompt.
 *   - Calm UX: a popover, inline spinner, graceful error toast, and the
 *     result wrapped to the simple <p> HTML the composer expects.
 */

import React, { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useToast } from "@/hooks/use-toast"
import { useModKey } from "@/hooks/useModKey"
import { useDocAI, DocAIAction } from "@/services/aiService"
import { removeHtmlTags } from "@/lib/utils/removeHtmlTags"
import { Sparkles, Loader2 } from "@/lib/icons"
import { Spark } from "@/components/ui/graphics/motifs"
import { withAI } from "@/components/common/withFeature"

interface ComposerAIButtonProps {
  /** Returns the current composer text (plain or HTML). */
  getText: () => string
  /** Receives generated HTML to insert into the composer. */
  onResult: (html: string) => void
  className?: string
  disabled?: boolean
  /**
   * Opened from outside (the chat composer's "+" menu and ⌘J, design v3 chat
   * C45): no trigger of its own, anchored at the composer's top right.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const IMPROVE_ACTIONS: { action: DocAIAction; label: string }[] = [
  { action: "rewrite", label: "Improve" },
  { action: "fix_grammar", label: "Fix grammar" },
  { action: "shorten", label: "Shorter" },
  { action: "expand", label: "Longer" },
]

// toComposerHTML wraps plain AI output into the simple paragraph HTML the
// composer pipeline expects, splitting on newlines. Strips any stray tags
// the model emitted first (defense-in-depth, mirrors the post/chat path).
function toComposerHTML(text: string): string {
  const safe = removeHtmlTags(text).trim()
  if (!safe) return ""
  return safe
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${line}</p>`)
    .join("")
}

/**
 * Draft with AI (design v3 chat, C45): on the floating material, w-80,
 * end-aligned with 12px of collision padding, so it never leaves the sheet
 * (at 1440 it ran off the right edge from a start-aligned trigger). The spark
 * in the agent's colour, a 64px "Tell it what to write", four chips for a
 * draft that exists, and "⌘⏎ Write". Dictation moved to the composer's
 * Record control.
 */
const ComposerAIButtonUngated: React.FC<ComposerAIButtonProps> = ({
  getText,
  onResult,
  className,
  disabled,
  open: openProp,
  onOpenChange,
}) => {
  const { toast } = useToast()
  const { complete } = useDocAI()
  // "⌘ ⏎" on a Mac, "Ctrl ⏎" elsewhere.
  const mod = useModKey()
  const [openState, setOpenState] = useState(false)
  const controlled = openProp !== undefined
  const open = controlled ? openProp : openState
  const setOpen = useCallback((o: boolean) => {
    if (!controlled) setOpenState(o)
    onOpenChange?.(o)
  }, [controlled, onOpenChange])
  const [prompt, setPrompt] = useState("")
  const [busy, setBusy] = useState<string | null>(null)

  const run = useCallback(
    async (action: DocAIAction, text: string, customPrompt?: string) => {
      setBusy(action)
      try {
        const res = await complete(action, text, undefined, customPrompt)
        const html = toComposerHTML(res?.result || "")
        if (!html) {
          toast({ title: "AI couldn't generate text", variant: "destructive" })
          return
        }
        onResult(html)
        setOpen(false)
        setPrompt("")
      } catch {
        toast({ title: "AI request failed", variant: "destructive" })
      } finally {
        setBusy(null)
      }
    },
    [complete, onResult, toast, setOpen],
  )

  const onWrite = useCallback(() => {
    const p = prompt.trim()
    if (!p) return
    run("write", p, p)
  }, [prompt, run])

  const draft = removeHtmlTags(getText() || "").trim()
  const hasDraft = draft.length > 0
  const anyBusy = busy !== null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {controlled ? (
        <PopoverAnchor asChild>
          <span aria-hidden="true" className="pointer-events-none absolute right-3 top-0 h-px w-px" />
        </PopoverAnchor>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled}
                aria-label="Write with AI"
                className={"h-8 w-8 text-muted-foreground hover:text-foreground " + (className || "")}
              >
                <Sparkles className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Write with AI</TooltipContent>
        </Tooltip>
      )}
      <PopoverContent align="end" side="top" sideOffset={8} collisionPadding={12} className="pop-surface w-80 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-ui-sm font-medium text-ink">
          <Spark size={14} className="text-agent" /> Draft with AI
        </p>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              onWrite()
            }
          }}
          placeholder="Tell it what to write"
          aria-label="Tell it what to write"
          rows={2}
          className="h-16 min-h-16 resize-none text-ui-sm"
        />
        {hasDraft && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {IMPROVE_ACTIONS.map(({ action, label }) => (
              <button
                key={action}
                type="button"
                disabled={anyBusy}
                onClick={() => run(action, draft)}
                className="chip h-[22px] cursor-pointer gap-1 hover:bg-press hover:text-ink disabled:opacity-60"
              >
                {busy === action && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between">
          {/* A keyboard's shortcut, so not on a touch screen, where it named keys nobody has. */}
          <span className="flex items-center gap-1 text-meta text-ink-3 pointer-coarse:hidden"><kbd className="kbd">{mod}</kbd><kbd className="kbd">⏎</kbd></span>
          <Button type="button" size="sm" disabled={anyBusy || !prompt.trim()} onClick={onWrite} className="ml-auto">
            {busy === "write" && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
            Write
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
// Gated on the AI subsystem: hidden entirely on the AI-free v1 edition, and on v2
// whenever an admin has switched AI off. Wrapping the export covers every place this
// is rendered, desktop and mobile, instead of asking each of them to remember.
export const ComposerAIButton = withAI(ComposerAIButtonUngated)
