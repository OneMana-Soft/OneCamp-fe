// What the people running a call can hold for everyone else (calls meet-12,
// zoom-14), as the server names it (model.Holds), in the order their
// switches show. The call server holds sharing, the microphone and the
// camera; the thread's access holds chat; every screen drops a held person's
// reaction. Its own file, with no other import, so the room's metadata reader
// (callState) takes it without the rest of Call Control.

export type CallHold = "share" | "chat" | "react" | "microphone" | "camera"

export const CALL_HOLDS: readonly CallHold[] = ["share", "chat", "react", "microphone", "camera"]

/** The holds a list from the server names, and nothing else. Pure. */
export function holdsOf(raw: unknown): ReadonlySet<CallHold> {
  return new Set(Array.isArray(raw) ? raw.filter((h): h is CallHold => (CALL_HOLDS as readonly unknown[]).includes(h)) : [])
}
