"use client"

// Someone signed in to the workspace, at one of its guest links (calls HU13):
// "Join as Kai Lin" leads, with their face, and goes in as them through the
// member door with the choices made here, so the door joins at once
// (lib/calls/doorJoin); "Join as a guest instead" unfolds the guest's own
// form. Loaded by GuestMeeting only where a member has used the app
// (lib/memberMark), with the session check that says who it is.

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { keepDoorJoin, type DoorChoice } from "@/lib/calls/doorJoin"
import type { SessionMember } from "@/lib/auth/sessionMember"

export { activeMember } from "@/lib/auth/sessionMember"
// The header while this way leads: who joins, with their face, as the member door says it.
export { JoiningAs } from "./joiningAs"

export function MemberWay({ member, href, choice, onGuest }: { member: SessionMember; href: string; choice: DoorChoice; onGuest(): void }) {
  const router = useRouter()
  return (
    <div className="mt-4 flex flex-col gap-1.5" data-member-way="">
      <Button
        size="lg"
        className="w-full"
        onClick={() => {
          keepDoorJoin(href, choice)
          router.push(href)
        }}
      >
        <IdentityMark variant="avatar" size={20} id={avatarSeed(member.name)} label={member.name} className="ring-2 ring-white/70" />
        Join as {member.name}
      </Button>
      <Button variant="ghost" className="w-full" onClick={onGuest}>
        Join as a guest instead
      </Button>
    </div>
  )
}

export type MemberWayView = typeof MemberWay
export type JoiningAsView = typeof import("./joiningAs").JoiningAs
