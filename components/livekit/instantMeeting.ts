// An instant meeting's way from "Start meeting" to its own page
// (CALL-BUG-17). The host's token and the guest link lived only in the start
// page's state, so leaving, reloading or losing the tab lost both, and the
// host could never get back in. Now the start page hands the first token to
// the meeting's page in memory (it is good for minutes, and a reload asks the
// server for a new one), and the guest link is kept for this tab.

export interface MeetingHandoff {
  hostToken: string
  audio: boolean
  video: boolean
}

const handoffs = new Map<string, MeetingHandoff>()

/** The start page's freshly minted token, for the meeting page it opens next. */
export function handOffMeeting(meetingId: string, handoff: MeetingHandoff): void {
  handoffs.set(meetingId, handoff)
}

/** The hand-off, if this tab just started the meeting. Read in a state initialiser, dropped after mount. */
export function peekMeetingHandoff(meetingId: string): MeetingHandoff | undefined {
  return handoffs.get(meetingId)
}

export function dropMeetingHandoff(meetingId: string): void {
  handoffs.delete(meetingId)
}

const linkKey = (meetingId: string) => `onecamp.meet.link.${meetingId}`

/**
 * The guest link, kept for this tab only (sessionStorage): a reload can still
 * show it, and it never outlives the tab. Elsewhere the host asks for a new
 * one.
 */
export function rememberGuestLink(meetingId: string, link: string): void {
  try {
    window.sessionStorage.setItem(linkKey(meetingId), link)
  } catch {
    /* a private window: the host asks for a new link instead */
  }
}

export function rememberedGuestLink(meetingId: string): string {
  try {
    return window.sessionStorage.getItem(linkKey(meetingId)) || ""
  } catch {
    return ""
  }
}

/** The meeting's page. */
export const meetingPagePath = (meetingId: string) => `/app/meet/m/${encodeURIComponent(meetingId)}`
