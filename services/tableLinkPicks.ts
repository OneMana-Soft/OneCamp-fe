// What a link field's picker lists: a table's rows by name, and the calls a
// member may link (airtable-01). Only the cell pickers' chunk imports it
// (components/table/cellPickers), so no table's first screen carries it.
// Where a linked call opens is services/callPlaceService, the tables page's.

import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { TablesGet } from "@/services/endpoints/tables"

// A table's rows to link to, by name: those whose name holds the text, or the
// first ones when it's empty.
export async function pickRows(tableId: string, q: string): Promise<{ id: string; label: string }[]> {
  const res = await axiosInstance.get(`${TablesGet.PickTableRows}/${tableId}/rows/pick`, { params: { q } })
  return (res.data?.data as { id: string; label: string }[]) || []
}

/** A call the picker lists (business/CallState LinkableCall): its id, its title as the server names it for the reader, and when it started. */
export interface LinkableCall {
  id: string
  title: string
  started_at: string
  conversation_kind: string
}

/** The most calls one listing gives (CallState MaxLinkableCalls). */
export const MAX_LINKABLE_CALLS = 50
/** How many of the reader's newest calls a query reads (CallState: 5 pages of 100). */
export const SEARCHED_CALLS = 500

/** The calls the reader may link, newest first, whose title holds q (all, for ""): GET /calls/linkable. Throws a failed read. */
export async function linkableCalls(q: string): Promise<LinkableCall[]> {
  const res = await axiosInstance.get("/calls/linkable", { ...OWN_ERRORS, params: { q, limit: MAX_LINKABLE_CALLS } })
  const calls = res?.data?.calls
  return Array.isArray(calls) ? (calls as LinkableCall[]) : []
}
