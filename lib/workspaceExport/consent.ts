/**
 * Whether a doc's owner lets it into the admins' workspace exports
 * (business/ContentIO exportConsent.go), kept per doc while the app runs. It is
 * read as the doc opens (ConsentPrefetch, a session-slot contribution), so the
 * doc's More menu knows straight away whether to offer the switch.
 */

import axiosInstance, { OWN_ERRORS } from '@/lib/axiosInstance'
import { toast } from '@/hooks/use-toast'
import { apiErrorMessage } from '@/lib/utils/apiError'
import { RecentCache } from '@/lib/recentCache'

export const EXPORT_CONSENT_ROUTE = '/doc/exportConsent'

export interface ExportConsent {
  /** Its owner has let it into workspace exports. */
  allowed: boolean
  /** The person asking owns it, so may change that. */
  owner: boolean
  /** It isn't open to everyone in the workspace, so an admin's export takes it only with the owner's yes. */
  private: boolean
}

/** The docs heard about, the most recently opened kept (lib/swrCache's bound). */
const known = new RecentCache<ExportConsent>()
const asking = new Map<string, Promise<void>>()

/** What was heard about a doc; undefined until it has been read. */
export function knownConsent(docId: string): ExportConsent | undefined {
  return known.get(docId)
}

/** Reads a doc's state once at a time. A doc that can't be read keeps no state, so no switch shows. */
export function loadConsent(docId: string): Promise<void> {
  const inFlight = asking.get(docId)
  if (inFlight) return inFlight
  const read = axiosInstance
    .get(EXPORT_CONSENT_ROUTE, { ...OWN_ERRORS, params: { doc_uuid: docId } })
    .then((res) => {
      const consent = res.data?.consent as ExportConsent | undefined
      if (consent) known.set(docId, consent)
    })
    .catch(() => {})
    .finally(() => asking.delete(docId))
  asking.set(docId, read)
  return read
}

/** The owner lets the doc in, or takes it out, and is told which. */
export async function toggleConsent(docId: string): Promise<void> {
  const was = known.get(docId)
  if (!was?.owner) return
  const allow = !was.allowed
  try {
    const res = await axiosInstance.post(EXPORT_CONSENT_ROUTE, { doc_uuid: docId, allow }, OWN_ERRORS)
    known.set(docId, (res.data?.consent as ExportConsent | undefined) ?? { ...was, allowed: allow })
    toast({
      title: allow ? "Admins' workspace exports now include this doc" : "Admins' workspace exports no longer include this doc",
    })
  } catch (err) {
    toast({ title: "Couldn't change that", description: apiErrorMessage(err, 'Check your connection and try again.'), variant: 'destructive' })
  }
}

/** For tests: forget what was heard. */
export function forgetConsents() {
  known.clear()
  asking.clear()
}
