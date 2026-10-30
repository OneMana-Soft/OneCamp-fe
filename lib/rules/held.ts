import type { useToast } from "@/hooks/use-toast"
import { APPROVAL_HELD } from "@/lib/approvalHeld"

/** What a held move's words say before where it goes (business/Approvals). */
const SENT = "Sent for approval: "

/**
 * Says a change the project's status rules held (code "approval", or
 * "status_rule" for a new task whose request couldn't open) in one toast.
 * A request that opened reads "Sent for approval" over the server's words
 * without saying that twice: where the move goes, after where a new task was
 * made ("Made in To do. It moves to In review once it's approved."). Any
 * other words ("It's waiting for approval already.") are the title as they
 * are. A request that opened tells the task's card to read it again. usePost
 * loads it when one comes.
 */
export function sayHeld(toast: ReturnType<typeof useToast>["toast"], said: { code?: string; msg?: string }) {
  const msg = said.msg ?? ""
  const at = msg.indexOf(SENT)
  if (at >= 0) {
    const rest = msg.slice(at + SENT.length)
    toast({ title: "Sent for approval", description: msg.slice(0, at) + rest.charAt(0).toUpperCase() + rest.slice(1) })
  } else {
    toast({ title: msg || "Sent for approval" })
  }
  if (said.code === "approval") dispatchEvent(new Event(APPROVAL_HELD))
}
