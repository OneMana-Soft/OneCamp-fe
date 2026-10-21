"use client"

// A person's actions in a call, as their tile's and People row's menu shows
// them: one list (lib/calls/control's personActions), drawn alike, the danger
// last and apart. Loaded when the menu is first wanted (callHosting.tsx).

import * as React from "react"
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { MicOff, Monitor, Star, StarOff, UserMinus, UserRoundCheck, UserRoundX, VideoOff } from "@/lib/icons"
import type { PersonAction } from "@/lib/calls/control"
import { cn } from "@/lib/utils/helpers/cn"
import { CALL_SURFACE } from "./callSurface"

const ICONS: Partial<Record<string, React.ReactNode>> = {
  "mute:microphone": <MicOff />,
  "mute:camera": <VideoOff />,
  "mute:screen_share": <Monitor />,
  ask_unmute: <MicOff />,
  spotlight: <Star />,
  end_spotlight: <StarOff />,
  make_cohost: <UserRoundCheck />,
  remove_cohost: <UserRoundX />,
  remove: <UserMinus />,
}

export default function PersonMenuItems({ actions, onSelect }: { actions: PersonAction[]; onSelect: (a: PersonAction) => void }) {
  const safe = actions.filter((a) => !a.danger)
  const danger = actions.filter((a) => a.danger)
  return (
    <DropdownMenuContent align="end" className={cn(CALL_SURFACE, "w-56")}>
      {safe.map((a) => (
        <DropdownMenuItem key={a.action + (a.source ?? "")} onClick={() => onSelect(a)}>
          {ICONS[a.source ? `${a.action}:${a.source}` : a.action]}
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
