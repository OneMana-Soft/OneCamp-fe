import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { toast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { PostEndpointUrl } from "@/services/endPoints"
import { apiErrorMessage } from "@/lib/utils/apiError"

// The "weren't told" prompt (D-M9, MC-83), loaded after a send that names
// someone (hooks/useNotToldPrompt), never with the page: it and the toast's
// action are nothing a conversation draws first.

/** The people a message's own chips name, by uuid with their label, each once. Pure. */
export function namedIn(html: string | null | undefined): { uuid: string; name: string }[] {
  const out: { uuid: string; name: string }[] = []
  for (const m of (html || "").matchAll(/<span\b[^>]*\bdata-id="([0-9a-fA-F-]{36})@0x[0-9a-fA-F]+"[^>]*>@?([^<]*)<\/span>/g)) {
    if (!out.some((p) => p.uuid === m[1])) out.push({ uuid: m[1], name: m[2].trim() })
  }
  return out
}

/** The prompt's words for who wasn't told. Pure. */
export function notToldWords(names: string[], channel: string): string {
  const where = channel ? `#${channel}` : "this channel"
  const who = names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
  return `${who} ${names.length === 1 ? "isn't" : "aren't"} in ${where}, so they weren't told.`
}

/**
 * Says who a channel message named that isn't in it, with Add them: who is in
 * the channel is the server's (the "@" list's mentionables); when the list
 * can't say for a large channel, nothing is said. The add is the channel's own
 * Add member, refused in its words where the writer may not.
 */
export async function promptNotTold(channelId: string, channelName: string, html: string | null | undefined) {
  const named = namedIn(html)
  if (!named.length || !channelId) return
  const { mentionablesOf } = await import("@/lib/conversation/mentionables")
  const known = await mentionablesOf({ kind: "channel", id: channelId, thread: false })
  const members = known?.members
  if (!known || !members || members.length < known.count) return
  const inIt = new Set(members.map((id) => id.toLowerCase()))
  const out = named.filter((p) => !inIt.has(p.uuid.toLowerCase()))
  if (!out.length) return
  const add = async () => {
    try {
      for (const p of out) {
        await axiosInstance.post(PostEndpointUrl.AddChannelMember, { channel_id: channelId, user_id: p.uuid }, OWN_ERRORS)
      }
      toast({ title: out.length === 1 ? `${out[0].name} is in #${channelName} now` : `They're in #${channelName} now` })
    } catch (e) {
      toast({ title: "They weren't added", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
    }
  }
  toast({
    title: notToldWords(out.map((p) => p.name), channelName),
    action: <ToastAction altText="Add them to the channel" onClick={() => void add()}>Add them</ToastAction>,
  })
}
