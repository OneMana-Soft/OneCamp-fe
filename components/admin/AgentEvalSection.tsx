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
  if (!score) return <span className="text-[11px] text-muted-foreground">not run yet</span>
  if (score.inconclusive) {
    return (
      <Badge variant="secondary" className="text-[10px]" title={score.reason || "inconclusive"}>
        Inconclusive
      </Badge>
    )
  }
  const cls = score.passed ? "text-success" : "text-red-600"
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium", cls)} title={`${score.score}% of checks met`}>
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

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setScenarios(await listEvalScenarios(agentId))
    } catch {
      // interceptor surfaces the error
    } finally {
      setLoading(false)
    }
  }, [agentId])

  React.useEffect(() => {
    void load()
  }, [load])

  const handleAdd = async () => {
    if (!name.trim() || !prompt.trim()) {
      toast({ title: "Name and prompt are required" })
      return
    }
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
      title: scenario?.name ? `Delete "${scenario.name}"?` : "Delete this scenario?",
      description: "The scenario and its expectations are removed. This cannot be undone.",
      confirmText: "Delete scenario",
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
    } catch {
      toast({ title: "Test run failed", variant: "destructive" })
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
    } catch {
      toast({ title: "Suite run failed", variant: "destructive" })
    } finally {
      setRunningAll(false)
    }
  }

  return (
    <div className="grid gap-2 border-t pt-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm">Saved tests</Label>
          <p className="text-[11px] text-muted-foreground">
            Save what a good answer looks like, then run them to catch regressions before shipping.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {suite && (
            <span className="text-[11px] text-muted-foreground">
              {suite.scored > 0 ? `${Math.round((suite.passed / suite.scored) * 100)}% passing` : "no verdict"} ({suite.passed}/{suite.scored})
            </span>
          )}
          <Button variant="outline" size="sm" onClick={handleRunAll} disabled={runningAll || scenarios.length === 0}>
            {runningAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Run all"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {scenarios.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{s.name}</div>
                <div className="truncate text-[11px] text-muted-foreground">{s.prompt}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <ScoreBadge score={results[s.id]} />
                <Button variant="ghost" size="sm" onClick={() => handleRunOne(s.id)} disabled={runningId === s.id}>
                  {runningId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Run"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(s.id)}
                  title="Delete test"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          {scenarios.length === 0 && (
            <p className="py-2 text-[11px] text-muted-foreground">No saved tests yet. Add one below.</p>
          )}
        </div>
      )}

      <div className="mt-1 grid gap-1.5 rounded-lg bg-muted/20 p-2.5">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Test name, e.g. 'Creates a task for a blocker'" maxLength={120} />
        <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Prompt to run the agent with" maxLength={4000} />
        <Input value={mustContain} onChange={(e) => setMustContain(e.target.value)} placeholder="Answer must mention (comma separated, optional)" />
        <Input value={expectedTools} onChange={(e) => setExpectedTools(e.target.value)} placeholder="Tools it should use (comma separated, optional)" />
        <Button size="sm" onClick={handleAdd} disabled={adding} className="justify-self-start">
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
          Add test
        </Button>
      </div>
    </div>
  )
}

export default AgentEvalSection
