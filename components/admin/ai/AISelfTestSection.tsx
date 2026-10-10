"use client"

/**
 * AISelfTestSection — "Test AI" from the admin dashboard.
 *
 * Validates the configured AI with real model calls (answers a question,
 * declines to fire a tool on a greeting, picks the right tool for an action,
 * and chains a read into a follow-up write). This replaces the operator-only
 * `go run ./cmd/aieval` CLI so an admin can verify the model from the panel.
 *
 * The run is asynchronous on the backend (model calls can take minutes on a
 * local Ollama), so this polls a status endpoint and shows per-check results
 * as they complete. It can target a specific authorized model or the default.
 */

import { SettingsSection } from "@/components/ui/settingsSection"
import React, { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { CheckCircle2, XCircle, Loader2, Sparkles } from "@/lib/icons"
import {
  AIConfig,
  AuthorizedModel,
  SelfTestStatus,
  getAuthorizedModels,
  runAISelfTest,
  getAISelfTestStatus,
} from "@/services/aiModelService"

const DEFAULT_VALUE = "__default__"

const AISelfTestSection: React.FC<{ config: AIConfig }> = ({ config }) => {
  const { toast } = useToast()
  const [status, setStatus] = useState<SelfTestStatus | null>(null)
  const [models, setModels] = useState<AuthorizedModel[]>([])
  const [target, setTarget] = useState<string>(DEFAULT_VALUE)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const running = status?.state === "running"

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const poll = useCallback(async () => {
    try {
      const s = await getAISelfTestStatus()
      setStatus(s)
      if (s.state !== "running") stopPolling()
    } catch {
      /* keep last status on a transient error */
    }
  }, [stopPolling])

  // Load any prior result + the authorized models for the target picker, and
  // resume polling if a run is already in progress.
  useEffect(() => {
    let cancelled = false
    getAISelfTestStatus()
      .then((s) => {
        if (cancelled) return
        setStatus(s)
        if (s.state === "running" && !pollRef.current) {
          pollRef.current = setInterval(poll, 2500)
        }
      })
      .catch(() => {})
    getAuthorizedModels()
      .then((m) => !cancelled && setModels(m.filter((x) => x.enabled && x.provider_enabled)))
      .catch(() => {})
    return () => {
      cancelled = true
      stopPolling()
    }
  }, [poll, stopPolling])

  const handleRun = async () => {
    try {
      await runAISelfTest(target === DEFAULT_VALUE ? "" : target)
      setStatus({ state: "running", passed: 0, failed: 0, total: 0, checks: [] })
      stopPolling()
      pollRef.current = setInterval(poll, 2500)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to start the test"
      toast({ title: "Couldn't start test", description: msg, variant: "destructive" })
    }
  }

  return (
    <SettingsSection
      level={3}
      title="Test AI"
      description="Run a quick check against a configured model: it should answer questions, leave tools alone on small talk, pick the right action, and chain a summary into a follow-up message. On a local model it can take a minute or two."
    >

      <div className="flex flex-wrap items-center gap-2">
        <Select value={target} onValueChange={setTarget} disabled={running}>
          <SelectTrigger className="w-full sm:w-64" aria-label="Model to test">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_VALUE}>Workspace default ({config.chat_model || "unset"})</SelectItem>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label || m.model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={handleRun} disabled={running || !config.enabled}>
          {running ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {running ? "Testing…" : "Run test"}
        </Button>
        {status && status.state !== "idle" && status.state !== "running" && status.total > 0 && (
          <Badge variant={status.failed === 0 ? "secondary" : "destructive"}>
            {status.passed}/{status.total} passed
          </Badge>
        )}
      </div>

      {status?.error && status.state === "failed" && (
        <p className="text-xs text-danger-ink">{status.error}</p>
      )}

      {status?.checks && status.checks.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {status.checks.map((c, i) => (
            <li key={i} className="flex items-start gap-2 px-4 py-2.5 text-sm">
              {c.passed ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-ink" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger-ink" />
              )}
              <span className="min-w-0">
                <span className={c.passed ? "" : "text-danger-ink"}>{c.name}</span>
                {!c.passed && c.detail && <span className="block text-xs text-muted-foreground">{c.detail}</span>}
              </span>
            </li>
          ))}
          {running && (
            <li className="flex items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Running remaining checks…
            </li>
          )}
        </ul>
      )}
    </SettingsSection>
  )
}

export default AISelfTestSection
