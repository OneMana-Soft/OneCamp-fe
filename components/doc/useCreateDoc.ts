"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"

import { usePost } from "@/hooks/usePost"
import type { DocTemplate } from "@/lib/docTemplates"
import { PostEndpointUrl } from "@/services/endPoints"
import type { DocInfoInterface } from "@/types/doc"
import { app_doc_path } from "@/types/paths"

/** The title a doc starts with; the editor shows it as the placeholder to type over. */
export const NEW_DOC_TITLE = "Untitled"

/**
 * Makes a doc and opens it (content.md D27): no dialog. A blank doc is
 * "Untitled" and private (who can see it moves to Share), opened with the
 * title ready to type (?new=1). From a template it takes the template's name
 * and opens with ?template=<id> as well. `busy` names what is being made, so
 * the one row can show a spinner and the rest wait.
 */
export function useCreateDoc() {
  const router = useRouter()
  const { makeRequest } = usePost()
  const [busy, setBusy] = useState<string | null>(null)

  const create = useCallback(
    async (template?: DocTemplate) => {
      if (busy) return
      const key = template?.id ?? "blank"
      setBusy(key)
      try {
        const res = await makeRequest<{ doc_title: string; doc_private: boolean }, DocInfoInterface>({
          apiEndpoint: PostEndpointUrl.CreateDoc,
          payload: { doc_title: template?.name ?? NEW_DOC_TITLE, doc_private: true },
        })
        if (res?.doc_uuid) {
          const q = new URLSearchParams({ new: "1" })
          if (template) q.set("template", template.id)
          router.push(`${app_doc_path}/${res.doc_uuid}?${q.toString()}`)
        }
      } finally {
        setBusy(null)
      }
    },
    [busy, makeRequest, router],
  )

  return { create, busy }
}
