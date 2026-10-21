import type React from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { SettingsList } from "@/components/ui/settingsSection"
import { NeutralChip } from "@/components/admin/connectParts"
import { EyeOff, Flag, Hash, ListTodo, MessageSquare, PhoneOff, Quote, Shield, Trash2, UserPlus, type LucideIcon } from "@/lib/icons"
import type { WorkflowAction } from "@/services/workflowService"

/**
 * What workflows do, said under the title wherever they are listed: the admin
 * tab's section and the settings page's header.
 */
export const WORKFLOWS_DESCRIPTION =
  "When a message in a channel matches a rule, OneCamp replies or turns it into a task. The switches save as you make them."

/**
 * A workflow said as one sentence with its nouns as tokens (design v3, admin
 * A16): "When [a message in #support] contains ['bug'] → [create a task in Bug
 * triage]". The tokens are neutral 22px chips with an ink-3 glyph (a trigger,
 * a condition and an action are categories, never hues, §1.5) and the arrow
 * is ink-3. The empty state renders an example in the same grammar, so it
 * teaches how a workflow reads before there is one.
 */
export type SentencePart =
  | { kind: "text"; text: string }
  | { kind: "token"; role: "trigger" | "condition" | "action"; text: string; icon?: LucideIcon }
  | { kind: "arrow" }

/** What the sentence needs to name channels and projects; an unknown id reads "a channel". */
export interface SentenceNames {
  channel?: (id: string) => string | undefined
  project?: (id: string) => string | undefined
}

export interface WorkflowSentenceInput {
  trigger_type: string
  channel_id?: string | null
  keywords: string[]
  match_type: "any" | "all"
  actions: WorkflowAction[]
  /** task_status_changed: which moves count. */
  task?: { project_id?: string; to_status?: string }
}

const quote = (s: string) => `‘${s}’`

function actionToken(a: WorkflowAction, names: SentenceNames): SentencePart {
  const project = a.project_id ? names.project?.(a.project_id) : undefined
  const channel = a.target_channel_id ? names.channel?.(a.target_channel_id) : undefined
  switch (a.type) {
    case "reply":
      return { kind: "token", role: "action", icon: MessageSquare, text: "reply in the channel" }
    case "reply_ephemeral":
      return { kind: "token", role: "action", icon: EyeOff, text: "send a private message" }
    case "create_task":
      return { kind: "token", role: "action", icon: ListTodo, text: project ? `create a task in ${project}` : "create a task" }
    case "warn_user":
      return { kind: "token", role: "action", icon: Shield, text: "warn the person" }
    case "delete_message":
      return { kind: "token", role: "action", icon: Trash2, text: "delete the message" }
    case "flag_to_channel":
      return { kind: "token", role: "action", icon: Flag, text: channel ? `flag it to #${channel}` : "flag it for review" }
    default:
      return { kind: "token", role: "action", text: String((a as { type: string }).type) }
  }
}

