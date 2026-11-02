"use client"

/**
 * Who edits a table's rows (V-170), in its Share dialog, for its managers:
 * the shared access card (shareParts AccessCard) with three choices and,
 * while only the people chosen edit, the shared invite box over their rows.
 * Its owner and admins always edit; everyone else who can open the table
 * views and comments. A private table is opened only by its owner and
 * admins, so there is no one to choose. Each choice is the server's at once
 * (POST /tables/{id}/editing); a refusal says why in the server's words.
 */

import * as React from "react"
import { AccessCard, AccessTile, ShareHeading, ShareTokenInvite, ShareUserRow, type ShareRole } from "@/components/dialog/shareParts"
import { Lock, Pencil, ShieldCheck, Users } from "@/lib/icons"
import { searchPeople } from "@/services/docChromeService"
import { setTableEditing, type TableEditingChange } from "@/services/tableEditingService"
import type { TableEditing, TableEditor } from "@/services/tableService"
import type { UserProfileDataInterface } from "@/types/user"

export type EditingMode = "everyone" | "people" | "managers"

const CHOICES: { value: EditingMode; label: string; description: string }[] = [
  { value: "everyone", label: "Everyone who can open it", description: "Everyone who can open the table edits its rows." },
  { value: "people", label: "Only people I choose", description: "The people you choose edit its rows. Everyone else views and comments." },
  { value: "managers", label: "Only managers", description: "Its owner and admins edit its rows. Everyone else views and comments." },
]

const TILES: Record<EditingMode, React.ReactNode> = {
  everyone: <Pencil aria-hidden="true" />,
  people: <Users aria-hidden="true" />,
  managers: <ShieldCheck aria-hidden="true" />,
}

const EDITS: ShareRole[] = [{ value: "edit", label: "Can edit" }]

/**
 * The choice who edits reads as: everyone at the edit level; at comment, the
 * people chosen when there are some, else managers only, unless this dialog
 * has just chosen people and none are picked yet.
 */
export function editingMode(e: TableEditing, picked: EditingMode | null = null): EditingMode {
  if (e.general === "edit") return "everyone"
  if (e.people.length > 0) return "people"
  return picked === "people" ? "people" : "managers"
}

/** The change that makes who edits read as `to`: none when it already does. Managers only ends every chosen person's grant. */
export function editingChange(e: TableEditing, to: EditingMode): TableEditingChange | null {
  if (to === "everyone") return e.general === "edit" ? null : { general: "edit" }
  if (to === "people") return e.general === "comment" ? null : { general: "comment" }
  const remove = e.people.map((p) => p.user_id)
  if (e.general === "comment" && remove.length === 0) return null
  return remove.length ? { general: "comment", remove } : { general: "comment" }
}

/** A chosen person as the shared rows draw people. */
const personOf = (p: TableEditor): UserProfileDataInterface => ({ user_uuid: p.user_id, user_name: p.name, user_email_id: p.email, user_profile_object_key: "" })

export function WhoCanEdit({ tableId, editing: given, isPrivate }: { tableId: string; editing: TableEditing; isPrivate: boolean }) {
  // The server's answer to this dialog's last change, until the bundle brings a newer one.
  const [answer, setAnswer] = React.useState<{ to: TableEditing; over: TableEditing } | null>(null)
  const editing = answer && answer.over === given ? answer.to : given
  const [picked, setPicked] = React.useState<EditingMode | null>(null)
  const mode = editingMode(editing, picked)

  const send = async (change: TableEditingChange): Promise<boolean> => {
    try {
      setAnswer({ to: await setTableEditing(tableId, change), over: given })
      return true
    } catch {
      return false // the interceptor says why, in the server's words
    }
  }
  const choose = async (value: string) => {
    const to = value as EditingMode
    const change = editingChange(editing, to)
    if (!change || (await send(change))) setPicked(to)
  }

  if (isPrivate) {
    return (
      <section className="mb-4 space-y-2" data-who-can-edit="private">
        <ShareHeading>Who can edit</ShareHeading>
        <AccessCard
          tile={
            <AccessTile>
              <Lock aria-hidden="true" />
            </AccessTile>
          }
          label="Only its owner and admins"
          description="Only they open a private table. Share it with the workspace to choose who edits it."
        />
      </section>
    )
  }
  const chosen = new Set(editing.people.map((p) => p.user_id))
  const choice = CHOICES.find((c) => c.value === mode)!
  return (
    <section className="mb-4 space-y-2" data-who-can-edit={mode}>
      <ShareHeading>Who can edit</ShareHeading>
      <AccessCard
        tile={
          <AccessTile key={mode} className="content-pop-in">
            {TILES[mode]}
          </AccessTile>
        }
        label={choice.label}
        description={choice.description}
        options={CHOICES}
        value={mode}
        onChange={(v) => void choose(v)}
      >
        {mode === "people" ? (
          <div className="mt-3 space-y-1" data-editing-people="">
            <ShareTokenInvite
              search={searchPeople}
              roles={EDITS}
              defaultRole="edit"
              existing={chosen}
              onInvite={async (users) => {
                if (!(await send({ add: users.map((u) => u.user_uuid) }))) throw new Error("not added")
              }}
            />
            {editing.people.map((p) => (
              <ShareUserRow key={p.user_id} user={personOf(p)} role="edit" roles={EDITS} canEdit removeLabel="Stop editing" onRemove={() => void send({ remove: [p.user_id] })} />
            ))}
          </div>
        ) : null}
      </AccessCard>
    </section>
  )
}
