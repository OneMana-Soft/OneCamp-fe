"use client"

// The workspace's defaults for projects (Work Access, A1): who changes a
// project's tasks unless the project chooses its own (members, members on the
// tasks assigned to them, or admins only). Workspace admins set it; it saves
// on change, with the saved tick, and a refusal puts the choice back and says
// why. The server records each change.
//
// "Who can make projects" (projects.create.who) is the server's too, but it
// stays off this card until the new-project dialog offers the teams it allows
// (it lists the teams the person runs).

import { useState } from "react"
import { SettingRow, SettingsCard, SettingsCardError, SettingsRowsSkeleton, SettingsSection } from "@/components/ui/settingsSection"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { useSaveStatus } from "@/components/ui/saveStatus"
import { useFetch } from "@/hooks/useFetch"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { appMutate } from "@/lib/swrMutate"
import { ADMIN_POLICIES_KEY, EDIT_WHO, type PolicyInfo } from "@/services/workAccessService"

/** Each row: its policy, its words and its choices, short enough for a segment. */
const ROWS = [
  {
    key: EDIT_WHO,
    label: "Who can change tasks",
    description: "In every project that hasn't chosen its own. Admins always can; viewers and commenters never do.",
    options: [
      { value: "members", label: "Members", title: "Everyone who works in the project changes any of its tasks." },
      { value: "assigned", label: "Their own", title: "Members change the tasks assigned to them, and still add new ones." },
      { value: "admins", label: "Admins", title: "Only a project's admins add and change its tasks." },
    ],
  },
] as const

function PolicyRow({ row, info }: { row: (typeof ROWS)[number]; info: PolicyInfo }) {
  const saved = String(info.value)
  const [pending, setPending] = useState<string | null>(null)
  const { status, run } = useSaveStatus()
  const id = `projects-${row.key.replace(/[^\w-]/g, "-")}`
  const choose = async (next: string) => {
    if (next === saved) return
    setPending(next)
    const held = await run(async () => {
      const res = await axiosInstance.put<{ data: PolicyInfo }>(`${ADMIN_POLICIES_KEY}/${row.key}`, { value: next }, OWN_ERRORS)
      const after = res.data.data
      await appMutate<{ data: PolicyInfo[] }>(
        ADMIN_POLICIES_KEY,
        (d) => (d ? { ...d, data: d.data.map((p) => (p.key === row.key ? after : p)) } : d),
        { revalidate: false },
      )
    })
    setPending(null)
    // What people may do in projects follows the default: the projects
    // they have open are asked again.
    if (held && row.key === EDIT_WHO) void appMutate((k) => typeof k === "string" && k.startsWith("/project/"))
  }
  return (
    <SettingRow label={row.label} description={row.description} controlId={id} status={status}>
      <SegmentedControl
        id={id}
        aria-label={row.label}
        aria-describedby={`${id}-desc`}
        value={pending ?? saved}
        onValueChange={(v) => void choose(v)}
        options={row.options}
        disabled={status.state === "saving"}
      />
    </SettingRow>
  )
}

export default function ProjectsPermissionsCard() {
  const policies = useFetch<{ data: PolicyInfo[] }>(ADMIN_POLICIES_KEY, undefined, undefined, OWN_ERRORS)
  const byKey = new Map((policies.data?.data ?? []).map((p) => [p.key, p]))
  const rows = ROWS.filter((r) => byKey.has(r.key))

  let body: React.ReactNode
  if (!policies.data && !policies.isError) {
    body = (
      <SettingsCard aria-label="Loading the project permissions">
        <SettingsRowsSkeleton rows={2} control="button" />
      </SettingsCard>
    )
  } else if (policies.isError && !policies.data) {
    body = (
      <SettingsCard>
        <SettingsCardError what="the project permissions" onRetry={() => void policies.mutate()} />
      </SettingsCard>
    )
  } else {
    body = (
      <SettingsCard>
        {rows.map((r) => (
          <PolicyRow key={r.key} row={r} info={byKey.get(r.key)!} />
        ))}
      </SettingsCard>
    )
  }

  return (
    <SettingsSection title="Projects" description="The workspace's defaults. A project's admins choose who changes its tasks for that project.">
      {body}
    </SettingsSection>
  )
}
