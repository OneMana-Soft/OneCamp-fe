"use client"

// Who can change a project's tasks (Work Access, A1): its members (the
// workspace's default unless an admin chose otherwise), its members on the
// tasks assigned to them, or its admins only; or whatever the workspace has.
// The project's admins choose, and the server records each change. A choice
// shows at once and springs back, with the server's reason, when refused.

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { SavedTick, useSaveStatus } from "@/components/ui/saveStatus"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { appMutate } from "@/lib/swrMutate"
import type { EditWho } from "@/lib/work/types"
import {
  EDIT_WHO,
  EDIT_WHO_CHOICES,
  editWhoLabel,
  projectPoliciesKey,
  setProjectEditWho,
  type PolicyInfo,
} from "@/services/workAccessService"

/** The radio's value for "as the workspace has it". */
const WORKSPACE = "workspace"

/** What the project's choice is, as the radio shows it. Pure. */
export function chosenOf(info?: PolicyInfo): string {
  if (!info) return ""
  return info.is_set ? String(info.value) : WORKSPACE
}

export function ProjectAccessDialog({ projectId, open, onOpenChange }: { projectId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const key = projectPoliciesKey(projectId)
  const policies = useFetch<{ data: PolicyInfo[] }>(open ? key : "", undefined, undefined, OWN_ERRORS)
  const info = policies.data?.data?.find((p) => p.key === EDIT_WHO)
  const [picked, setPicked] = useState<string | null>(null)
  const { status, run } = useSaveStatus()
  const shown = picked ?? chosenOf(info)

  const choose = async (next: string) => {
    setPicked(next)
    const held = await run(async () => {
      const saved = await setProjectEditWho(projectId, next === WORKSPACE ? null : (next as EditWho))
      await appMutate(key, { data: (policies.data?.data ?? []).map((p) => (p.key === EDIT_WHO ? saved : p)) }, { revalidate: false })
    })
    setPicked(null)
    // What each person may do in the project follows the choice: every read
    // of it that carries project_access is asked again.
    if (held) void appMutate((k) => typeof k === "string" && k.includes(projectId) && k !== key)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Who can change tasks
            <SavedTick status={status} />
          </DialogTitle>
          <DialogDescription>
            Admins always can. Viewers and commenters never do. Choose for the members of this project.
          </DialogDescription>
        </DialogHeader>
        {policies.isError && !info ? (
          <p role="alert" className="text-ui-sm text-danger-ink">
            This project&apos;s settings couldn&apos;t be read.{" "}
            <button type="button" className="underline underline-offset-2" onClick={() => void policies.mutate()}>
              Try again
            </button>
          </p>
        ) : (
          <RadioGroup
            value={shown}
            onValueChange={(v) => void choose(v)}
            aria-label="Who can change tasks"
            aria-busy={!info || status.state === "saving"}
            disabled={!info || status.state === "saving"}
            className="gap-0 divide-y divide-line overflow-hidden rounded-lg border border-line"
          >
            {EDIT_WHO_CHOICES.map((c) => (
              <label key={c.value} data-edit-who={c.value} className="flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-hover has-[[data-state=checked]]:bg-brand-muted/40">
                <RadioGroupItem value={c.value} aria-label={c.label} />
                <span className="min-w-0">
                  <span className="block text-ui font-medium text-ink">{c.label}</span>
                  <span className="block text-meta text-ink-3">{c.detail}</span>
                </span>
              </label>
            ))}
            <label data-edit-who={WORKSPACE} className="flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-hover has-[[data-state=checked]]:bg-brand-muted/40">
              <RadioGroupItem value={WORKSPACE} aria-label="As the workspace has it" />
              <span className="min-w-0">
                <span className="block text-ui font-medium text-ink">As the workspace has it</span>
                <span className="block text-meta text-ink-3">
                  {info ? `${editWhoLabel(info.default)}, and it follows if a workspace admin changes it.` : " "}
                </span>
              </span>
            </label>
          </RadioGroup>
        )}
        {status.state === "error" && (
          <p role="alert" className="text-ui-sm text-danger-ink">
            {status.error || "That couldn't be saved."}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
