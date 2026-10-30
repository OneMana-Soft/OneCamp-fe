// What a row of Docs & Files does that no page does (docs F1b): download a
// file's version, open a link in a new tab, copy a link's address, colour
// rows, and put a folder's facts where its page will look for them, so it
// opens as a folder at once and never starts the editor's live session.

import { toast } from "@/hooks/use-toast"
import { copyToClipboard } from "@/hooks/useCopyToClipboard"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import type { CampHue } from "@/lib/campHue"
import { docInfoKey } from "@/lib/docCache"
import { checkLinkUrl } from "@/lib/docs/docNode"
import { appMutate, cachedData } from "@/lib/swrMutate"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { downloadFile } from "@/lib/utils/file/downloadFile"
import { colorDocs, versionFileKey } from "@/services/docFilesService"
import type { TreeNodeJSON } from "@/types/docGraph"

/** Downloads one version of a file, by its attachment, through the doc's file route. */
export async function downloadVersion(fileId: string, version: { attachment_id: string; name: string }): Promise<void> {
  try {
    const res = await axiosInstance.get(versionFileKey(fileId, version.attachment_id), OWN_ERRORS)
    const url = (res.data as { url?: string })?.url
    if (!url) throw new Error("no address")
    await downloadFile(url, version.name)
  } catch (e) {
    toast({ variant: "destructive", title: `${version.name} didn't download`, description: apiErrorMessage(e, "Try again in a moment.") })
  }
}

/**
 * Opens a link's document in a new tab, never this one, and only an https
 * address the shared check passes (the server checked it too).
 */
export function openLink(url: string | undefined | null): void {
  const link = checkLinkUrl(url ?? "")
  if (!link.ok) {
    toast({ variant: "destructive", title: "That link can't be opened", description: link.problem })
    return
  }
  window.open(link.url, "_blank", "noopener,noreferrer")
}

/** Copies a link's own address (not OneCamp's link to the row). */
export async function copyLinkAddress(url: string): Promise<void> {
  if (await copyToClipboard(url)) toast({ title: "Address copied" })
  else toast({ variant: "destructive", title: "The address wasn't copied", description: "Your browser didn't allow it. Copy it from the link instead." })
}

/** Colours rows, and says so if the server refused (the rows are put back as it has them). */
export function setColour(ids: string[], hue: CampHue | null, title?: string): void {
  colorDocs(ids, hue).catch((e) =>
    toast({
      variant: "destructive",
      title: ids.length > 1 ? "Their colour didn't change" : title?.trim() ? `“${title.trim()}” kept its colour` : "Its colour didn't change",
      description: apiErrorMessage(e, "Try again in a moment."),
    }),
  )
}

/**
 * What a folder's (or a file's, a link's) page reads first, from its row: its
 * kind, title and colour, put where the page looks before it asks the server
 * (the doc's info), when nothing is there yet. The page then knows at once
 * that it isn't a page, draws it as what it is, and never opens the editor's
 * live session for it; the server's own answer replaces this as it comes.
 */
export function seedNodeInfo(node: TreeNodeJSON): void {
  if (!node.uuid || !node.node_kind) return
  const key = docInfoKey(node.uuid)
  if (cachedData(key) !== undefined) return
  const data = {
    doc_uuid: node.uuid,
    doc_title: node.title ?? "",
    doc_private: node.private ?? true,
    doc_node_kind: node.node_kind,
    doc_color: node.color,
    doc_link_url: node.link_url,
  }
  void appMutate(key, { msg: "ok", data }, { revalidate: false })
}
