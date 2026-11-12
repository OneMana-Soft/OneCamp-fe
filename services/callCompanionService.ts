import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"

// A member's other devices in a call (meet-04), asked by the member pages only
// (CallCompanion, after the green room): a guest has none, so the guest pages never load this.

/** A token for another device of the member in the call whose session is sessionId: the server draws its identity and leaves the microphone and camera out; a refusal is thrown in its own words. */
export async function companionToken(sessionId: string, language?: string): Promise<string> {
  const res = await axiosInstance.post(`/calls/${encodeURIComponent(sessionId)}/companion-token`, { language: language ?? "" }, OWN_ERRORS)
  return (res.data as { data?: { token?: string } } | undefined)?.data?.token ?? ""
}