/** The parts of a workflow's sentence. Pure, so the card and the tests share it. */
export function workflowSentence(w: WorkflowSentenceInput, names: SentenceNames = {}): SentencePart[] {
  const ch = w.channel_id ? names.channel?.(w.channel_id) : undefined
  const parts: SentencePart[] = [{ kind: "text", text: "When" }]
  switch (w.trigger_type) {
    case "user_joined_channel":
      parts.push({ kind: "token", role: "trigger", icon: UserPlus, text: `someone joins ${ch ? `#${ch}` : "a channel"}` })
      break
    case "meeting_ended":
      parts.push({ kind: "token", role: "trigger", icon: PhoneOff, text: `a call in ${ch ? `#${ch}` : "a channel"} ends` })
      break
    case "task_status_changed": {
      const project = w.task?.project_id ? names.project?.(w.task.project_id) : undefined
      parts.push({ kind: "token", role: "trigger", icon: ListTodo, text: `a task in ${project ?? "any project"}` })
      if (w.task?.to_status) {
        parts.push({ kind: "text", text: "moves to" })
        parts.push({ kind: "token", role: "condition", icon: Hash, text: w.task.to_status })
      } else parts.push({ kind: "text", text: "moves" })
      break
    }
    default: {
      const where = ch ? `#${ch}` : w.channel_id ? "a channel" : "any channel"
      parts.push({ kind: "token", role: "trigger", icon: MessageSquare, text: `a message in ${where}` })
      const kw = w.keywords.filter(Boolean)
      if (kw.length > 0) {
        parts.push({ kind: "text", text: "contains" })
        kw.slice(0, 2).forEach((k, i) => {
          if (i > 0) parts.push({ kind: "text", text: w.match_type === "all" ? "and" : "or" })
          parts.push({ kind: "token", role: "condition", icon: Quote, text: quote(k) })
        })
        if (kw.length > 2) parts.push({ kind: "text", text: `+${kw.length - 2}` })
      }
    }
  }
  if (w.actions.length > 0) {
    parts.push({ kind: "arrow" })
    w.actions.slice(0, 2).forEach((a, i) => {
      if (i > 0) parts.push({ kind: "text", text: "and" })
      parts.push(actionToken(a, names))
    })
    if (w.actions.length > 2) parts.push({ kind: "text", text: `+${w.actions.length - 2}` })
  }
  return parts
}

/** One part of the sentence, drawn. */
function Part({ p }: { p: SentencePart }) {
  if (p.kind === "text") return <span>{p.text}</span>
  if (p.kind === "arrow") {
    return (
      <span className="text-ink-3">
        <span aria-hidden="true">→</span>
        <span className="sr-only">then</span>
      </span>
    )
  }
  return (
    <NeutralChip icon={p.icon}>
      <span data-token={p.role}>{p.text}</span>
    </NeutralChip>
  )
}

/**
 * The sentence, drawn: 13px ink-2 words, neutral tokens, an ink-3 arrow. The
 * arrow and what follows it wrap together, so a line never ends on "→".
 */
export function WorkflowSentence({ parts, className, as: Tag = "p" }: { parts: SentencePart[]; className?: string; as?: "p" | "span" }) {
  const items: React.ReactNode[] = []
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (p.kind === "arrow" && i + 1 < parts.length) {
      items.push(
        <span key={i} data-sentence-then="" className="inline-flex items-center gap-1.5">
          <Part p={p} />
          <Part p={parts[i + 1]} />
        </span>,
      )
      i++
      continue
    }
    items.push(<Part key={i} p={p} />)
  }
  return (
    <Tag data-workflow-sentence="" className={className ? `cx-wf-sentence ${className}` : "cx-wf-sentence"}>
      {items}
    </Tag>
  )
}

/** The example the empty state teaches with. */
export const EXAMPLE_SENTENCE: SentencePart[] = workflowSentence(
  {
    trigger_type: "message_posted",
    channel_id: "support",
    keywords: ["bug"],
    match_type: "any",
    actions: [{ type: "create_task", project_id: "triage" }],
  },
  { channel: () => "support", project: () => "Bug triage" },
)

/**
 * The workflows list while it loads, in a loaded row's shape (the name, the
 * sentence of chips, then the count, the switch and ⋯), inside the settings
 * card, so the rows land where the skeleton was.
 *
 * In the card's parts, not the card, so the settings page can draw it before
 * the card has loaded.
 */
export function WorkflowsListSkeleton({ label = "Loading workflows" }: { label?: string }) {
  return (
    <div role="status" aria-label={label}>
      <SettingsList>
        {[0, 1, 2].map((i) => (
          <div key={i} data-workflow-skeleton-row="" aria-hidden="true" className="set-row cx-wf-row">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-40" />
              <div className="flex gap-1.5">
                <Skeleton className="h-[22px] w-36 rounded-sm" />
                <Skeleton className="h-[22px] w-14 rounded-sm" />
                <Skeleton className="h-[22px] w-32 rounded-sm" />
              </div>
            </div>
            <div className="hidden shrink-0 items-center gap-3 sm:flex">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-4 w-7 rounded-full" />
              <Skeleton className="size-8 rounded-md" />
            </div>
          </div>
        ))}
      </SettingsList>
    </div>
  )
}
