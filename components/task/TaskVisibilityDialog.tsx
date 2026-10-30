"use client"

// The "Who can see" dialog (WA2b): a sheet on a phone. Its parts are the
// share dialogs' (AccessCard, ShareTokenInvite, ShareUserRow), so choosing who
// sees a task reads as choosing who sees a doc or a board. Every change is
// saved as it is made, as the share dialogs do, and said if it fails.

import * as React from "react"
import { useCallback, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { Tile } from "@/components/ui/graphics/Tile"
import { AccessCard, GeneralAccessMark, ShareHeading, ShareTokenInvite, ShareUserRow, type ShareRole } from "@/components/dialog/shareParts"
import { useFetch } from "@/hooks/useFetch"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Users } from "@/lib/icons"
import { displayNameOf } from "@/lib/personName"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { restrictionPath, setRestriction, type TaskRestriction } from "@/lib/work/restrictionApi"
import type { UserProfileDataInterface } from "@/types/user"
import type { TaskVisibilityProps } from "@/components/task/TaskVisibility"

const SEE: ShareRole[] = [{ value: "see", label: "Can see" }]

const CHOICES = [
  { value: "project", label: "Everyone in the project", description: "Everyone who can see the project sees it." },
  { value: "people", label: "Only some people", description: "Its project's admins, its assignee, whoever made it and the people you add." },
]

/** The people a search of the project's people finds: by name or address, from two letters. */
export function findPeople(members: UserProfileDataInterface[], q: string): UserProfileDataInterface[] {
  const words = q.trim().toLowerCase()
  if (words.length < 2) return []
  return members.filter((m) => `${displayNameOf(m)} ${m.user_email_id ?? ""}`.toLowerCase().includes(words)).slice(0, 20)
}

export default function TaskVisibilityDialog({
  taskUUID,
  taskName,
  canChange,
  members,
  alwaysIn,
  onChanged,
  onOpenTask,
  onClose,
}: TaskVisibilityProps & { onClose: () => void }) {
  const read = useFetch<{ data: TaskRestriction }>(restrictionPath(taskUUID))
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const now = read.data?.data
  const may = canChange && (now?.can_change ?? true)

  const save = useCallback(
    async (restricted: boolean, people: string[]) => {
      setSaving(true)
      try {
        const got = await setRestriction(taskUUID, restricted, people)
        await read.mutate({ data: got }, { revalidate: false })
        onChanged(got.restricted)
      } catch (e) {
        toast({ title: "Couldn't change who can see this task", description: apiErrorMessage(e, "Nothing changed. Try again."), tone: "error" })
      } finally {
        setSaving(false)
      }
    },
    [taskUUID, read, onChanged, toast],
  )

  const byId = useMemo(() => new Map(members.map((m) => [m.user_uuid, m])), [members])
  const people = now?.people ?? []
  const existing = useMemo(() => new Set([...people, ...alwaysIn]), [people, alwaysIn])
  const search = useCallback(async (q: string) => findPeople(members, q), [members])
  const restricted = !!now?.restricted
  const withTask = now?.restricted_with

  let body: React.ReactNode
  if (read.isError && !now) {
    body = (
      <div className="grid justify-items-start gap-2 py-2" role="alert">
        <p className="text-ui-sm text-ink-2">{apiErrorMessage(read.isError, "Couldn't read who can see this task.")}</p>
        <Button variant="secondary" size="sm" onClick={() => void read.mutate()}>
          Try again
        </Button>
      </div>
    )
  } else if (!now) {
    body = (
      <div className="flex h-24 items-center justify-center text-ink-3" aria-busy="true">
        <Loader2 className="size-4 animate-spin" aria-label="Loading who can see this task" />
      </div>
    )
  } else {
    body = (
      <div className="grid gap-4" data-task-visibility="">
        <AccessCard
          tile={
            restricted ? (
              <GeneralAccessMark value="restricted" />
            ) : (
              <Tile hue="sky" size="md">
                <Users aria-hidden="true" />
              </Tile>
            )
          }
          label={restricted ? CHOICES[1].label : CHOICES[0].label}
          description={
            withTask
              ? "It's kept to the people of the task it's part of."
              : restricted
                ? "Its project's admins, its assignee, whoever made it and the people below."
                : CHOICES[0].description
          }
          options={CHOICES}
          value={restricted ? "people" : "project"}
          disabled={!may || saving}
          onChange={(v) => void save(v === "people", [])}
          aside={saving ? <Loader2 className="size-4 shrink-0 animate-spin text-ink-3" aria-label="Saving" /> : undefined}
        />
        {restricted && withTask ? (
          <Button variant="secondary" size="sm" className="justify-self-start" onClick={() => onOpenTask(withTask)}>
            Open the task it&apos;s part of
          </Button>
        ) : null}
        {restricted && !withTask ? (
          <div className="grid gap-2">
            <ShareHeading>People added</ShareHeading>
            {may ? <ShareTokenInvite search={search} roles={SEE} defaultRole="see" existing={existing} onInvite={async (picked) => save(true, [...people, ...picked.map((u) => u.user_uuid)])} /> : null}
            {people.length === 0 ? (
              <p className="text-ui-sm text-ink-3">{may ? "No one else yet. Add people from the project." : "No one else."}</p>
            ) : (
              <div className="grid">
                {people.map((id) => {
                  const who = byId.get(id) ?? ({ user_uuid: id, user_name: "Someone in the project" } as UserProfileDataInterface)
                  return (
                    <ShareUserRow
                      key={id}
                      user={who}
                      role="see"
                      roles={SEE}
                      canEdit={may && !saving}
                      onRemove={() => void save(true, people.filter((p) => p !== id))}
                    />
                  )
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <ResponsiveDialog
      title="Who can see this task"
      description={taskName}
      onClose={onClose}
      footer={
        <Button variant="ghost" size="sm" onClick={onClose}>
          Done
        </Button>
      }
    >
      {body}
    </ResponsiveDialog>
  )
}
