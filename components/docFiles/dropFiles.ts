// Files from outside, onto Docs & Files (docs F1b; fluid-06, the cold tree).
// A tree or a drop zone tells a drag carrying files from a row being moved at
// once, and loads what uploads them (./uploads: the workspace's limit, the
// toasts, the service) only when files are on their way: a drag carrying
// files over it, or a file chooser opening. The tree is in every page's
// sidebar, and it carried that code into each page's first load. By the drop
// or the choice, the code is in.

import { toast } from "@/hooks/use-toast"
import { lazyChunk } from "@/lib/loadChunk"
import type { UploadPlace } from "@/services/docFilesService"

const uploads = lazyChunk(() => import("./uploads"))

/**
 * Fetches the upload's code ahead of the drop or the choice that needs it.
 * It never rejects: when the fetch fails, the upload that needs the code
 * fetches it again (uploadLater), and says so if that fails too.
 */
export const prefetchUploads = (): void => uploads.warm()

/** Uploads files into a place, named where for the toast, once the upload's code is in. */
export function uploadLater(files: File[], place: UploadPlace, where: string): void {
  void uploads
    .use(() => toast({ variant: "destructive", title: "Nothing was uploaded", description: "Check your connection and try again." }))
    .then((m) => m && m.uploadFiles(files, place, where))
}
