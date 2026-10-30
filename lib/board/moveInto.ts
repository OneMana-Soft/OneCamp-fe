import type { WorkAccess } from "@/lib/work/types"

/**
 * Whether the project's rules let the reader move a task into status s, and so
 * make one there (project_access.move_into, from a board's read): s's own rule,
 * else its category's, as the server's gate reads them. Yes where neither has
 * one; the server still refuses in words what a rule doesn't allow.
 */
export function mayMoveInto(a: WorkAccess, s: { value: string; category: string }): boolean {
  return a.move_into?.[s.value] ?? a.move_into?.[s.category] ?? true
}
