"use client"

// ScheduleSendContext: "send this later" for one conversation. The page that
// owns a conversation provides it, because only the page knows how its Send
// builds a message (attachments, reply target, a group that exists only
// locally); scheduling posts that same body. Only the main composers read it,
// so a thread reply or an edit can never be scheduled by accident.

import * as React from "react"

export type ScheduleKind = "channel" | "dm" | "group"

export interface ScheduleSend {
  kind: ScheduleKind
  /** The conversation: channel uuid, the other person's uuid, or the group id. */
  target: string
  /** Schedules the composer's message; resolves true when it was scheduled. */
  schedule: (latestContent: string | undefined, at: Date) => Promise<boolean>
}

export const ScheduleSendContext = React.createContext<ScheduleSend | null>(null)

export const useScheduleSend = () => React.useContext(ScheduleSendContext)
