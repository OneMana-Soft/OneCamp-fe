// Uploading files into Docs & Files (docs F1b): from a New menu, a row's
// "Upload files here", or files dropped on a folder or a page. A file over
// the workspace's limit is refused before a byte goes, saying its size and
// the limit (lib/utils/uploadLimit). The rest go one after another, under one
// toast that counts them as they go and turns into what happened: uploaded,
// or which failed and why. The tree is read again once the batch is done,
// not once a file: each read asks for every level and list again.

import { toast } from "@/hooks/use-toast"
import { clientConfigNow } from "@/lib/clientConfigNow"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { exceedsUploadLimit, uploadLimitMessage } from "@/lib/utils/uploadLimit"
import { uploadDocFile, type UploadPlace } from "@/services/docFilesService"
import { refreshDocGraph } from "@/services/docGraphService"
import type { TreeNodeJSON } from "@/types/docGraph"

/** Why a file can't be uploaded here before it's sent (over the workspace's limit), or null. */
export function tooBig(file: File): string | null {
  const { upload_limit_bytes: bytes, upload_limit_mb: mb } = clientConfigNow()
  return exceedsUploadLimit(file.size, bytes) ? uploadLimitMessage(file.size, mb, file.name) : null
}

const counted = (n: number, one: string) => (n === 1 ? one : `${n} files`)

/**
 * Uploads files into a place (a folder, or a space's top), named where for
 * the toast ("to Contracts"). Answers the nodes made, in order.
 */
export async function uploadFiles(files: readonly File[], place: UploadPlace, where: string): Promise<TreeNodeJSON[]> {
  const fit: File[] = []
  for (const f of files) {
    const why = tooBig(f)
    if (why) toast({ variant: "destructive", title: "Too big to upload", description: why })
    else fit.push(f)
  }
  if (fit.length === 0) return []

  const to = `to ${where}`
  const t = toast({ tone: "loading", title: `Uploading ${counted(fit.length, fit[0].name)}`, description: to })
  const made: TreeNodeJSON[] = []
  const failed: Array<{ file: File; error: unknown }> = []
  for (let i = 0; i < fit.length; i++) {
    const file = fit[i]
    try {
      made.push(
        await uploadDocFile(file, place, {
          onProgress: (pct) => {
            if (fit.length > 1) t.update({ id: t.id, tone: "loading", title: `Uploading ${fit.length} files`, description: `${i + 1} of ${fit.length} ${to} · ${pct}%` })
            else t.update({ id: t.id, tone: "loading", title: `Uploading ${file.name}`, description: `${to} · ${pct}%` })
          },
        }),
      )
    } catch (error) {
      failed.push({ file, error })
    }
  }
  refreshDocGraph()

  if (failed.length === 0) {
    t.update({ id: t.id, tone: "success", title: `Uploaded ${counted(fit.length, fit[0].name)}`, description: to, duration: 4000 })
  } else if (failed.length === 1) {
    t.update({ id: t.id, variant: "destructive", tone: "error", title: `${failed[0].file.name} didn't upload`, description: apiErrorMessage(failed[0].error, "Try again in a moment."), duration: 8000 })
  } else {
    t.update({
      id: t.id,
      variant: "destructive",
      tone: "error",
      title: `${failed.length} of ${fit.length} files didn't upload`,
      description: failed.map((f) => f.file.name).join(", "),
      duration: 8000,
    })
  }
  return made
}
