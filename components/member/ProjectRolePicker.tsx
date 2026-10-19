"use client"

// Someone's role in a project (Work Access, A1): Admin, Member, Commenter or
// Viewer, chosen from their row in the members dialog by the project's admins
// and its team's admins. Anyone else sees the role as a word. The project's
// creator stays one of its admins.

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChevronDown } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { displayNameOf } from "@/lib/personName"
import type { Role } from "@/lib/work/types"
import type { UserProfileDataInterface } from "@/types/user"

export const ROLES: Role[] = ["admin", "member", "commenter", "viewer"]

/** A role's name as the app writes it. */
const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  member: "Member",
  commenter: "Commenter",
  viewer: "Viewer",
}

/** What each role does, in a line, for the picker. */
const ROLE_DETAIL: Record<Role, string> = {
  admin: "Runs the project: its settings and its people.",
  member: "Makes tasks and works on them.",
  commenter: "Reads and comments.",
  viewer: "Reads only.",
}

/** Someone's role as a member list carries it, or as its admin flag says. Pure. */
export function roleOf(member: Pick<UserProfileDataInterface, "user_project_role" | "user_is_admin">): Role {
  return member.user_project_role || (member.user_is_admin ? "admin" : "member")
}

export function ProjectRolePicker({
  member,
  canChange,
  isCreator = false,
  busy = false,
  onChoose,
}: {
  member: UserProfileDataInterface
  /** The reader manages the project's people. */
  canChange: boolean
  /** The project's creator, who stays one of its admins. */
  isCreator?: boolean
  busy?: boolean
  onChoose: (role: Role) => void
}) {
  const role = roleOf(member)
  const name = displayNameOf(member) || "This person"
  if (!canChange || isCreator) {
    return (
      <span
        data-project-role={role}
        title={isCreator && canChange ? "The project's creator stays one of its admins." : ROLE_DETAIL[role]}
        className="inline-flex h-6 items-center rounded-full bg-press px-2 text-meta font-medium text-ink-2"
      >
        {ROLE_LABEL[role]}
      </span>
    )
  }
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          data-project-role={role}
          disabled={busy}
          aria-label={`${name}'s role: ${ROLE_LABEL[role]}`}
          className={cn("h-8 gap-1 px-2 text-ui-sm font-medium text-ink-2 hover:text-ink pointer-coarse:h-11", busy && "opacity-60")}
        >
          {ROLE_LABEL[role]}
          <ChevronDown className="size-3.5 text-ink-3" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-meta text-ink-3">What {name} can do here</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={role} onValueChange={(v) => v !== role && onChoose(v as Role)}>
          {ROLES.map((r) => (
            <DropdownMenuRadioItem key={r} value={r} className="items-start py-1.5 pointer-coarse:min-h-11">
              <span className="flex flex-col">
                <span>{ROLE_LABEL[r]}</span>
                <span className="text-meta text-ink-3">{ROLE_DETAIL[r]}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
