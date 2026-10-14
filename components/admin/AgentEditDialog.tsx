"use client"

import * as React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { SkillLibraryDialog } from "@/components/admin/SkillLibraryDialog"
import MarkdownMessage from "@/components/ai/MarkdownMessage"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { A2ACardSummary } from "@/components/admin/A2ACardSummary"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { TaskMoveFilterFields, ANY_MOVE, type TaskMoveFilter } from "@/components/task/TaskMoveFilterFields"
import { useFetch } from "@/hooks/useFetch"
import { AGENT_TEMPLATES, scheduleDaysFor, type AgentTemplate } from "@/lib/agentTemplates"
import { GetEndpointUrl } from "@/services/endPoints"
import type { ProjectInfoInterface } from "@/types/project"
import { isZeroEpoch } from "@/lib/utils/validation/isZeroEpoch"
import { McpServer, parseMcpTools, mcpToolFullName } from "@/services/mcpService"
import { McpToolRiskBadge, McpToolRiskLegend } from "@/components/admin/McpToolRisk"
import { type AuthorizedModel } from "@/services/aiModelService"
import { cn } from "@/lib/utils/helpers/cn"
import { AgentAvatar } from "@/components/ui/graphics/PrincipalAvatar"
import { Spark } from "@/components/ui/graphics/motifs"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { secretMoves, secretReentryHint } from "@/lib/utils/secretDestination"
import { Loader2, Sparkles, Play, AlertTriangle, Check, X, Plus, ChevronRight, Plug, Shield } from "@/lib/icons"
import {
  Agent,
  AgentInput,
  AgentTriggerType,
  TOOL_CATALOG,
  WEB_TOOL_GROUP,
  SANDBOX_TOOL_GROUP,
  CODE_PR_TOOL_GROUP,
  EVENT_TRIGGER_OPTIONS,
  WITHDRAWN_EVENT_LABELS,
  SCHEDULE_PRESETS,
  createAgent,
  updateAgent,
  runAgent,
  draftAgent,
  parseEnabledTools,
  parseTriggerConfig,
  parseScope,
  parseKnowledge,
  parseSkillIds,
  type AgentSkill,
  listAgentSkills,
  createAgentSkill,
  type AgentRunOutcome,
  checkRemoteBrain,
  type RemoteBrainResult,
  type RemoteProtocol,
  remoteSecretHow,
} from "@/services/agentService"
import { ChannelInfoInterface, ChannelInfoListInterfaceResp } from "@/types/channel"
import { AgentEvalSection } from "@/components/admin/AgentEvalSection"
import { AgentLearningSection } from "@/components/admin/AgentLearningSection"

interface AgentEditDialogProps {
  agent: Agent | null
  open: boolean
  onClose: () => void
  onSaved: () => void
}

const TRIGGERS: { value: AgentTriggerType; label: string; hint: string }[] = [
  { value: "manual", label: "Manual", hint: "Run it yourself from here." },
  { value: "mention", label: "On mention", hint: "Runs when someone @mentions the agent." },
  { value: "schedule", label: "On a schedule", hint: "Runs on a recurring schedule." },
  { value: "event", label: "On an event", hint: "Runs when a workspace event happens." },
]

/** The single choices of the trigger, for the shared segmented control. */
const TRIGGER_OPTIONS = TRIGGERS.map((t) => ({ value: t.value, label: t.label }))
const SCHEDULE_MODE_OPTIONS = [
  { value: "interval", label: "Every N minutes" },
  { value: "clock", label: "At a set time" },
] as const
const PRESET_OPTIONS = SCHEDULE_PRESETS.map((p) => ({ value: String(p.value), label: p.label }))
const DAY_OPTIONS = [
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Weekdays" },
  { value: "custom", label: "Custom" },
] as const

const WEEKDAY_TOKENS: { token: string; label: string }[] = [
  { token: "MO", label: "Mon" },
  { token: "TU", label: "Tue" },
  { token: "WE", label: "Wed" },
  { token: "TH", label: "Thu" },
  { token: "FR", label: "Fri" },
  { token: "SA", label: "Sat" },
  { token: "SU", label: "Sun" },
]
const ORDERED_DAY_TOKENS = WEEKDAY_TOKENS.map((d) => d.token)

// localTimeToUtcMinute converts a local "HH:MM" to minutes past UTC midnight,
// using the browser's offset (local = UTC + offset, offset = -getTimezoneOffset).
function localTimeToUtcMinute(hhmm: string): number {
  const [h, m] = (hhmm || "09:00").split(":").map((v) => parseInt(v, 10) || 0)
  const localMin = ((h % 24) * 60 + (m % 60))
  const offsetMin = -new Date().getTimezoneOffset()
  return (((localMin - offsetMin) % 1440) + 1440) % 1440
}

