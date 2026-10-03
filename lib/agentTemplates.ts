import type { AgentTriggerType } from "@/services/agentService"

/**
 * Ready-made agents: one click fills the create form, the person reviews it and
 * saves. Notion's Custom Agents taught the market that most people do not start
 * an agent from a blank page; they start from "weekly status report" and adjust.
 *
 * Deterministic on purpose. "Describe your agent" asks a model to draft the
 * form, which is the right tool for something new and the wrong one for a
 * template: the result would vary run to run, and a draft cannot set a schedule.
 * These set every field directly, using only tools from TOOL_CATALOG
 * (agentTemplates.test.ts fails if one is renamed), and only built-in tools, so
 * no template depends on web search, a sandbox or a connected account.
 *
 * Anything that changes the workspace starts on "approval": the agent proposes
 * and a person approves, until its owner decides to trust it.
 */
export interface AgentTemplate {
  id: string
  name: string
  /** One line for the template picker and the agent's description. */
  description: string
  instructions: string
  tools: string[]
  autonomy: "auto" | "approval" | "plan"
  trigger:
    | { type: Extract<AgentTriggerType, "manual" | "mention"> }
    | { type: "schedule"; days: "daily" | "weekdays" | string[]; time: string }
    | { type: "event"; event: string }
  /** Shown under the picker after applying, when the person still has a choice to make. */
  next?: string
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: "weekly-status",
    name: "Weekly status report",
    description: "Every Monday, posts what moved, what is late and what is blocked in each project.",
    instructions:
      "Every Monday morning, write the team's status report. For each project: list the tasks completed in " +
      "the last seven days, the tasks that are overdue (with their owners), and anything marked blocked. " +
      "Keep it under 200 words, lead with what needs a decision, and post it in the channel you are set to " +
      "post in. Never change a task: this report only reads.",
    tools: ["list_projects", "list_project_tasks", "summarize_channel", "send_message"],
    autonomy: "auto",
    trigger: { type: "schedule", days: ["MO"], time: "09:00" },
    next: "Pick the channel it posts in under Trigger.",
  },
  {
    id: "standup-digest",
    name: "Standup digest",
    description: "Each weekday, summarises yesterday's channel and opens a task for every blocker.",
    instructions:
      "Each weekday morning, summarise the last day of conversation in the channel you are set to post in: " +
      "decisions made, open questions, and blockers. For every blocker that names an owner, propose a task " +
      "assigned to them, due in two working days. Post the summary back in the channel, with links to the tasks.",
    tools: ["summarize_channel", "send_message", "create_task", "assign_task", "set_task_due_date", "find_people"],
    autonomy: "approval",
    trigger: { type: "schedule", days: "weekdays", time: "09:30" },
    next: "Pick the channel to summarise under Trigger.",
  },
  {
    id: "overdue-nudger",
    name: "Overdue nudger",
    description: "Each weekday, sends one friendly reminder per person with their overdue tasks.",
    instructions:
      "Each weekday, find tasks that are past their due date. Send each assignee ONE direct message listing " +
      "their overdue tasks with links, and ask whether the date should move. Never message someone who has no " +
      "overdue tasks, never change a task, and skip anyone you already reminded about the same task this week.",
    tools: ["list_projects", "list_project_tasks", "send_dm"],
    autonomy: "approval",
    trigger: { type: "schedule", days: "weekdays", time: "10:00" },
  },
  {
    id: "task-triage",
    name: "New task triage",
    description: "When a task is created, suggests an owner and a due date from who handles similar work.",
    instructions:
      "When a task is created without an owner or a due date, read its project and the similar tasks in it. " +
      "Propose an owner (whoever completed the most similar tasks recently) and a realistic due date, and " +
      "explain the suggestion in one sentence. Do nothing to tasks that already have both.",
    tools: ["read_project", "list_project_tasks", "assign_task", "set_task_due_date", "find_people"],
    autonomy: "approval",
    trigger: { type: "event", event: "task.created" },
  },
  {
    id: "channel-helper",
    name: "Channel Q&A helper",
    description: "Answers @mentions from the workspace's own docs, messages and meetings, with sources.",
    instructions:
      "When someone @mentions you, answer from what the workspace already knows: docs, earlier messages, " +
      "meeting transcripts and the people directory. Quote or link your sources. If the answer is not in " +
      "the workspace, say so plainly and suggest who might know; never guess.",
    tools: ["search_workspace", "read_doc", "summarize_channel", "find_people", "read_meeting_transcript"],
    autonomy: "auto",
    trigger: { type: "mention" },
    next: "Pick the channels it answers in under Trigger, or leave them empty for everywhere it is invited.",
  },
]

/** The schedule fields of the create form for a template's days. Pure. */
export function scheduleDaysFor(days: "daily" | "weekdays" | string[]): {
  mode: "daily" | "weekdays" | "custom"
  weekdays: string[]
} {
  if (days === "daily" || days === "weekdays") return { mode: days, weekdays: [] }
  return { mode: "custom", weekdays: days }
}
