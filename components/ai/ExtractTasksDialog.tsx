"use client"

/**
 * ExtractTasksDialog — "Create tasks from this".
 *
 * Reads a conversation (channel/dm/group) or pasted text, proposes action
 * items via /ai/extract-tasks, and lets the user pick a target project, tick
 * which tasks to create, and confirm. Read-then-approve: nothing is created
 * until the user confirms, and creation happens AS them (project-admin enforced
 * server-side). Provider-agnostic; the heavy lifting is server-side.
 */

import React, { useState, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { Sparkles, Loader2, Check, User, Calendar, CheckSquare } from "@/lib/icons"
import {
  extractTasks,
  createTasksFromExtraction,
  type ExtractSourceType,
  type ProposedTask,
} from "@/services/taskExtractService"
import { withAI } from "@/components/common/withFeature"

interface ProjectOption {
  project_uuid: string
  project_name: string
  project_deleted_at?: string
}

function isZeroEpoch(s?: string): boolean {
  return !s || s.startsWith("0001-01-01") || s.startsWith("1970-01-01")
}

function dueLabel(due?: string): string {
  if (!due) return ""
  const d = new Date(due)
  if (isNaN(d.getTime())) return ""
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

const ExtractTasksDialog: React.FC<{
  open: boolean
  onOpenChange: (v: boolean) => void
  sourceType: ExtractSourceType
  sourceId?: string
}> = ({ open, onOpenChange, sourceType, sourceId }) => {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [tasks, setTasks] = useState<ProposedTask[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [note, setNote] = useState<string | null>(null)
  const [manualText, setManualText] = useState("")
  const [projectId, setProjectId] = useState("")
  // How many recent messages / transcript lines the assistant scanned, shown
  // as a transparent grounding caption. 0 = nothing to disclose (text mode).
  const [scanned, setScanned] = useState(0)

  const { data: projectData } = useFetch<{ data: ProjectOption[] }>(open ? GetEndpointUrl.projectListByAdminUID : "")
  const projects = (projectData?.data || []).filter((p) => isZeroEpoch(p.project_deleted_at))

  const isTextMode = sourceType === "text"
  // Soft, Notion-style scope hint — signals recency without exposing any cap.
  const sourceLabel =
    sourceType === "text" ? "text" : sourceType === "meeting" ? "meeting" : "recent conversation"

  // Transparent grounding: what the assistant actually looked at. Never shown
  // for pasted text (the user supplied it) or when nothing was scanned.
  const scanCaption =
    isTextMode || scanned <= 0
      ? null
      : sourceType === "meeting"
        ? `Scanned ${scanned} line${scanned === 1 ? "" : "s"} from this meeting`
        : `Scanned ${scanned} recent message${scanned === 1 ? "" : "s"}`

  const run = useCallback(
    async (text?: string) => {
      setLoading(true)
      setNote(null)
      setTasks([])
      setSelected(new Set())
      setScanned(0)
      try {
        const res = await extractTasks({ source_type: sourceType, source_id: sourceId, text })
        if (!res.enabled) {
          toast({ title: "AI is not enabled for this workspace", variant: "destructive" })
          return
        }
        setScanned(res.scanned_count || 0)
        setTasks(res.tasks || [])
        setSelected(new Set((res.tasks || []).map((_, i) => i))) // pre-select all
        if (!res.tasks || res.tasks.length === 0) {
          setNote(res.note || "No clear action items found.")
        }
      } catch {
        // surfaced by interceptor
      } finally {
        setLoading(false)
      }
    },
    [sourceType, sourceId, toast],
  )

  // For conversation sources, extract on open. Text mode waits for input.
  useEffect(() => {
    if (open && !isTextMode && sourceId) {
      run()
    }
    if (!open) {
      setTasks([])
      setSelected(new Set())
      setNote(null)
      setManualText("")
      setProjectId("")
      setScanned(0)
    }
  }, [open, isTextMode, sourceId, run])

  const toggle = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  const create = async () => {
    if (!projectId) {
      toast({ title: "Pick a project first", variant: "destructive" })
      return
    }
    const chosen = tasks.filter((_, i) => selected.has(i))
    if (chosen.length === 0) {
      toast({ title: "Select at least one task", variant: "destructive" })
      return
    }
    setCreating(true)
    try {
      const res = await createTasksFromExtraction(projectId, chosen)
      toast({
        title: `Created ${res.created} task${res.created === 1 ? "" : "s"}`,
        description: res.failed > 0 ? `${res.failed} couldn't be created.` : undefined,
      })
      onOpenChange(false)
    } catch {
      // surfaced
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-primary" /> Create tasks from this
          </DialogTitle>
          <DialogDescription>
            The assistant pulls action items from the {sourceLabel}. Pick a
            project, choose which to create, and confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 min-w-0">
          {/* Text mode input */}
          {isTextMode && tasks.length === 0 && (
            <div className="space-y-2">
              <Textarea
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder="Paste meeting notes or a discussion here…"
                className="min-h-[120px] resize-none text-sm"
                maxLength={16000}
              />
              <Button onClick={() => run(manualText)} disabled={loading || manualText.trim().length < 40} className="self-start">
                {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
                {loading ? "Reading…" : "Find action items"}
              </Button>
            </div>
          )}

          {loading && !isTextMode && (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Finding action items…
            </div>
          )}

          {scanCaption && !loading && (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Sparkles className="h-3 w-3 shrink-0 text-primary/60" />
              {scanCaption}
            </p>
          )}

          {note && !loading && <p className="text-sm text-muted-foreground">{note}</p>}

          {tasks.length > 0 && (
            <>
              <ul className="flex max-h-[40vh] flex-col gap-1.5 overflow-y-auto">
                {tasks.map((t, i) => {
                  const on = selected.has(i)
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => toggle(i)}
                        className={`group flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                          on ? "border-primary bg-primary/5" : "border-border/70 hover:border-border"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                          }`}
                        >
                          {on && <Check className="h-3 w-3" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-foreground">{t.title}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                            {t.assignee_name && (
                              <span className="inline-flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {t.assignee_name}
                                {!t.assignee_uuid && " (unmatched)"}
                              </span>
                            )}
                            {dueLabel(t.due) && (
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {dueLabel(t.due)}
                              </span>
                            )}
                            {t.priority && t.priority !== "medium" && <span className="capitalize">{t.priority}</span>}
                          </span>
                          {t.description && (
                            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/80">{t.description}</span>
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Create in project</label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a project you administer" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.project_uuid} value={p.project_uuid}>
                        {p.project_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={create} disabled={creating || selected.size === 0 || !projectId} className="self-end">
                {creating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                Create {selected.size} task{selected.size === 1 ? "" : "s"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default withAI(ExtractTasksDialog)
