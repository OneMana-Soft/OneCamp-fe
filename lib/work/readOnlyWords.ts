// What a selection's bar says of the tasks its reader can't change, and why,
// by each project's own rule (Work Access's project_access), never the old
// "only a project's admins" (PROJECTS-23). Pure.
import type { WorkAccess } from "@/lib/work/types"
import { ruleProject } from "@/lib/work/access"

type Project = { project_uuid?: string; project_name?: string; project_access?: WorkAccess | null }
type ReadOnly = { task_project?: Project | null }

/** Why the reader can't change a project's tasks, by its rule; the plain fact where the read doesn't carry the rule. */
function ruleWords(p: Project | null | undefined): string {
  const name = p?.project_name || "this project"
  const a = p?.project_access
  if (!a) return `You can't change the tasks of ${name}.`
  if (a.role === "viewer") return `In ${name} you can view tasks, not change them.`
  if (a.role === "commenter") return `In ${name} you can comment on tasks, not change them.`
  if (a.edit_tasks === "assigned") return `In ${name} you change only tasks assigned to you.`
  if (a.edit_tasks === "none") return `In ${name} only admins change tasks.`
  return `In ${name} you can't change these tasks.`
}

/**
 * The bar's line for the selected tasks the reader can't change, beside how
 * many they can (editable), and its tip: each project's rule once. A list of
 * one project's tasks gives that project (list), for rows that don't carry
 * the rule, as canEditTask takes it. Null when they can change them all.
 */
export function readOnlyWords(readOnly: ReadOnly[], editable: number, list?: Project | null): { line: string; why: string } | null {
  if (readOnly.length === 0) return null
  const rules = new Map<string, string>()
  for (const t of readOnly) {
    const p: Project | null | undefined = ruleProject(t, list)
    const key = p?.project_uuid ?? ""
    if (!rules.has(key)) rules.set(key, ruleWords(p))
  }
  return {
    line: editable === 0 ? "You can't change these tasks" : `You can't change ${readOnly.length} of these`,
    why: [...rules.values()].join(" "),
  }
}
