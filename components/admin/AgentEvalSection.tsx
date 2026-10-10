"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, Plus, Trash2, Check, X } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { cn } from "@/lib/utils/helpers/cn"
import { Field } from "@/components/ui/field"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { apiErrorMessage } from "@/lib/utils/apiError"
import {
  EvalScenario,
  EvalScore,
  listEvalScenarios,
  createEvalScenario,
  deleteEvalScenario,
  runEvalScenario,
  runEvalSuite,
} from "@/services/agentService"

// Split a comma/newline separated input into a trimmed, non-empty list.
function splitList(s: string): string[] {
  return s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
}

// A compact pass/fail/score chip for one scored run.
const ScoreBadge: React.FC<{ score?: EvalScore }> = ({ score }) => {
  if (!score) return <span className="text-2xs text-muted-foreground">not run yet</span>
  if (score.inconclusive) {
    return (
      <Badge variant="secondary" className="text-2xs" title={score.reason || "inconclusive"}>
        Inconclusive
      </Badge>
    )
  }
  const cls = score.passed ? "text-success-ink" : "text-danger-ink"
  return (
    <span className={cn("inline-flex items-center gap-1 text-2xs font-medium", cls)} title={`${score.score}% of checks met`}>
      {score.passed ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      {score.passed ? "Pass" : "Fail"} · {score.score}%
    </span>
  )
}

// AgentEvalSection turns the one-shot test into saved, scored scenarios. The
// owner saves "what good looks like" once, runs the suite, and sees a pass/fail
// per scenario — so they can prove the agent behaves before shipping a change.
export const AgentEvalSection: React.FC<{ agentId: string }> = ({ agentId }) => {
  const { toast } = useToast()
  const confirm = useConfirm()
  const [scenarios, setScenarios] = React.useState<EvalScenario[]>([])
  const [loading, setLoading] = React.useState(true)
  const [results, setResults] = React.useState<Record<string, EvalScore>>({})
  const [runningId, setRunningId] = React.useState<string | null>(null)
  const [runningAll, setRunningAll] = React.useState(false)
  const [suite, setSuite] = React.useState<{ passed: number; scored: number; total: number } | null>(null)

  // Add-form state.
  const [name, setName] = React.useState("")
  const [prompt, setPrompt] = React.useState("")
  const [mustContain, setMustContain] = React.useState("")
  const [expectedTools, setExpectedTools] = React.useState("")
  const [adding, setAdding] = React.useState(false)
  // Said under the field, with the cursor there: "Name and prompt are
  // required" was a toast tied to neither.
  const [errors, setErrors] = React.useState<{ name?: string; prompt?: string }>({})
  const nameRef = React.useRef<HTMLInputElement>(null)
  const promptRef = React.useRef<HTMLInputElement>(null)
  // A failed read left the list empty, which said "No saved tests yet".
  const [failed, setFailed] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setScenarios(await listEvalScenarios(agentId))
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [agentId])

  React.useEffect(() => {
    void load()
  }, [load])

  const handleAdd = async () => {
    const next: typeof errors = {}
    if (!name.trim()) next.name = "Give the test a name."
    if (!prompt.trim()) next.prompt = "Enter the prompt to run the agent with."
    setErrors(next)
    if (next.name) return nameRef.current?.focus()
    if (next.prompt) return promptRef.current?.focus()
    setAdding(true)
    try {
      const created = await createEvalScenario(agentId, {
        name: name.trim(),
        prompt: prompt.trim(),
        expectations: {
          must_contain: splitList(mustContain),
          expected_tools: splitList(expectedTools),
        },
        is_active: true,
      })
      setScenarios((prev) => [created, ...prev])
      setName("")
      setPrompt("")
      setMustContain("")
      setExpectedTools("")
    } catch {
      // interceptor surfaces the error
    } finally {
      setAdding(false)
    }
  }

  // Confirmed: the delete is optimistic, so the row vanishes on the click and an
  // accidental one looks identical to a deliberate one. A scenario is hand-written
  // test data, which nothing else in the product can regenerate.
  const handleDelete = (id: string) => {
    const scenario = scenarios.find((s) => s.id === id)
    confirm({
      title: scenario?.name ? `Delete the test "${scenario.name}"?` : "Delete this test?",
      description: "The test and what it expects are removed. This can't be undone.",
      confirmText: "Delete test",
      destructive: true,
      onConfirm: () => {
        void deleteScenario(id)
      },
    })
  }

  const deleteScenario = async (id: string) => {
    const prev = scenarios
    setScenarios((s) => s.filter((x) => x.id !== id))
    try {
      await deleteEvalScenario(id)
    } catch {
      setScenarios(prev)
    }
  }

  const handleRunOne = async (id: string) => {
    setRunningId(id)
    try {
      const res = await runEvalScenario(id)
      setResults((r) => ({ ...r, [id]: res.result }))
    } catch (e) {
      toast({ title: "Couldn't run the test", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
    } finally {
      setRunningId(null)
    }
  }

  const handleRunAll = async () => {
    setRunningAll(true)
    try {
      const res = await runEvalSuite(agentId)
      const next: Record<string, EvalScore> = {}
      res.scenarios.forEach((s) => (next[s.scenario_id] = s.result))
      setResults(next)
      setSuite({ passed: res.passed, scored: res.scored, total: res.total })
    } catch (e) {
      toast({ title: "Couldn't run the tests", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
    } finally {
      setRunningAll(false)
    }
  }

  return (
    <div className="grid gap-2 border-t pt-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm">Saved tests</Label>
          <p className="text-xs text-muted-foreground">
            Save what a good answer looks like, then run the tests after a change to catch anything it broke.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {suite && (
            <span className="text-xs text-muted-foreground">
              {suite.scored > 0 ? `${Math.round((suite.passed / suite.scored) * 100)}% passing (${suite.passed} of ${suite.scored})` : "No result yet"}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={handleRunAll} disabled={runningAll || scenarios.length === 0}>
            {runningAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Run all"}
          </Button>
        </div>
      </div>

      {loading && scenarios.length === 0 ? (
        <div role="status" aria-label="Loading the saved tests">
          <SkeletonRows rows={2} avatar={false} />
        </div>
      ) : failed ? (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-xs text-muted-foreground">Couldn&apos;t load the saved tests.</p>
          <Button variant="outline" size="sm" className="h-8" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {scenarios.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{s.name}</div>
                <div className="truncate text-xs text-muted-foreground">{s.prompt}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <ScoreBadge score={results[s.id]} />
                <Button variant="ghost" size="sm" aria-label={`Run ${s.name}`} onClick={() => handleRunOne(s.id)} disabled={runningId === s.id}>
                  {runningId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Run"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${s.name}`}
                  className="h-7 w-7 text-danger-ink hover:text-danger-ink"
                  onClick={() => handleDelete(s.id)}
                  title="Delete test"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          {scenarios.length === 0 && (
            <p className="py-2 text-xs text-muted-foreground">No saved tests yet. Add one below.</p>
          )}
        </div>
      )}

      {/* Labelled fields: placeholders alone vanish as you type. */}
      <div className="mt-1 grid gap-3 rounded-lg bg-muted/20 p-2.5">
        <Field label="Test name" error={errors.name}>
          <Input
            ref={nameRef}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (errors.name) setErrors((er) => ({ ...er, name: undefined }))
            }}
            placeholder="Creates a task for a blocker…"
            maxLength={120}
            autoComplete="off"
          />
        </Field>
        <Field label="Prompt" error={errors.prompt}>
          <Input
            ref={promptRef}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value)
              if (errors.prompt) setErrors((er) => ({ ...er, prompt: undefined }))
            }}
            placeholder="What to ask the agent…"
            maxLength={4000}
            autoComplete="off"
          />
        </Field>
        <Field label="Answer must mention (optional)" help="Separated by commas.">
          <Input value={mustContain} onChange={(e) => setMustContain(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Tools it should use (optional)" help="Separated by commas.">
          <Input value={expectedTools} onChange={(e) => setExpectedTools(e.target.value)} spellCheck={false} autoComplete="off" />
        </Field>
        {/* Outline: the dialog's one primary action is Save changes. */}
        <Button size="sm" variant="outline" onClick={handleAdd} disabled={adding} className="justify-self-start">
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
          Add test
        </Button>
      </div>
    </div>
  )
}

