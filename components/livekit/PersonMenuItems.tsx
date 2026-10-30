"use client"

// A person's actions in a call, as their tile's and People row's menu shows
// them: one list (lib/calls/control's personActions), drawn alike, the danger
// last and apart. Loaded when the menu is first wanted (callHosting.tsx).

import * as React from "react"
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { Lock, Mic, MicOff, MicVocal, Monitor, MonitorOff, MonitorUp, Star, StarOff, UserMinus, UserRoundCheck, UserRoundX, VideoOff } from "@/lib/icons"
import type { PersonAction } from "@/lib/calls/control"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"
import { CALL_SURFACE } from "./callSurface"

const ICONS: Partial<Record<string, React.ReactNode>> = {
  "mute:microphone": <MicOff />,
  "mute:camera": <VideoOff />,
  "mute:screen_share": <Monitor />,
  // A request to talk, not a mute: it sits beside "Stop letting them talk" (DESIGN-BUILD-19).
  ask_unmute: <MicVocal />,
  // Letting someone through a hold, and taking it back: the dock's own icons, but taking talk back puts the call's
  // hold on them again, so it draws the lock, never Mute's slashed mic beside it (DESIGN-BUILD-19).
  "allow:microphone": <Mic />,
  "disallow:microphone": <Lock />,
  "allow:share": <MonitorUp />,
  "disallow:share": <MonitorOff />,
  spotlight: <Star />,
  end_spotlight: <StarOff />,
  make_cohost: <UserRoundCheck />,
  remove_cohost: <UserRoundX />,
  remove: <UserMinus />,
}

/** An action's name in ICONS, and its key in the list: what it does, to what, and for a let-through which way. */
function nameOf(a: PersonAction): string {
  if (a.action === "allow") return `${a.on ? "allow" : "disallow"}:${a.what}`
  return a.source ? `${a.action}:${a.source}` : a.action
}

export default function PersonMenuItems({ name, actions, onSelect }: { name: string; actions: PersonAction[]; onSelect: (a: PersonAction) => void }) {
  const safe = actions.filter((a) => !a.danger)
  const danger = actions.filter((a) => a.danger)
  return (
    <DropdownMenuContent align="end" className={cn(CALL_SURFACE, "w-56")}>
      {/* On a phone the menu is a sheet away from the row it came from, so it says whose it is. */}
      <DropdownMenuLabel className="hidden items-center gap-2.5 px-2 pt-1 pb-2 max-sm:flex" data-person-menu-head="">
        <IdentityMark variant="avatar" size={28} id={avatarSeed(name)} label={name} />
        <span className="truncate text-ui-sm font-medium text-[#EEEEF0]">{name}</span>
      </DropdownMenuLabel>
      {safe.map((a) => (
        <DropdownMenuItem key={nameOf(a)} onClick={() => onSelect(a)}>
          {ICONS[nameOf(a)]}
          {a.label}
        </DropdownMenuItem>
      ))}
      {danger.length > 0 && safe.length > 0 ? <DropdownMenuSeparator /> : null}
      {danger.map((a) => (
        <DropdownMenuItem key={a.action} className="text-danger-ink focus:text-danger-ink" onClick={() => onSelect(a)}>
          {ICONS[a.action]}
          {a.label}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  )
}
