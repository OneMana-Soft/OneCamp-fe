import { app_channel_call, app_chat_call, app_grp_call } from "@/types/paths"
import { callRefOf, type CallKind, type CallRef } from "@/lib/calls/callRef"

const CALL_PATH: Record<CallKind, string> = { channel: app_channel_call, chat: app_chat_call, group: app_grp_call }

/** A conversation's call: its read and the page its Huddle button opens. Pure. */
export function huddleCallOf(at: { kind: CallKind; id: string } | undefined, self: string | undefined): { ref: CallRef; href: string } | null {
  const ref = at ? callRefOf(at.kind, at.id, self) : null
  return at && ref ? { ref, href: `${CALL_PATH[at.kind]}/${at.id}` } : null
}
