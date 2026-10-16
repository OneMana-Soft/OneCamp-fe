"use client"

import useSWR from "swr"
import { docInfoKey } from "@/lib/docCache"
import type { DocInfoInterface, DocInfoResponse } from "@/types/doc"

/**
 * The open doc's own answer, read from the cache the doc's page fills and
 * followed as it changes; never fetched again here (it carries the whole
 * body). The page's pieces (B6) read their look, lock and owner from it.
 */
export function useDoc(docId: string): DocInfoInterface | undefined {
  return useSWR<DocInfoResponse>(docId ? docInfoKey(docId) : null, null).data?.data
}
