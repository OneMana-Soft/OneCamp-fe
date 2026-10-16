/**
 * Who can see a table made in a doc. "/table"'s "Create a new table"
 * (docInput.tsx) asks here: a doc the whole workspace can open makes a table
 * the workspace can see; any other doc makes a private one, and so does a doc
 * whose info doesn't say (it fails closed), so nothing typed into the table
 * reaches people the doc wasn't shared with.
 *
 * A private table is its maker's: where the doc embeds it, the doc's other
 * people see "Table unavailable" until it's shown to the workspace, from the
 * table's menu (this web shares a table with no one in particular).
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
