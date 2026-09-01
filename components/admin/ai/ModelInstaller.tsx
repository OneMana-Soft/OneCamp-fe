"use client"

/**
 * ModelInstaller — install (pull) a local Ollama model by tag, with live
 * streaming download progress over SSE.
 *
 * Why type-a-tag instead of a browse list: Ollama has no stable public
 * catalog API, and new models ship constantly. The source of truth is
 * ollama.com/library — the admin pastes any tag (e.g. "llama3.3:70b",
 * "qwen2.5-coder:7b") and we pull it live. A few common suggestions are
 * offered for convenience, clearly labeled as such.
 *
 * If the running Ollama is too old for the model's architecture, the
 * stream reports update_required and we show the (operator-run) update
 * steps rather than failing silently. Those steps are OllamaUpdateSteps,
 * shared with the engine row and the catalogue tiles so one instruction
 * cannot drift into three.
 */

import React, { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Download, X, CheckCircle2 } from "lucide-react"
import { OllamaUpdateSteps } from "@/components/admin/ai/OllamaUpdateSteps"
import { PullProgress, pullModel, formatBytes } from "@/services/aiModelService"
import { useToast } from "@/hooks/use-toast"

const SUGGESTIONS = [
  "gemma4:e4b",
  "gemma3:4b",
  "qwen3:8b",
  "gpt-oss:20b",
  "llama3.2:3b",
  "llama3.1:8b",
  "deepseek-r1:8b",
  "qwen2.5-coder:7b",
  "phi4-mini:3.8b",
  "nomic-embed-text",
  "embeddinggemma:300m",
  "mxbai-embed-large",
]

export const ModelInstaller: React.FC<{
  providerId: string
  onInstalled: () => void
  /**
   * Newest published engine version, when the page has it. Passed down rather than fetched here: the
   * admin panel already loads it once for the server-resources row, and the pull stream that reports
   * "too old" carries no version of its own, so this is the only way this surface can name a target.
   */
  ollamaLatestVersion?: string
}> = ({ providerId, onInstalled, ollamaLatestVersion }) => {
  const { toast } = useToast()
  const [tag, setTag] = useState("")
  const [pulling, setPulling] = useState(false)
  const [progress, setProgress] = useState<PullProgress | null>(null)
  const [updateRequired, setUpdateRequired] = useState(false)
  const abortRef = useRef<null | (() => void)>(null)

  const pct = (() => {
    if (!progress?.total || !progress.completed) return null
    return Math.round((progress.completed / progress.total) * 100)
  })()

  const start = () => {
    const model = tag.trim()
    if (!model) return
    setPulling(true)
    setProgress({ status: "starting" })
    setUpdateRequired(false)

    const { promise, abort } = pullModel(providerId, model, (p) => {
      setProgress(p)
      if (p.update_required) setUpdateRequired(true)
    })
    abortRef.current = abort

    promise
      .then((result) => {
        if (result.updateRequired) {
          setUpdateRequired(true)
          return
        }
        if (result.ok) {
          toast({ title: "Model installed", description: model })
          onInstalled()
          setTag("")
        } else {
          toast({
            title: "Install failed",
            description: result.error || "pull error",
            variant: "destructive",
          })
        }
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name !== "AbortError") {
          const msg = (e as { message?: string })?.message || "pull error"
          toast({ title: "Install failed", description: msg, variant: "destructive" })
        }
      })
      .finally(() => {
        setPulling(false)
        abortRef.current = null
      })
  }

  const cancel = () => {
    abortRef.current?.()
    setPulling(false)
    setProgress(null)
  }

  return (
    <div className="rounded-md border border-dashed border-border p-3 space-y-3">
      <div>
        <Label className="text-xs font-medium">Install a model</Label>
        <p className="text-2xs text-muted-foreground">
          Type any tag from{" "}
          <a href="https://ollama.com/library" target="_blank" rel="noreferrer" className="underline">
            ollama.com/library
          </a>{" "}
          and pull it live.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[200px]">
          <Input
            list="ollama-suggestions"
            value={tag}
            disabled={pulling}
            placeholder="e.g. llama3.3:70b"
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !pulling) start()
            }}
          />
          <datalist id="ollama-suggestions">
            {SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        {!pulling ? (
          <Button size="sm" onClick={start} disabled={!tag.trim()}>
            <Download className="h-4 w-4 mr-1" /> Install
          </Button>
        ) : (
          <Button size="sm" variant="destructive" onClick={cancel}>
            <X className="h-4 w-4 mr-1" /> Cancel
          </Button>
        )}
      </div>

      {/* Progress */}
      {progress && pulling && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-2xs text-muted-foreground">
            <span>{progress.status || "working…"}</span>
            {progress.total ? (
              <span>
                {formatBytes(progress.completed || 0)} / {formatBytes(progress.total)}
              </span>
            ) : null}
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: pct != null ? `${pct}%` : "33%" }}
            />
          </div>
        </div>
      )}

      {progress?.done && progress.status === "success" && !pulling && (
        <p className="text-xs text-success dark:text-emerald-500 flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5" /> Installed.
        </p>
      )}

      {/* Ollama-too-old: actionable, not a silent failure */}
      {updateRequired && <OllamaUpdateSteps variant="blocked" targetVersion={ollamaLatestVersion} />}
    </div>
  )
}
