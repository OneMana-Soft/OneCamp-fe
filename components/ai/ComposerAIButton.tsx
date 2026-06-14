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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useToast } from "@/hooks/use-toast"
import { useDocAI, DocAIAction } from "@/services/aiService"
import { removeHtmlTags } from "@/lib/utils/removeHtmlTags"
import { Sparkles, Loader2, Maximize, Minimize, Lightbulb, CheckCircle2 } from "@/lib/icons"

interface ComposerAIButtonProps {
  /** Returns the current composer text (plain or HTML). */
  getText: () => string
  /** Receives generated HTML to insert into the composer. */
  onResult: (html: string) => void
  className?: string
  disabled?: boolean
}

const IMPROVE_ACTIONS: { action: DocAIAction; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { action: "rewrite", label: "Improve writing", Icon: Lightbulb },
  { action: "fix_grammar", label: "Fix grammar", Icon: CheckCircle2 },
  { action: "shorten", label: "Make shorter", Icon: Minimize },
  { action: "expand", label: "Make longer", Icon: Maximize },
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

export const ComposerAIButton: React.FC<ComposerAIButtonProps> = ({
  getText,
  onResult,
  className,
  disabled,
}) => {
  const { toast } = useToast()
  const { complete } = useDocAI()
  const [open, setOpen] = useState(false)
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
    [complete, onResult, toast],
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
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label="Write with AI"
              className={"h-8 w-8 text-muted-foreground hover:text-primary " + (className || "")}
            >
              <Sparkles className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Write with AI</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" side="top" className="w-72 p-2">
        {hasDraft ? (
          <>
            <p className="px-1 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
              Improve your draft
            </p>
            <div className="flex flex-col">
              {IMPROVE_ACTIONS.map(({ action, label, Icon }) => (
                <button
                  key={action}
                  type="button"
                  disabled={anyBusy}
                  onClick={() => run(action, draft)}
                  className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent transition-colors disabled:opacity-60"
                >
                  {busy === action ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <Icon className="h-4 w-4 text-primary/70" />
                  )}
                  {label}
                </button>
              ))}
            </div>
            <div className="my-1.5 h-px bg-border" />
          </>
        ) : null}

        <p className="px-1 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
          {hasDraft ? "Or draft something new" : "Draft with AI"}
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
          placeholder="e.g. draft a friendly status update…"
          rows={2}
          className="text-sm resize-none mb-2"
        />
        <Button
          type="button"
          size="sm"
          className="w-full"
          disabled={anyBusy || !prompt.trim()}
          onClick={onWrite}
        >
          {busy === "write" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
          Generate
        </Button>
      </PopoverContent>
    </Popover>
  )
}