// utcMinuteToLocalTime is the inverse: minutes past UTC midnight → local "HH:MM".
function utcMinuteToLocalTime(utcMin: number): string {
  const offsetMin = -new Date().getTimezoneOffset()
  const localMin = (((utcMin + offsetMin) % 1440) + 1440) % 1440
  const h = Math.floor(localMin / 60)
  const m = localMin % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

type AgentStep = "job" | "tools" | "where" | "review"

/** A new agent's four steps (admin §S5). */
export const AGENT_STEPS: { value: AgentStep; label: string }[] = [
  { value: "job", label: "Job" },
  { value: "tools", label: "Tools" },
  { value: "where", label: "Where it works" },
  { value: "review", label: "Review" },
]

/** How long the birth plays before the dialog closes. */
const BIRTH_MS = 900

function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/** The Review step's one sentence: who it acts for, its limit, where, and the record. */
export function governanceSentence(name: string, channels: number): string {
  const where = channels === 0 ? "wherever it is asked" : channels === 1 ? "in the one channel you chose" : `in the ${channels} channels you chose`
  return `${name} acts for you. It can do only what you can, ${where}, and every action is on the record.`
}

export function AgentEditDialog({ agent, open, onClose, onSaved }: AgentEditDialogProps) {
  const { toast } = useToast()
  const editing = !!agent

  // A new agent is made in four steps (design v3, admin §S5): its job, its
  // tools, where it works, and a review that says what it may do in one
  // sentence. Editing an agent shows every part at once, as before.
  const [step, setStep] = React.useState<AgentStep>("job")
  const [born, setBorn] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (open) {
      setStep("job")
      setBorn(null)
    }
  }, [open])
  const show = (s: AgentStep) => editing || step === s

  // Enabled MCP servers contribute extra tool groups (only fetched while open).
  const { data: mcpData } = useFetch<{ data: McpServer[] }>(open ? GetEndpointUrl.GetMcpServers : "")
  const mcpServers = React.useMemo(
    () => (mcpData?.data || []).filter((s) => s.enabled && parseMcpTools(s).length > 0),
    [mcpData],
  )

  // Authorized models the admin can pin this agent to (usable only). Empty
  // selection = run on the workspace default model.
  const { data: modelsData } = useFetch<{ data: AuthorizedModel[] }>(
    open ? GetEndpointUrl.GetAIAuthorizedModels : "",
  )
  const usableModels = React.useMemo(
    () => (modelsData?.data || []).filter((m) => m.enabled && m.provider_enabled),
    [modelsData],
  )

  // Web search is grantable to an agent only when an admin has configured a
  // provider (AI settings). Hide the Web tool group otherwise.
  const { data: aiStatusData } = useFetch<{ data: { web_search_enabled?: boolean; sandbox_enabled?: boolean; code_pr_enabled?: boolean } }>(
    open ? GetEndpointUrl.AIStatus : "",
  )
  const webSearchEnabled = !!aiStatusData?.data?.web_search_enabled
  const sandboxEnabled = !!aiStatusData?.data?.sandbox_enabled
  const codePrEnabled = !!aiStatusData?.data?.code_pr_enabled
  // Hide capability groups the workspace hasn't enabled, so an owner is never
  // offered a tool that would just refuse (web search / code sandbox / code PRs).
  const toolCatalog = React.useMemo(
    () =>
      TOOL_CATALOG.filter((g) => {
        if (g.group === WEB_TOOL_GROUP) return webSearchEnabled
        if (g.group === SANDBOX_TOOL_GROUP) return sandboxEnabled
        if (g.group === CODE_PR_TOOL_GROUP) return codePrEnabled
        return true
      }),
    [webSearchEnabled, sandboxEnabled, codePrEnabled],
  )
  const toolsByRisk = React.useMemo(() => {
    const all = toolCatalog.flatMap((g) => g.tools)
    return [
      { key: "read", label: "Reads", hint: "looks things up and changes nothing", tools: all.filter((t) => !t.write) },
      { key: "write", label: "Acts in the workspace", hint: "posts, creates or changes things as you", tools: all.filter((t) => t.write) },
    ].filter((g) => g.tools.length > 0)
  }, [toolCatalog])

  // Channels the agent can be scoped to (mention trigger). Only fetched while
  // open. Used to enforce "invited or silent": when channels are picked, the
  // agent only answers @mentions in those channels.
  const { data: channelsData } = useFetch<ChannelInfoListInterfaceResp>(
    open ? GetEndpointUrl.GetAllActiveChannelList : "",
  )
  const channels: ChannelInfoInterface[] = React.useMemo(
    () => channelsData?.channels_list || [],
    [channelsData],
  )

  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [instructions, setInstructions] = React.useState("")
  const [modelPref, setModelPref] = React.useState<string>("")
  const [tools, setTools] = React.useState<Set<string>>(new Set())
  const [triggerType, setTriggerType] = React.useState<AgentTriggerType>("manual")
  // Trigger configuration (per type).
  const [scheduleMinutes, setScheduleMinutes] = React.useState(60)
  // Schedule mode: "interval" (every N minutes) or "clock" (a recurrence + time
  // of day, e.g. weekdays at 9am). Clock mode maps to the backend's RRULE-lite.
  const [scheduleMode, setScheduleMode] = React.useState<"interval" | "clock">("interval")
  const [scheduleDays, setScheduleDays] = React.useState<"daily" | "weekdays" | "custom">("weekdays")
  const [scheduleWeekdays, setScheduleWeekdays] = React.useState<Set<string>>(new Set(["MO", "WE", "FR"]))
  const [scheduleTime, setScheduleTime] = React.useState("09:00")
  const [eventType, setEventType] = React.useState(EVENT_TRIGGER_OPTIONS[0].value)
  // "A task's status changes": which moves. Unnarrowed, the agent runs on every move.
  const [taskMove, setTaskMove] = React.useState<TaskMoveFilter>(ANY_MOVE)
  const { data: projectListData } = useFetch<{ data: { user_projects?: ProjectInfoInterface[] } }>(
    open ? GetEndpointUrl.GetUserProjectList : "",
  )
  const moveProjects = (projectListData?.data?.user_projects ?? []).filter((p) => isZeroEpoch(p.project_deleted_at || ""))
  const [mentionHandle, setMentionHandle] = React.useState("")
  const [mentionChannelIds, setMentionChannelIds] = React.useState<Set<string>>(new Set())
  // Knowledge sources: channels the agent is always grounded on (read as the
  // owner at run time). v1 surfaces channels; the BE also accepts docs/projects.
  const [knowledgeChannelIds, setKnowledgeChannelIds] = React.useState<Set<string>>(new Set())
  // Reusable skills attached to this agent (composed into its prompt).
  const [skillIds, setSkillIds] = React.useState<Set<string>>(new Set())
  const [skills, setSkills] = React.useState<AgentSkill[]>([])
  // The library editor is where a skill's text, its blast radius and its
  // history live. Kept out of this dialog because editing a SHARED skill is a
  // different act from choosing which ones this one agent uses.
  const [libraryOpen, setLibraryOpen] = React.useState(false)
  const [newSkillName, setNewSkillName] = React.useState("")
  const [newSkillBody, setNewSkillBody] = React.useState("")
  const [addingSkill, setAddingSkill] = React.useState(false)
  const [maxSteps, setMaxSteps] = React.useState(8)
  const [maxDailyTokens, setMaxDailyTokens] = React.useState(0)
  const [isActive, setIsActive] = React.useState(true)
  const [dmAble, setDmAble] = React.useState(false)
  // run_in_background is no longer a choice a person has to make: a teammate with
  // tools now runs its @mentions durably by default (live status in the thread,
  // stoppable, steerable mid-run), which is what this switch used to opt into. The
  // value is still carried so an agent saved with it stays exactly as configured —
  // one fewer decision in the builder, no behaviour change to existing agents.
  const [runInBackground, setRunInBackground] = React.useState(false)
  // A remote brain (AG-UI). The secret field is write-only: it starts blank
  // even when one is stored, and blank on save keeps what is stored.
  const [aguiEndpoint, setAguiEndpoint] = React.useState("")
  const [remoteProtocol, setRemoteProtocol] = React.useState<RemoteProtocol>("agui")
  const [aguiAuthHeader, setAguiAuthHeader] = React.useState("")
  const [aguiAuthSecret, setAguiAuthSecret] = React.useState("")
  const [aguiChecking, setAguiChecking] = React.useState(false)
  const [aguiCheck, setAguiCheck] = React.useState<RemoteBrainResult | null>(null)
  const [aguiSecretError, setAguiSecretError] = React.useState<string | null>(null)
  const aguiSecretRef = React.useRef<HTMLInputElement>(null)
  const advancedRef = React.useRef<HTMLDetailsElement>(null)
  // A stored secret is bound to the address it was given for: moving the
  // address, the protocol or the header without entering it again would carry
  // it somewhere new, which the server refuses. So the field asks for it then.
  const remoteSecretMustBeEntered =
    !!agent &&
    (!!agent.agui_auth_set || !!agent.agui_auth_unreadable) &&
    aguiEndpoint.trim() !== "" &&
    secretMoves(
      { url: agent.agui_endpoint || "", how: remoteSecretHow(agent.remote_protocol, agent.agui_auth_header) },
      { url: aguiEndpoint.trim(), how: remoteSecretHow(remoteProtocol, aguiAuthHeader) },
    )
  const remoteSecretMissing = remoteSecretMustBeEntered && !aguiAuthSecret.trim()
  /** Says, under the secret, that it must be entered again, and goes there. */
  const askForRemoteSecret = React.useCallback(() => {
    setStep("where")
    if (advancedRef.current) advancedRef.current.open = true
    setAguiSecretError(secretReentryHint("secret"))
    window.setTimeout(() => aguiSecretRef.current?.focus(), 0)
  }, [])

  /**
   * Try the endpoint now, so a wrong address or a stale secret is a sentence
   * on this screen rather than a failed run somebody finds later. An existing
   * agent is tested without retyping its secret: the stored one is used when
   * the field is left blank, because the client never sees it.
   */
  const handleCheckRemote = React.useCallback(async () => {
    if (remoteSecretMissing) {
      askForRemoteSecret()
      return
    }
    setAguiChecking(true)
    setAguiCheck(null)
    try {
      setAguiCheck(
        await checkRemoteBrain({
          endpoint: aguiEndpoint.trim(),
          auth_header: aguiAuthHeader.trim(),
          auth_secret: aguiAuthSecret,
          agent_id: agent?.id,
          protocol: remoteProtocol,
        }),
      )
    } catch (e) {
      const msg = (e as { response?: { data?: { msg?: string } } })?.response?.data?.msg
      setAguiCheck({ ok: false, error: msg || "The check could not be run." })
    } finally {
      setAguiChecking(false)
    }
  }, [aguiEndpoint, aguiAuthHeader, aguiAuthSecret, agent?.id, remoteProtocol, remoteSecretMissing, askForRemoteSecret])
  const [ambient, setAmbient] = React.useState(false)
  const [ambientKeywords, setAmbientKeywords] = React.useState("")
  const [autonomy, setAutonomy] = React.useState<"auto" | "approval" | "plan">("auto")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<{ name?: string; instructions?: string }>({})
  const nameRef = React.useRef<HTMLInputElement>(null)
  const instructionsRef = React.useRef<HTMLTextAreaElement>(null)

  // Natural-language "describe your agent" drafting (create mode only).
  const [describePrompt, setDescribePrompt] = React.useState("")
  const [drafting, setDrafting] = React.useState(false)

  // Test panel
  const [testPrompt, setTestPrompt] = React.useState("")
  const [dryRun, setDryRun] = React.useState(true)
  const [running, setRunning] = React.useState(false)
  const [outcome, setOutcome] = React.useState<AgentRunOutcome | null>(null)

  // Multi-source tool advisory: an agent can hold tools from the built-in
  // catalog AND one or more connected MCP servers. When two enabled tools cover
  // the same capability, the model picks among them by description (which is
  // non-deterministic), so we gently surface when more than one source is
  // active and let the owner curate one lane per capability. Generic: it keys
  // off tool SOURCE, never a hardcoded provider, so it holds for any connector
  // or MCP server.
  const enabledToolSources = React.useMemo(() => {
    const nativeNames = new Set<string>()
    for (const g of toolCatalog) for (const t of g.tools) nativeNames.add(t.name)
    let hasNative = false
    for (const name of tools) {
      if (nativeNames.has(name)) {
        hasNative = true
        break
      }
    }
    const mcpNames = mcpServers
      .filter((s) => parseMcpTools(s).some((t) => tools.has(mcpToolFullName(s, t))))
      .map((s) => s.name)
    return { hasNative, mcpNames }
  }, [toolCatalog, mcpServers, tools])

  const showMultiSourceNote =
    enabledToolSources.mcpNames.length >= 2 ||
    (enabledToolSources.hasNative && enabledToolSources.mcpNames.length >= 1)

  React.useEffect(() => {
    if (!open) return
    void listAgentSkills().then(setSkills).catch(() => setSkills([]))
    if (agent) {
      setName(agent.name)
      setDescription(agent.description || "")
      setInstructions(agent.instructions || "")
      setModelPref(agent.model_pref || "")
      setTools(new Set(parseEnabledTools(agent)))
      setTriggerType(agent.trigger_type)
      const cfg = parseTriggerConfig(agent)
      setScheduleMinutes(cfg.interval_minutes && cfg.interval_minutes > 0 ? cfg.interval_minutes : 60)
      // Hydrate cron-mode fields from a recurrence config, if present.
      if (cfg.recurrence && cfg.recurrence.trim() !== "") {
        setScheduleMode("clock")
        setScheduleTime(utcMinuteToLocalTime(cfg.at_minute_utc ?? 540))
        const byday = (cfg.recurrence.match(/BYDAY=([A-Z,]+)/)?.[1] || "").split(",").filter(Boolean)
        if (!cfg.recurrence.includes("WEEKLY")) {
          setScheduleDays("daily")
        } else if (byday.length === 5 && ["MO", "TU", "WE", "TH", "FR"].every((d) => byday.includes(d))) {
          setScheduleDays("weekdays")
        } else if (byday.length > 0) {
          setScheduleDays("custom")
          setScheduleWeekdays(new Set(byday))
        } else {
          setScheduleDays("daily")
        }
      } else {
        setScheduleMode("interval")
      }
      setEventType(cfg.event || EVENT_TRIGGER_OPTIONS[0].value)
      setTaskMove({ projectId: cfg.project_id || "", toStatus: cfg.to_status || "" })
      setMentionHandle(cfg.handle || "")
      setMentionChannelIds(new Set(parseScope(agent).channel_ids || []))
      setKnowledgeChannelIds(new Set(parseKnowledge(agent).filter((k) => k.type === "channel").map((k) => k.id)))
      setSkillIds(new Set(parseSkillIds(agent)))
      setMaxSteps(agent.max_steps || 8)
      setMaxDailyTokens(agent.max_daily_tokens || 0)
      setIsActive(agent.is_active)
      setDmAble(!!agent.dm_able)
      setAmbient(!!agent.ambient)
      setAmbientKeywords(agent.ambient_keywords || "")
      setRunInBackground(!!agent.run_in_background)
      setAguiEndpoint(agent.agui_endpoint || "")
      setRemoteProtocol(agent.remote_protocol === "a2a" ? "a2a" : "agui")
      setAguiAuthHeader(agent.agui_auth_header || "")
      setAguiAuthSecret("")
      setAguiCheck(null)
      setAutonomy(agent.autonomy === "approval" ? "approval" : agent.autonomy === "plan" ? "plan" : "auto")
    } else {
      setAppliedTemplate(null)
      setName("")
      setDescription("")
      setInstructions("")
      setModelPref("")
      setTools(new Set())
      setTriggerType("manual")
      setScheduleMinutes(60)
      setScheduleMode("interval")
      setScheduleDays("weekdays")
      setScheduleWeekdays(new Set(["MO", "WE", "FR"]))
      setScheduleTime("09:00")
      setEventType(EVENT_TRIGGER_OPTIONS[0].value)
      setTaskMove(ANY_MOVE)
      setMentionHandle("")
      setMentionChannelIds(new Set())
      setKnowledgeChannelIds(new Set())
      setSkillIds(new Set())
      setMaxSteps(8)
      setMaxDailyTokens(0)
      setIsActive(true)
      setDmAble(false)
      setAmbient(false)
      setAmbientKeywords("")
      setRunInBackground(false)
      setAguiEndpoint("")
      setRemoteProtocol("agui")
      setAguiAuthHeader("")
      setAguiAuthSecret("")
      setAguiCheck(null)
      setAutonomy("auto")
    }
    setError(null)
    setOutcome(null)
    setTestPrompt("")
    setDryRun(true)
    setDescribePrompt("")
  }, [open, agent])

  const toggleTool = (t: string) => {
    setTools((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  // A template fills the form exactly (see lib/agentTemplates); the person
  // still reviews every field and saves. Fields a template does not set are
  // reset, so applying one after another never leaves the first one's tools.
  const [appliedTemplate, setAppliedTemplate] = React.useState<AgentTemplate | null>(null)
  const applyTemplate = React.useCallback((t: AgentTemplate) => {
    setAppliedTemplate(t)
    setError(null)
    setName(t.name)
    setDescription(t.description)
    setInstructions(t.instructions)
    setTools(new Set(t.tools))
    setAutonomy(t.autonomy)
    setTriggerType(t.trigger.type)
    if (t.trigger.type === "schedule") {
      const d = scheduleDaysFor(t.trigger.days)
      setScheduleMode("clock")
      setScheduleDays(d.mode)
      if (d.weekdays.length > 0) setScheduleWeekdays(new Set(d.weekdays))
      setScheduleTime(t.trigger.time)
    } else if (t.trigger.type === "event") {
      setEventType(t.trigger.event)
      setTaskMove(ANY_MOVE)
    }
  }, [])

  // Draft the agent from a natural-language description and prefill the form.
  // The human reviews/edits every field before saving — nothing is created.
  const handleDraft = React.useCallback(async () => {
    const p = describePrompt.trim()
    if (!p || drafting) return
    setDrafting(true)
    setError(null)
    try {
      const d = await draftAgent(p)
      setName(d.name || "")
      setDescription(d.description || "")
      setInstructions(d.instructions || "")
      setTools(new Set(d.enabled_tools || []))
      setTriggerType(d.trigger_type || "manual")
      setAutonomy(d.autonomy === "approval" ? "approval" : d.autonomy === "plan" ? "plan" : "auto")
      if (d.max_steps) setMaxSteps(d.max_steps)
      setDmAble(!!d.dm_able)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't draft the agent")
    } finally {
      setDrafting(false)
    }
  }, [describePrompt, drafting])

  const toggleChannel = (id: string) => {
    setMentionChannelIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleKnowledgeChannel = (id: string) => {
    setKnowledgeChannelIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSkill = (id: string) => {
    setSkillIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCreateSkill = async () => {
    if (!newSkillName.trim() || !newSkillBody.trim()) {
      toast({ title: "Skill name and instructions are required" })
      return
    }
    setAddingSkill(true)
    try {
      const created = await createAgentSkill({ name: newSkillName.trim(), instructions: newSkillBody.trim() })
      setSkills((prev) => [created, ...prev])
      setSkillIds((prev) => new Set(prev).add(created.id))
      setNewSkillName("")
      setNewSkillBody("")
    } catch {
      // interceptor surfaces the error
    } finally {
      setAddingSkill(false)
    }
  }

  // Reusable channel chip-picker (shared by the mention + schedule triggers).
  // For mention it scopes WHERE the agent answers; for schedule it scopes WHERE
  // it posts its check-in. Both write the agent's scope.channel_ids.
  const renderChannelPicker = (heading: string, hint: string) => (
    <div className="mt-1 grid gap-1.5 border-t pt-2.5">
      <Label className="text-xs">{heading}</Label>
      {channels.length === 0 ? (
        <p className="text-xs text-muted-foreground">No channels available.</p>
      ) : (
        <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
          {channels.map((c) => {
            const on = mentionChannelIds.has(c.ch_uuid)
            return (
              <button
                key={c.ch_uuid}
                type="button"
                aria-pressed={on}
                onClick={() => toggleChannel(c.ch_uuid)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                  on
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {on ? <Check className="h-3 w-3" /> : null}#{c.ch_name}
              </button>
            )
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )

  const buildInput = (): AgentInput => {
    let triggerConfig: Record<string, unknown> | undefined
    let scope: { channel_ids?: string[] } | undefined
    if (triggerType === "schedule") {
      if (scheduleMode === "clock") {
        // Build an RRULE-lite recurrence + UTC fire time from the picked days.
        let recurrence = "FREQ=DAILY"
        if (scheduleDays === "weekdays") {
          recurrence = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
        } else if (scheduleDays === "custom") {
          const days = ORDERED_DAY_TOKENS.filter((d) => scheduleWeekdays.has(d))
          recurrence = days.length > 0 ? `FREQ=WEEKLY;BYDAY=${days.join(",")}` : "FREQ=DAILY"
        }
        triggerConfig = { recurrence, at_minute_utc: localTimeToUtcMinute(scheduleTime) }
      } else {
        triggerConfig = { interval_minutes: Math.max(1, scheduleMinutes || 60) }
      }
      // For a scheduled agent, the picked channels are WHERE it posts its
      // check-in. Empty = it runs silently (acts via tools, posts nothing).
      if (mentionChannelIds.size > 0) scope = { channel_ids: Array.from(mentionChannelIds) }
    } else if (triggerType === "event") {
      triggerConfig = { event: eventType }
      if (eventType === "task.status_changed") {
        if (taskMove.projectId) triggerConfig.project_id = taskMove.projectId
        if (taskMove.toStatus) triggerConfig.to_status = taskMove.toStatus
      }
    } else if (triggerType === "mention") {
      if (mentionHandle.trim()) triggerConfig = { handle: mentionHandle.trim() }
      // Channel scope only applies to the mention trigger ("invited or silent").
      // Empty set = respond anywhere it's mentioned.
      if (mentionChannelIds.size > 0) scope = { channel_ids: Array.from(mentionChannelIds) }
    }
    return {
      name: name.trim(),
      description: description.trim() || undefined,
      instructions: instructions.trim(),
      model_pref: modelPref || undefined,
      enabled_tools: Array.from(tools),
      trigger_type: triggerType,
      trigger_config: triggerConfig,
      scope,
      max_steps: maxSteps,
      max_daily_tokens: maxDailyTokens,
      is_active: isActive,
      dm_able: dmAble,
      ambient,
      ambient_keywords: ambientKeywords.trim(),
      run_in_background: runInBackground,
      autonomy,
      agui_endpoint: aguiEndpoint.trim(),
      remote_protocol: remoteProtocol,
      agui_auth_header: aguiAuthHeader.trim(),
      agui_auth_secret: aguiAuthSecret,
      knowledge: Array.from(knowledgeChannelIds).map((id) => ({
        type: "channel" as const,
        id,
        label: "#" + (channels.find((c) => c.ch_uuid === id)?.ch_name || "channel"),
      })),
      skill_ids: Array.from(skillIds),
    }
  }

  // Said under the field, with the cursor there: a missing name was one red
  // line at the foot of a long dialog.
  const jobIsComplete = () => {
    if (!name.trim()) {
      setStep("job")
      setFieldErrors({ name: "Give your agent a name." })
      window.setTimeout(() => nameRef.current?.focus(), 0)
      return false
    }
    if (!instructions.trim()) {
      setStep("job")
      setFieldErrors({ instructions: "Add instructions so the agent knows what to do." })
      window.setTimeout(() => instructionsRef.current?.focus(), 0)
      return false
    }
    setFieldErrors({})
    return true
  }

  const goNext = () => {
    const i = AGENT_STEPS.findIndex((x) => x.value === step)
    if (step === "job" && !jobIsComplete()) return
    if (i < AGENT_STEPS.length - 1) setStep(AGENT_STEPS[i + 1].value)
  }
  const goBack = () => {
    const i = AGENT_STEPS.findIndex((x) => x.value === step)
    if (i > 0) setStep(AGENT_STEPS[i - 1].value)
  }

  const handleSave = async () => {
    if (!jobIsComplete()) return
    if (remoteSecretMissing) {
      askForRemoteSecret()
      return
    }
    setError(null)
    setSaving(true)
    try {
      if (editing && agent) await updateAgent(agent.id, buildInput())
      else await createAgent(buildInput())
      toast({ title: editing ? `${name.trim()} saved` : `${name.trim()} created` })
      // The agent's birth: its square assembles, then the dialog closes. Rare,
      // and the product's thesis, so it earns a flourish; never under reduced
      // motion, where the dialog closes at once.
      if (!editing && !prefersReducedMotion()) {
        setBorn(name.trim())
        window.setTimeout(onSaved, BIRTH_MS)
        return
      }
      onSaved()
    } catch {
      // axios interceptor surfaces the error toast
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!editing || !agent) {
      toast({ title: "Save the agent first", description: "Create the agent, then test it." })
      return
    }
    setRunning(true)
    setOutcome(null)
    try {
      const res = await runAgent(agent.id, testPrompt.trim(), dryRun)
      setOutcome(res)
    } catch (e) {
      toast({ title: "Couldn't run the test", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
    <SkillLibraryDialog
      open={libraryOpen}
      onClose={() => setLibraryOpen(false)}
      onChanged={() => void listAgentSkills().then(setSkills).catch(() => {})}
      selectedIds={skillIds}
      onToggle={(id, on) =>
        setSkillIds((prev) => {
          const next = new Set(prev)
          if (on) next.add(id)
          else next.delete(id)
          return next
        })
      }
    />
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          {/* The agent's own square (identity), where a tinted group tile was. */}
          <DialogTitle className="flex items-center gap-2.5">
            <span className="size-7 shrink-0">
              <AgentAvatar />
            </span>
            {editing ? "Edit agent" : "New agent"}
          </DialogTitle>
          <DialogDescription>
            Give it instructions and the tools it may use. It acts as you, only within your permissions.
          </DialogDescription>
        </DialogHeader>

        {!editing && !born && (
          <ol data-agent-stepper="" aria-label="Steps" className="grid grid-cols-4 gap-2">
            {AGENT_STEPS.map((x, i) => {
              const at = AGENT_STEPS.findIndex((y) => y.value === step)
              return (
                <li key={x.value} className="agent-step min-w-0" data-reached={i <= at ? "true" : "false"} aria-current={i === at ? "step" : undefined}>
                  <span className="agent-step-bar block" aria-hidden="true" />
                  <span className={`mt-1.5 block truncate text-2xs ${i === at ? "font-medium text-foreground" : "text-muted-foreground"}`}>{x.label}</span>
                </li>
              )
            })}
          </ol>
        )}

        {born ? (
          <div data-agent-born="" className="flex flex-col items-center gap-3 py-10 text-center" aria-live="polite">
            <span className="agent-birth avatar-agent grid size-16 place-items-center rounded-[32%] text-white" data-agent-birth="">
              <Spark className="size-8" />
            </span>
            <p className="text-sm font-medium text-foreground">{born} is ready</p>
          </div>
        ) : (
        <div className="space-y-5">
          {show("job") && (<>
          {!editing && (
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Start from a template</Label>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Agent templates">
                {AGENT_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    title={t.description}
                    aria-pressed={appliedTemplate?.id === t.id}
                    onClick={() => applyTemplate(t)}
                    className={cn(
                      "rounded-sm border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                      appliedTemplate?.id === t.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                    )}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
              {appliedTemplate && (
                <p className="text-xs text-muted-foreground">
                  {appliedTemplate.description} Every field below is filled in; change anything before you save.
                  {appliedTemplate.next ? ` ${appliedTemplate.next}` : ""}
                </p>
              )}
            </div>
          )}
          {!editing && (
            // A note on the sunken surface (design v3 colour budget: hue is for
            // identity). It was the AI group's tint, and orange before that.
            <div className="agent-governance flex-col !gap-2">
              <Label htmlFor="agent-describe" className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Describe your agent
              </Label>
              <Textarea
                id="agent-describe"
                value={describePrompt}
                onChange={(e) => setDescribePrompt(e.target.value)}
                placeholder="Every morning, sum up #standup, open a task for any blocker, then post the summary back…"
                rows={2}
                className="resize-none text-sm"
                disabled={drafting}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-2xs text-muted-foreground">
                  AI drafts the name, instructions, tools, and trigger. You review before saving.
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDraft}
                  disabled={drafting || !describePrompt.trim()}
                  className="shrink-0 gap-1.5"
                >
                  {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {drafting ? "Drafting…" : "Draft with AI"}
                </Button>
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="agent-name">Name</Label>
            <Input
              ref={nameRef}
              id="agent-name"
              value={name}
              aria-invalid={fieldErrors.name ? true : undefined}
              aria-describedby={fieldErrors.name ? "agent-name-error" : undefined}
              onChange={(e) => {
                setName(e.target.value)
                if (fieldErrors.name) setFieldErrors((f) => ({ ...f, name: undefined }))
              }}
              placeholder="Standup summariser…"
              maxLength={120}
              autoComplete="off"
            />
            {fieldErrors.name && <p id="agent-name-error" className="text-xs font-medium text-danger-ink">{fieldErrors.name}</p>}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="agent-desc">Description</Label>
            <Input id="agent-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this agent is for (optional)" maxLength={500} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="agent-instr">Instructions</Label>
            <Textarea
              ref={instructionsRef}
              id="agent-instr"
              value={instructions}
              aria-invalid={fieldErrors.instructions ? true : undefined}
              aria-describedby={fieldErrors.instructions ? "agent-instr-error" : undefined}
              onChange={(e) => {
                setInstructions(e.target.value)
                if (fieldErrors.instructions) setFieldErrors((f) => ({ ...f, instructions: undefined }))
              }}
              placeholder="Its job, its tone, and how it should use its tools: each morning, sum up #standup and open a task for any blocker…"
              className="min-h-[120px] resize-none"
              maxLength={8000}
            />
            {fieldErrors.instructions && (
              <p id="agent-instr-error" className="text-xs font-medium text-danger-ink">{fieldErrors.instructions}</p>
            )}
          </div>

          </>)}
          {show("tools") && (<>
          <div className="grid gap-2">
            <Label>Tools the agent can use</Label>
            <p className="text-xs text-muted-foreground -mt-1">
              Pick only what it needs. Tools marked with a warning take actions in the workspace.
            </p>
            {/* Grouped by what a tool can do (admin §S5): the ones that only
                read, then the ones that act in the workspace as you. They were
                grouped by feature, so a write sat among reads. */}
            <div className="agent-governance flex-col !gap-3" data-tools-by-risk="">
              {toolsByRisk.map((g) => (
                <div key={g.key} data-tool-risk={g.key}>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground">
                    {g.key === "write" ? <AlertTriangle className="h-3.5 w-3.5 text-warning-ink" aria-hidden="true" /> : null}
                    {g.label}
                    <span className="font-normal text-muted-foreground">· {g.hint}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {g.tools.map((t) => {
                      const on = tools.has(t.name)
                      return (
                        <button
                          key={t.name}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleTool(t.name)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                            on ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {on ? <Check className="h-3 w-3" /> : null}
                          {t.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
              {toolCatalog.filter((g) => g.note).map((g) => (
                <p key={g.group} className="text-2xs text-muted-foreground">
                  <span className="font-medium text-foreground">{g.group}:</span> {g.note}
                </p>
              ))}
            </div>
          </div>

          {mcpServers.length > 0 && (
            <div className="grid gap-2">
              <Label>MCP tools</Label>
              <p className="text-xs text-muted-foreground -mt-1">
                Tools from connected MCP servers. These call external systems.
              </p>
              <McpToolRiskLegend className="-mt-0.5" />
              <div className="space-y-3 rounded-xl border p-3">
                {mcpServers.map((s) => (
                  <div key={s.id}>
                    <div className="mb-1.5 text-xs font-medium text-muted-foreground">{s.name}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {parseMcpTools(s).map((t) => {
                        const full = mcpToolFullName(s, t)
                        const on = tools.has(full)
                        return (
                          <button
                            key={full}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggleTool(full)}
                            title={t.description || t.name}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                              on ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {on ? <Check className="h-3 w-3" /> : null}
                            {t.name}
                            <McpToolRiskBadge tool={t} compact />
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showMultiSourceNote && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning-ink" />
              <span>
                This agent uses tools from multiple sources
                {(() => {
                  const parts: string[] = []
                  if (enabledToolSources.hasNative) parts.push("built-in")
                  parts.push(...enabledToolSources.mcpNames)
                  return parts.length ? ` (${parts.join(", ")})` : ""
                })()}
                . When two tools do the same thing, the agent may pick either. Keep one source per capability for predictable behaviour.
              </span>
            </div>
          )}

          </>)}
          {show("where") && (<>
          <div className="grid gap-2">
            <Label id="agent-trigger-label">Trigger</Label>
            {/* Single choices are the house segmented control, here and below:
                they were rows of bordered chips with the choice in the accent. */}
            <SegmentedControl
              aria-labelledby="agent-trigger-label"
              value={triggerType}
              onValueChange={setTriggerType}
              options={TRIGGER_OPTIONS}
              className="w-fit"
            />
            <p className="text-xs text-muted-foreground">{TRIGGERS.find((t) => t.value === triggerType)?.hint}</p>

            {/* Per-trigger configuration */}
            {triggerType === "schedule" && (
              <div className="mt-1 grid gap-2 rounded-lg border bg-muted/30 p-3">
                {/* Opens with its label, as Event ("Run when…") and Mention do:
                    it opened with an unlabelled row of buttons. */}
                <Label id="agent-schedule-mode-label" className="text-xs">When it runs</Label>
                <SegmentedControl
                  aria-labelledby="agent-schedule-mode-label"
                  value={scheduleMode}
                  onValueChange={setScheduleMode}
                  options={SCHEDULE_MODE_OPTIONS}
                  className="w-fit"
                />

                {scheduleMode === "interval" ? (
                  <>
                    <Label id="agent-often-label" className="text-xs">How often should it run?</Label>
                    <SegmentedControl
                      aria-labelledby="agent-often-label"
                      value={String(scheduleMinutes)}
                      onValueChange={(v) => setScheduleMinutes(Number(v))}
                      options={PRESET_OPTIONS}
                      className="w-fit"
                    />
                    <div className="flex items-center gap-2">
                      <Label htmlFor="agent-interval" className="text-xs text-muted-foreground">Custom (minutes)</Label>
                      <Input
                        id="agent-interval"
                        type="number"
                        min={1}
                        value={scheduleMinutes}
                        onChange={(e) => setScheduleMinutes(Math.max(1, parseInt(e.target.value || "60", 10) || 60))}
                        className="w-24"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <Label id="agent-days-label" className="text-xs">On which days?</Label>
                    <SegmentedControl
                      aria-labelledby="agent-days-label"
                      value={scheduleDays}
                      onValueChange={setScheduleDays}
                      options={DAY_OPTIONS}
                      className="w-fit"
                    />
                    {scheduleDays === "custom" && (
                      <div className="flex flex-wrap gap-1.5">
                        {WEEKDAY_TOKENS.map((d) => {
                          const on = scheduleWeekdays.has(d.token)
                          return (
                            <button
                              key={d.token}
                              type="button"
                              onClick={() =>
                                setScheduleWeekdays((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(d.token)) next.delete(d.token)
                                  else next.add(d.token)
                                  return next
                                })
                              }
                              className={cn(
                                "rounded-md border px-2 py-1 text-2xs font-medium transition-colors",
                                on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {d.label}
                            </button>
                          )
                        })}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Label htmlFor="agent-time" className="text-xs text-muted-foreground">At (your local time)</Label>
                      <Input
                        id="agent-time"
                        type="time"
                        value={scheduleTime}
                        onChange={(e) => setScheduleTime(e.target.value || "09:00")}
                        className="w-32"
                      />
                    </div>
                  </>
                )}
                {renderChannelPicker(
                  "Post the check-in to channels",
                  mentionChannelIds.size > 0
                    ? "Its scheduled update is posted to the selected channels (as the agent, badged AI)."
                    : "Pick channels to post its scheduled update there. Leave empty and it runs silently: it can still act via its tools but posts nothing.",
                )}
              </div>
            )}

            {triggerType === "event" && (
              <div className="mt-1 grid gap-2 rounded-lg border bg-muted/30 p-3">
                <Label className="text-xs">Run when…</Label>
                {WITHDRAWN_EVENT_LABELS[eventType] && (
                  <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-muted-foreground">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning-ink" />
                    <span className="text-pretty">
                      This agent was set to run when “{WITHDRAWN_EVENT_LABELS[eventType]}”. GitHub events no longer
                      set off agents: anyone who can write on the repository writes what they carry, so an agent can't
                      safely act on them. It doesn't run on this event any more. Choose another event below, or have it
                      run when mentioned or on a schedule.
                    </span>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {EVENT_TRIGGER_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={eventType === o.value}
                      onClick={() => setEventType(o.value)}
                      className={cn(
                        "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                        eventType === o.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                {eventType === "task.status_changed" && (
                  <>
                    <TaskMoveFilterFields value={taskMove} onChange={setTaskMove} projects={moveProjects} />
                    <p className="text-xs text-muted-foreground text-pretty">
                      Each run is a model call. Pick the project and status it is for, or it runs on every status change in the workspace.
                    </p>
                  </>
                )}
              </div>
            )}

            {triggerType === "mention" && (
              <div className="mt-1 grid gap-2 rounded-lg border bg-muted/30 p-3">
                <Label htmlFor="agent-handle" className="text-xs">Handle to listen for (optional)</Label>
                <Input
                  id="agent-handle"
                  value={mentionHandle}
                  onChange={(e) => setMentionHandle(e.target.value)}
                  placeholder={name.trim() ? `Defaults to @${name.trim()}` : "Defaults to the agent's name"}
                  maxLength={60}
                />
                <p className="text-xs text-muted-foreground">
                  The agent runs when this handle is @typed in a channel message. Leave blank to use the agent's name.
                </p>

                {/* This picker writes scope.channel_ids, which does TWO things: it gates
                    where the agent answers a mention, and it confines where the agent may
                    act with its tools — in the app and through any API token bound to it.
                    The copy used to describe only the first, which understated it. */}
                {renderChannelPicker(
                  "Limit to channels (optional)",
                  mentionChannelIds.size > 0
                    ? "The agent only answers @mentions in the selected channels, and can only act in them: including through an API token bound to it."
                    : "Leave empty and the agent answers @mentions anywhere it's added, and can act wherever you can. Pick channels to keep it from being pulled into others.",
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} id="agent-active" />
            <Label htmlFor="agent-active">Active</Label>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-xl border bg-muted/30 p-3">
            <div className="grid gap-1">
              <Label htmlFor="agent-dmable" className="flex items-center gap-2">
                Direct messages
              </Label>
              <p className="text-xs text-muted-foreground">
                Let members start a 1:1 DM with this agent. It replies as its own badged AI
                teammate, separate from the shared OneCamp AI. Turn off to hide it from the DM
                people picker.
              </p>
            </div>
            <Switch checked={dmAble} onCheckedChange={setDmAble} id="agent-dmable" />
          </div>

          <div className="grid gap-2 rounded-xl border bg-muted/30 p-3">
            <Label>Skills</Label>
            <p className="text-xs text-muted-foreground -mt-1">
              Reusable instructions the agent follows. Define once, attach to many agents; edits apply everywhere.
            </p>
            <button
              type="button"
              onClick={() => setLibraryOpen(true)}
              className="self-start text-2xs text-primary underline-offset-2 hover:underline"
            >
              Edit the skill library
            </button>
            {skills.length > 0 && (
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {skills.map((s) => {
                  const on = skillIds.has(s.id)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleSkill(s.id)}
                      title={
                        s.agent_count > 1
                          ? `Used by ${s.agent_count} agents. Editing it changes all of them.\n\n${s.instructions}`
                          : s.instructions
                      }
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {on ? <Check className="h-3 w-3" /> : null}{s.name}
                      {s.agent_count > 1 && (
                        <span className="text-2xs opacity-60">{s.agent_count}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
            <div className="grid gap-1.5 rounded-lg bg-background/60 p-2">
              <Input
                value={newSkillName}
                onChange={(e) => setNewSkillName(e.target.value)}
                placeholder="New skill name, e.g. 'How we write status updates'"
                maxLength={120}
                className="text-sm"
              />
              <Textarea
                value={newSkillBody}
                onChange={(e) => setNewSkillBody(e.target.value)}
                placeholder="The reusable instructions for this skill…"
                className="min-h-[60px] resize-none text-sm"
                maxLength={8000}
              />
              <Button size="sm" variant="outline" onClick={handleCreateSkill} disabled={addingSkill} className="justify-self-start gap-1.5">
                {addingSkill ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add skill
              </Button>
            </div>
          </div>

          <div className="grid gap-2 rounded-xl border bg-muted/30 p-3">
            <Label>Knowledge sources</Label>
            <p className="text-xs text-muted-foreground -mt-1">
              Channels the agent always reads for context, grounded in what its owner can see. Optional.
            </p>
            {channels.length === 0 ? (
              <p className="text-xs text-muted-foreground">No channels available.</p>
            ) : (
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {channels.map((c) => {
                  const on = knowledgeChannelIds.has(c.ch_uuid)
                  return (
                    <button
                      key={c.ch_uuid}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleKnowledgeChannel(c.ch_uuid)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {on ? <Check className="h-3 w-3" /> : null}#{c.ch_name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="grid gap-2 rounded-xl border bg-muted/30 p-3">
            <Label className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-warning-ink" /> Autonomy for write actions
            </Label>
            <p className="text-xs text-muted-foreground -mt-1">
              How much this agent may do on its own. Reading and thinking always run automatically;
              this only governs actions that change the workspace (create a task, post a message…).
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                {
                  value: "auto" as const,
                  title: "Act autonomously",
                  desc: "The agent performs its actions itself, within its tools, scope and permissions.",
                },
                {
                  value: "approval" as const,
                  title: "Require approval",
                  desc: "The agent proposes each write for a human to approve; it then runs as the owner. (90/10)",
                },
                {
                  value: "plan" as const,
                  title: "Plan, then approve",
                  desc: "The agent proposes its whole plan as one approval; approve once and all steps run as the owner.",
                },
              ]).map((opt) => {
                const on = autonomy === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAutonomy(opt.value)}
                    className={cn(
                      "rounded-lg border p-2.5 text-left transition-colors",
                      on ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-accent",
                    )}
                  >
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      {on ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                      {opt.title}
                    </div>
                    <p className="mt-0.5 text-2xs text-muted-foreground">{opt.desc}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Advanced — one collapsed section instead of five more fields in the
              scroll. Creating a useful agent needs a name, instructions, tools, a
              trigger and an autonomy level; everything here has a sensible default
              and most agents never need it. Native <details> so it costs no state
              and keeps its open/closed position while the dialog is open. */}
          <details ref={advancedRef} className="group rounded-xl border bg-muted/20">
            <summary className="flex cursor-pointer select-none items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
              Advanced
            </summary>
            <div className="grid gap-4 border-t border-border/60 p-3">
              <div className="grid gap-2">
                <Label htmlFor="agent-model">Model</Label>
                <Select
                  value={modelPref || "__default__"}
                  onValueChange={(v) => setModelPref(v === "__default__" ? "" : v)}
                >
                  <SelectTrigger id="agent-model">
                    <SelectValue placeholder="Workspace default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">Workspace default</SelectItem>
                    {usableModels.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label || m.model} · {m.provider_label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="-mt-1 text-xs text-muted-foreground">
                  Leave on the workspace default unless this agent needs a specific provider/model.
                  Cloud models are blocked while local-only AI mode is on.
                  {aguiEndpoint.trim() && " Ignored while a remote agent is set below."}
                </p>
              </div>

              {/* A remote brain. The agent's reasoning happens at an AG-UI endpoint
                  (LangGraph, CrewAI, Mastra, an OpenBot bot, anything that speaks
                  it) or at another organisation's A2A agent; this workspace
                  supplies the identity, the reach, the rules and the record.
                  Every call the remote asks for passes the same checks as any
                  agent's, which is the whole reason this is a field on an agent
                  rather than a separate kind of thing. */}
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="agent-agui-endpoint">Remote agent</Label>
                  {/* Two ways in. AG-UI: the remote reasons and this workspace runs
                      its tools. A2A: another organisation's agent takes the whole
                      task and answers; it is given no tools here. */}
                  <ToggleGroup
                    type="single"
                    size="sm"
                    variant="outline"
                    value={remoteProtocol}
                    onValueChange={(v) => {
                      if (v === "agui" || v === "a2a") {
                        setRemoteProtocol(v)
                        setAguiCheck(null)
                      }
                    }}
                    aria-label="Protocol"
                  >
                    <ToggleGroupItem value="agui" className="h-7 px-2.5 text-xs">AG-UI</ToggleGroupItem>
                    <ToggleGroupItem value="a2a" className="h-7 px-2.5 text-xs">A2A</ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <Input
                  id="agent-agui-endpoint"
                  placeholder={
                    remoteProtocol === "a2a"
                      ? "https://agents.example.com (or its agent card URL)"
                      : "https://bots.example.com/ag-ui"
                  }
                  value={aguiEndpoint}
                  onChange={(e) => setAguiEndpoint(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
                {aguiEndpoint.trim() !== "" && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="grid gap-1">
                      <Label htmlFor="agent-agui-header" className="text-xs">Auth header</Label>
                      <Input
                        id="agent-agui-header"
                        placeholder="Authorization (Bearer)"
                        value={aguiAuthHeader}
                        onChange={(e) => setAguiAuthHeader(e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="agent-agui-secret" className="text-xs">
                        Secret
                        {remoteSecretMustBeEntered && <span className="ml-0.5 text-muted-foreground" aria-hidden="true">*</span>}
                      </Label>
                      <Input
                        ref={aguiSecretRef}
                        id="agent-agui-secret"
                        type="password"
                        required={remoteSecretMustBeEntered}
                        aria-invalid={aguiSecretError ? true : undefined}
                        aria-describedby={remoteSecretMustBeEntered ? "agent-agui-secret-note" : undefined}
                        placeholder={
                          remoteSecretMustBeEntered
                            ? "Enter it again for the new address"
                            : agent?.agui_auth_set
                              ? "Stored. Leave blank to keep it."
                              : "Optional"
                        }
                        value={aguiAuthSecret}
                        onChange={(e) => {
                          setAguiAuthSecret(e.target.value)
                          if (aguiSecretError) setAguiSecretError(null)
                        }}
                        autoComplete="new-password"
                      />
                      {remoteSecretMustBeEntered && (
                        <p
                          id="agent-agui-secret-note"
                          aria-live="polite"
                          className={cn("text-xs text-pretty", aguiSecretError ? "font-medium text-danger-ink" : "text-muted-foreground")}
                        >
                          {aguiSecretError ?? secretReentryHint("secret")}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {aguiEndpoint.trim() !== "" && (
                  /* Under the fields it is about, because that is where somebody acts on
                     it, and one sentence because the Test connection error below carries
                     the detail (which address, which half of the rule) when it matters. */
                  <p className="-mt-1 text-xs text-muted-foreground">
                    Only an agent an admin adds can be on this server&apos;s own network; anywhere else needs https and a secret.{" "}
                    {remoteProtocol === "a2a"
                      ? "Runs send it the conversation it is asked about, not this agent's instructions or knowledge."
                      : "Runs send it this agent's instructions, knowledge and tool results."}
                  </p>
                )}
                {agent?.agui_auth_unreadable && (
                  <p className="text-xs text-danger-ink">
                    The stored secret cannot be read (usually the encryption key changed). Enter it again or the agent cannot run.
                  </p>
                )}
                {aguiEndpoint.trim() !== "" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleCheckRemote}
                      disabled={aguiChecking}
                      className="gap-1.5"
                    >
                      {aguiChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
                      Test connection
                    </Button>
                    {aguiCheck && (
                      <span
                        className={cn(
                          "text-xs",
                          aguiCheck.ok ? "text-success-ink" : "text-danger-ink",
                        )}
                      >
                        {aguiCheck.ok
                          ? "The remote answered" + (aguiCheck.reply ? ": " + aguiCheck.reply : ".")
                          : aguiCheck.error}
                      </span>
                    )}
                  </div>
                )}
                {aguiCheck?.card && <A2ACardSummary card={aguiCheck.card} />}
                {!aguiCheck?.card && remoteProtocol === "a2a" && agent?.remote_card && (
                  <A2ACardSummary card={agent.remote_card} />
                )}
                {aguiCheck?.ok && aguiCheck.tools_asked && aguiCheck.tools_asked.length > 0 && (
                  <p className="-mt-1 text-xs text-muted-foreground">
                    It asked for {aguiCheck.tools_asked.join(", ")} although this check offered none. On a real
                    run it is offered the tools you pick above, and each call is checked before it happens.
                  </p>
                )}
                <p className="-mt-1 text-xs text-muted-foreground">
                  Leave empty to run on this workspace&apos;s model.
                  {aguiEndpoint.trim() !== "" &&
                    (remoteProtocol === "a2a"
                      ? " It answers in this agent's name, only where this agent may speak, and every run is recorded. It is given no tools here, so it cannot change anything in this workspace."
                      : " Its tool calls still pass this workspace's permission, approval and audit checks. What it does on its own machine does not.")}
                </p>
              </div>

              <div className="grid gap-1">
                <Label htmlFor="agent-steps">Max steps per run</Label>
                <Input
                  id="agent-steps"
                  type="number"
                  min={1}
                  max={50}
                  value={maxSteps}
                  onChange={(e) => setMaxSteps(Math.max(1, Math.min(50, parseInt(e.target.value || "8", 10) || 8)))}
                  className="w-24"
                />
              </div>

              <div className="grid gap-1">
                <Label htmlFor="agent-token-cap">Daily token limit</Label>
                <Input
                  id="agent-token-cap"
                  type="number"
                  min={0}
                  step={1000}
                  value={maxDailyTokens}
                  onChange={(e) => setMaxDailyTokens(Math.max(0, parseInt(e.target.value || "0", 10) || 0))}
                  className="w-40"
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground">
                  Caps this teammate&apos;s own AI spend per day, billed to the agent (not its
                  owner&apos;s quota). 0 means no agent cap; the workspace limit still applies.
                  Resets at 00:00 UTC.
                  {aguiEndpoint.trim() !== "" &&
                    " A remote agent's model spend happens on its own account, so this workspace cannot meter it and this limit does not apply. Its step limit still does."}
                </p>
              </div>

              <div className="rounded-xl border bg-background/60 p-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="grid gap-1">
                    <Label htmlFor="agent-ambient" className="flex items-center gap-2">
                      Ambient replies
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Let this teammate reply in its scoped channels without an @mention, when it
                      judges it can add value. Rate-limited per channel, budget-metered, and silent
                      unless genuinely useful.
                    </p>
                  </div>
                  <Switch checked={ambient} onCheckedChange={setAmbient} id="agent-ambient" />
                </div>
                {ambient && (
                  <div className="mt-3 grid gap-1.5">
                    <Label htmlFor="agent-ambient-kw" className="text-xs">
                      Topic keywords (optional)
                    </Label>
                    <Input
                      id="agent-ambient-kw"
                      value={ambientKeywords}
                      onChange={(e) => setAmbientKeywords(e.target.value)}
                      placeholder="billing, refund, invoice"
                    />
                    <p className="text-xs text-muted-foreground">
                      Comma or newline separated. It considers messages that mention these topics
                      (plus any question). Leave blank to only consider questions.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </details>

          </>)}
          {!editing && step === "review" && (
            <div className="space-y-3" data-agent-review="">
              {/* The governance sentence: what it may do, as whom, where, and
                  that it is on the record. A note, not a control. */}
              <div className="agent-governance" data-governance-sentence="">
                <Shield aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-agent" />
                <p className="text-sm text-foreground">{governanceSentence(name.trim() || "This agent", mentionChannelIds.size)}</p>
              </div>
              <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
                <dt className="text-muted-foreground">Job</dt>
                <dd className="line-clamp-2 text-foreground">{description.trim() || instructions.trim().split("\n")[0]}</dd>
                <dt className="text-muted-foreground">Tools</dt>
                <dd className="text-foreground">{tools.size === 0 ? "None, it can only answer" : `${tools.size} ${tools.size === 1 ? "tool" : "tools"}`}</dd>
                <dt className="text-muted-foreground">Runs</dt>
                <dd className="text-foreground">{TRIGGERS.find((t) => t.value === triggerType)?.label ?? triggerType}</dd>
              </dl>
            </div>
          )}
          {error && <p className="text-sm text-danger-ink" role="alert">{error}</p>}

          {/* Test panel (only for saved agents) */}
          {editing && (
            <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
              <Label className="flex items-center gap-1.5">
                <Play className="h-3.5 w-3.5" /> Test this agent
              </Label>
              <Textarea
                value={testPrompt}
                onChange={(e) => setTestPrompt(e.target.value)}
                placeholder="Optional prompt for this test run…"
                className="min-h-[60px] resize-none bg-background text-sm"
              />
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Switch checked={dryRun} onCheckedChange={setDryRun} id="agent-dryrun" />
                  <Label htmlFor="agent-dryrun" className="text-xs">Dry run (no writes)</Label>
                </div>
                <Button size="sm" variant="outline" onClick={handleTest} disabled={running} className="gap-1.5">
                  {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  Run test
                </Button>
              </div>
              {outcome && (
                <div className="rounded-lg border bg-background p-2.5 text-sm">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium">
                    Status: <span className="capitalize">{outcome.status}</span> · {outcome.steps} step{outcome.steps === 1 ? "" : "s"}
                  </div>
                  {outcome.result && <MarkdownMessage content={outcome.result} className="text-sm text-foreground" />}
                  {outcome.error && <p className="text-xs text-danger-ink">{outcome.error}</p>}
                </div>
              )}
              {agent && <AgentEvalSection agentId={agent.id} />}
              {agent && <AgentLearningSection agentId={agent.id} />}
            </div>
          )}
        </div>

        )}

        {!born && (
        <div className="mt-2 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} className="gap-1.5 mr-auto">
            <X className="h-4 w-4" /> Cancel
          </Button>
          {!editing && step !== "job" && (
            <Button variant="outline" onClick={goBack}>
              Back
            </Button>
          )}
          {!editing && step !== "review" ? (
            <Button onClick={goNext} className="gap-1.5">
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {editing ? "Save changes" : "Create agent"}
            </Button>
          )}
        </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  )
}

