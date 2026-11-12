import { appMutate } from "@/lib/swrMutate"
import { inboxFeedKey, INBOX_PAGE_SIZE } from "@/lib/activity/feedPages"
import { GetEndpointUrl } from "@/services/endPoints"
import { recountInbox } from "@/services/unreadCache"

/**
 * Something the Inbox counts arrived live (an activity item, or an urgent
 * OneCamp AI nudge): the badge reads the server's count again (C2), and an
 * open Inbox reads its first page, then marks it seen (C3). Never a blind +1.
 */
export function inboxArrived(): void {
  recountInbox()
  void appMutate(inboxFeedKey(GetEndpointUrl.GetUnifiedActivity, INBOX_PAGE_SIZE))
}
