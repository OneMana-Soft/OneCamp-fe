/**
 * Who can see a table made in a doc (D-5). "/table"'s "Create a new table"
 * (docInput.tsx) and "Turn into database" (simple-table/toDatabase.ts) both
 * ask here, so the rule is said once: a doc the whole workspace can open makes
 * a table the workspace can see; any other doc makes a private one, and so
 * does a doc whose info doesn't say (it fails closed), so nothing typed into
 * the table reaches people the doc wasn't shared with.
 *
 * A private table is its maker's (and admins'): where the doc embeds it, the
 * doc's other people see "Table unavailable" until its maker shows it to the
 * workspace (the table's More menu, "Show to the workspace") or sends them a
 * guest link (its Share). A table can't be shared with particular people yet:
 * one that follows the doc's own sharing is C3's (N16).
 */

import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl } from "@/services/endPoints"
import type { Visibility } from "@/services/tableService"

/** The rule, from what a doc's info says: only a doc said not to be private makes a workspace table. */
const visibilityOf = (doc: { doc_private?: boolean } | undefined): Visibility => (doc?.doc_private === false ? "workspace" : "private")

/** The doc's title, and who can see a table made in it, as the doc's page knows them (its info). */
export async function tableForDoc(docId: string): Promise<{ title: string; visibility: Visibility }> {
  const res = await axiosInstance.get(`${GetEndpointUrl.GetDocInfo}/${docId}`)
  const doc = res.data?.data as { doc_title?: string; doc_private?: boolean } | undefined
  return { title: doc?.doc_title?.trim() || "", visibility: visibilityOf(doc) }
}
