"use client"

/**
 * The AI self-test, run from the admin page with real model calls (it answers
 * a question, leaves tools alone on small talk, picks the right tool for an
 * action, and chains a read into a follow-up write). It replaced the
 * operator-only `go run ./cmd/aieval` CLI.
 *
 * The run is asynchronous on the server (model calls can take minutes on a
 * local Ollama), so this polls a status endpoint and shows each check as it
 * completes.
 *
 * Design v3 (admin §A15, Overview): it runs inline under the status card.
 * Each check is a 32px row whose 16px glyph resolves in sequence, a spinner
 * and then a moss check (on the spring) or a danger cross, 120ms apart; the
 * finished set says "8 of 8 passed" beside a seal. The stagger is
 * presentation only: every result is the server's.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { BadgeCheck, Check, Loader2, X } from "@/lib/icons"
import { useStagger } from "@/components/admin/ai/useStagger"
import {
  AIConfig,
  AuthorizedModel,
  SelfTestStatus,
  getAuthorizedModels,
  runAISelfTest,
  getAISelfTestStatus,
} from "@/services/aiModelService"
import { apiErrorMessage } from "@/lib/utils/apiError"

export const SELF_TEST_STAGGER_MS = 120

const DEFAULT_VALUE = "__default__"

/** The self-test's state and its Run, shared by the status card's button and the rows. */
export function useSelfTest() {
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
      /* keep the last status on a transient error */
    }
  }, [stopPolling])

  // Any prior result, the models the picker offers, and a run already going.
  useEffect(() => {
    let cancelled = false
    getAISelfTestStatus()
      .then((s) => {
        if (cancelled) return
        setStatus(s ?? null)
        if (s?.state === "running" && !pollRef.current) pollRef.current = setInterval(poll, 2500)
      })
      .catch(() => {})
    getAuthorizedModels()
      .then((m) => !cancelled && setModels((m ?? []).filter((x) => x.enabled && x.provider_enabled)))
      .catch(() => {})
    return () => {
      cancelled = true
      stopPolling()
    }
  }, [poll, stopPolling])

  const run = useCallback(async () => {
    try {
      await runAISelfTest(target === DEFAULT_VALUE ? "" : target)
      setStatus({ state: "running", passed: 0, failed: 0, total: 0, checks: [] })
      stopPolling()
      pollRef.current = setInterval(poll, 2500)
    } catch (e) {
      toast({ title: "Couldn't start the self-test", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
    }
  }, [poll, stopPolling, target, toast])

  return { status, running, models, target, setTarget, run }
}

export type SelfTest = ReturnType<typeof useSelfTest>

/** The checks, resolving one by one. Nothing until a run has started or finished. */
export function SelfTestRows({ test, config }: { test: SelfTest; config: AIConfig }) {
  const { status, running, models, target, setTarget } = test
  const checks = status?.checks ?? []
  const resolved = useStagger(checks.length, SELF_TEST_STAGGER_MS)
  if (!status || status.state === "idle") return null
  const settled = !running && resolved === checks.length
  const passed = checks.filter((c) => c.passed).length
  const allPassed = settled && checks.length > 0 && passed === checks.length

  return (
    <div id="ai-models-selftest" data-settings-card="" data-self-test="" className="set-card scroll-mt-5" aria-live="polite">
      <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
        <h3 className="text-sm font-medium text-foreground">Self-test</h3>
        <Select value={target} onValueChange={setTarget} disabled={running}>
          <SelectTrigger className="h-8 w-auto max-w-[240px] text-xs" aria-label="Model to test">
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
      </div>
      <ul className="pb-1">
        {checks.map((c, i) => {
          const done = i < resolved
          return (
            <li
              key={`${i}-${c.name}`}
              data-check-row=""
              data-state={done ? (c.passed ? "passed" : "failed") : "pending"}
              className="ai-check-row"
            >
              <span className="ai-check-glyph" aria-hidden="true">
                {!done ? (
                  <Loader2 className="size-4 animate-spin text-ink-3" />
                ) : c.passed ? (
                  <span className="ai-glyph-pop ai-check-ok">
                    <Check className="size-2.5" />
                  </span>
                ) : (
                  <span className="ai-glyph-pop ai-check-fail">
                    <X className="size-2.5" />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className={done && !c.passed ? "text-sm text-danger-ink" : "text-sm text-foreground"}>{c.name}</span>
                <span className="sr-only">{done ? (c.passed ? ", passed" : ", failed") : ", checking"}</span>
                {done && !c.passed && c.detail && <span className="block text-xs text-muted-foreground">{c.detail}</span>}
              </span>
            </li>
          )
        })}
        {running && (
          <li data-check-row="" data-state="pending" className="ai-check-row text-muted-foreground">
            <span className="ai-check-glyph" aria-hidden="true">
              <Loader2 className="size-4 animate-spin text-ink-3" />
            </span>
            <span className="text-sm">{checks.length === 0 ? "Starting…" : "Running the next check…"}</span>
          </li>
        )}
      </ul>
      {status.error && status.state === "failed" && <p className="px-4 pb-3 text-xs text-danger-ink">{status.error}</p>}
      {settled && checks.length > 0 && (
        <div data-self-test-result="" className="ai-check-result">
          <BadgeCheck aria-hidden="true" className={allPassed ? "ai-glyph-pop size-5 text-success-ink" : "size-5 text-ink-3"} />
          <span className="text-sm font-medium text-foreground">
            {passed} of {checks.length} passed
          </span>
        </div>
      )}
    </div>
  )
}
