// From My Tasks a new task is yours, or it would vanish from the list it was
// made in. One rule for who it goes to, read by the form as the project is
// picked and again right before a pick that finishes the create sends it.

/**
 * Who a new task goes to: from My Tasks (assignToMe), the person making it
 * when it has nobody yet and they belong to the project picked; otherwise
 * whoever it has, "" for nobody. Pure.
 */
export function myTaskAssignee(opts: {
  assignToMe?: boolean
  selfUUID?: string
  assignee?: string
  project?: { project_members?: { user_uuid: string }[] } | null
}): string {
  const current = opts.assignee ?? ""
  if (!opts.assignToMe || !opts.selfUUID || current) return current
  return opts.project?.project_members?.some((m) => m.user_uuid === opts.selfUUID) ? opts.selfUUID : ""
}
