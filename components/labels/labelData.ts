"use client"

// The thin hook a page reads and writes an item's sensitivity label through
// (miro-44 L), with the SWR, axios and toast the page already loads. The lazy
// chip and picker it feeds only present (./labelsPresent.test).

import { useFetch } from "@/hooks/useFetch"
import { toast } from "@/hooks/use-toast"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { appMutate } from "@/lib/swrMutate"
import { asLabel, itemLabelKey, labelsKey, putItemLabel } from "@/lib/labels/labelCore"
import type { LabelCatalogue, LabelCatalogueRead, LabelHttp, LabelKind, Labelling, SensitivityLabel } from "@/lib/labels/labelTypes"

/** The label on an item, shared by every screen that shows it; null while it loads, for a guest or on a failed read (never guessed). */
export function useItemLabel(kind: LabelKind, id: string | null | undefined): SensitivityLabel | null {
  return asLabel(useFetch<{ data?: unknown }>(itemLabelKey(kind, id), undefined, undefined, OWN_ERRORS).data?.data)
}

/** The workspace's labels and the rules they can carry, read once `enabled` (a picker open). */
export function useLabelCatalogue(enabled = true): LabelCatalogueRead {
  const res = useFetch<{ data?: Partial<LabelCatalogue> }>(enabled ? labelsKey : "", undefined, undefined, OWN_ERRORS)
  const data = res.data?.data
  return { catalogue: data ? { labels: data.labels ?? [], rules: data.rules ?? [] } : null, loading: !data && !res.isError, failed: !data && !!res.isError, retry: () => void res.mutate() }
}

/** An item's label for its page: read always, the catalogue once `open`, and the write every reader follows at once. */
export function useLabelling(kind: LabelKind, id: string, open: boolean, http: LabelHttp = axiosInstance): Labelling {
  const save = async (labelId: string | null) => {
    const after = await putItemLabel(http, kind, id, labelId)
    void appMutate(itemLabelKey(kind, id), { data: after }, { revalidate: false })
    toast({ title: after ? `Labelled ${after.name}` : "Label taken off" })
  }
  return { kind, label: useItemLabel(kind, id), labels: useLabelCatalogue(open), save }
}
