/**
 * What a doc page asks and sends about access, without loading the sharing
 * service with the doc (it brings the doc tree's service with it, and the doc
 * route's first load must not): the cache keys, as services/docAccessService
 * names them (lib/docs/accessRequests.test.ts holds them equal), and the two
 * writes, loaded when they are made.
 */
import type { DocAccessRequest } from "@/types/docAccess"

/** My access to a doc (services/docAccessService docAccessKey). */
export const docAccessKey = (docId: string) => `/doc/access/${docId}`

/** The requests I answer on a doc, and my own (services/docAccessService accessRequestsKey). */
export const accessRequestsKey = (docId: string) => `/doc/access/requests?doc_uuid=${encodeURIComponent(docId)}`

/** Asks a doc's owner for access. */
export async function requestAccess(docId: string, level: DocAccessRequest["level_wanted"]) {
    const { requestDocAccess } = await import("@/services/docAccessService")
    return requestDocAccess(docId, level)
}

/** Approves or declines a request. */
export async function answerRequest(request: Pick<DocAccessRequest, "id" | "doc_uuid">, answer: { approve: boolean }) {
    const { answerDocAccess } = await import("@/services/docAccessService")
    return answerDocAccess(request, answer)
}
