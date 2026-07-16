/**
 * AI scheduling service — wraps /ai/schedule/*.
 *
 * propose: the assistant finds candidate meeting times that work across the
 * named participants (free/busy aware). confirm: creates the chosen event AS
 * the requester through the normal calendar path. Read-then-approve: nothing
 * is created until the user picks a slot and confirms.
 */

import axiosInstance from "@/lib/axiosInstance"
import { PostEndpointUrl } from "@/services/endPoints"

export interface ScheduleParticipant {
  uuid: string
  name: string
}

export interface ScheduleCandidate {
  start: string // RFC3339 (UTC)
  end: string // RFC3339 (UTC)
  all_free: boolean
  free_count: number
  total: number
}

export interface ScheduleProposeResult {
  enabled: boolean
  duration_mins: number
  candidates: ScheduleCandidate[]
  participants: ScheduleParticipant[]
  unresolved: string[]
  note?: string
}

export interface ScheduleProposeInput {
  title?: string
  participants: string[] // names or uuids
  duration_mins?: number
  window_days?: number
}

export async function proposeSchedule(input: ScheduleProposeInput): Promise<ScheduleProposeResult> {
  // The backend reasons in UTC but gates slots to the requester's local
  // business hours; send the browser's offset so "9-6" means the user's 9-6.
  // JS getTimezoneOffset() returns minutes BEHIND UTC (e.g. IST = -330), so we
  // negate to get "local = UTC + offset".
  const utc_offset_mins = -new Date().getTimezoneOffset()
  const res = await axiosInstance.post(PostEndpointUrl.AISchedulePropose, {
    ...input,
    utc_offset_mins,
  })
  return (
    res.data?.data ?? {
      enabled: false,
      duration_mins: input.duration_mins || 30,
      candidates: [],
      participants: [],
      unresolved: [],
    }
  )
}

export interface ScheduleConfirmInput {
  title: string
  description?: string
  start: string // RFC3339
  end: string // RFC3339
  participant_uuids: string[]
  sync_to_google?: boolean
}

export interface ScheduleConfirmResult {
  event_uuid: string
  title: string
  start: string
  end: string
}

export async function confirmSchedule(input: ScheduleConfirmInput): Promise<ScheduleConfirmResult> {
  const res = await axiosInstance.post(PostEndpointUrl.AIScheduleConfirm, input)
  return res.data?.data as ScheduleConfirmResult
}

// ── Reschedule (calendar intelligence) ─────────────────────────────────────

export interface RescheduleResult {
  enabled: boolean
  event_uuid: string
  title: string
  current_start: string // RFC3339 (UTC)
  current_end: string // RFC3339 (UTC)
  duration_mins: number
  participants: ScheduleParticipant[]
  conflict_count: number // invitees busy at the CURRENT time
  conflicts: string[] // their names
  candidates: ScheduleCandidate[] // proposed alternatives
  note?: string
}

export interface RescheduleInput {
  window_days?: number
  business_start?: number
  business_end?: number
}

// proposeReschedule asks the assistant for better times to move an existing
// event to. Like proposeSchedule it reasons in UTC but gates slots to the
// requester's local business hours, so we send the browser's offset.
export async function proposeReschedule(
  eventUUID: string,
  opts: RescheduleInput = {},
): Promise<RescheduleResult> {
  const utc_offset_mins = -new Date().getTimezoneOffset()
  const res = await axiosInstance.post(PostEndpointUrl.AIScheduleReschedule, {
    event_uuid: eventUUID,
    utc_offset_mins,
    ...opts,
  })
  return (
    res.data?.data ?? {
      enabled: false,
      event_uuid: eventUUID,
      title: "",
      current_start: "",
      current_end: "",
      duration_mins: 30,
      participants: [],
      conflict_count: 0,
      conflicts: [],
      candidates: [],
    }
  )
}

export interface ConfirmRescheduleInput {
  event_uuid: string
  start: string // RFC3339
  end: string // RFC3339
  sync_to_google?: boolean
}

// confirmReschedule moves the event to the chosen slot through the normal
// calendar update path (creator-only, enforced server-side).
export async function confirmReschedule(input: ConfirmRescheduleInput): Promise<ScheduleConfirmResult> {
  const res = await axiosInstance.post(PostEndpointUrl.AIScheduleRescheduleConfirm, input)
  return res.data?.data as ScheduleConfirmResult
}

// ── Pre-meeting prep brief (calendar intelligence) ─────────────────────────

export interface MeetingPrepResult {
  enabled: boolean
  event_uuid: string
  title: string
  brief: string // markdown
  note?: string
}

// meetingPrep asks the assistant for an on-demand prep brief for an upcoming
// event. Read-only; the server grounds the brief only in content the requester
// can already see.
export async function meetingPrep(eventUUID: string): Promise<MeetingPrepResult> {
  const res = await axiosInstance.post(PostEndpointUrl.AISchedulePrep, { event_uuid: eventUUID })
  return (
    res.data?.data ?? {
      enabled: false,
      event_uuid: eventUUID,
      title: "",
      brief: "",
    }
  )
}
