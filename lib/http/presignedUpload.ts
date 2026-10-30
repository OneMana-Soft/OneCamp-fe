/**
 * A file sent straight to object storage: the server presigns a PUT, the
 * browser sends the file to it, and the server is told it arrived. Slack's
 * export (slackImportService) and the other imports' files (importService)
 * both go this way, so a multi-GB export never streams through the API.
 */

/** What the server answers a presign with: the PUT to make, and its job. */
interface Presigned {
  job_id: string
  upload_url: string
  headers: Record<string, string>
}

/** What a stopped upload rejects with, the same name fetch and axios use. */
function abortError(): Error {
  const e = new Error("The upload was stopped.")
  e.name = "AbortError"
  return e
}

/**
 * Stream-upload a File directly to MinIO using a presigned PUT URL.
 * Uses XHR (not fetch) for upload progress events, which are still the
 * most cross-browser-reliable way to report progress on multi-GB PUTs.
 */
function uploadToPresignedURL(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const xhr = new XMLHttpRequest()
    // Stop means stop: a multi-GB PUT otherwise runs on after the dialog has
    // given up on it, holding the connection and the bucket's space.
    signal?.addEventListener("abort", () => xhr.abort(), { once: true })
    xhr.open("PUT", url, true)
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v))
    xhr.upload.onprogress = (evt) => {
      if (!onProgress || !evt.lengthComputable) return
      onProgress(Math.round((evt.loaded / evt.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error(`MinIO PUT failed: ${xhr.status} ${xhr.statusText}`))
      }
    }
    xhr.onerror = () => reject(new Error("network error during upload"))
    xhr.onabort = () => reject(abortError())
    xhr.send(file)
  })
}

/**
 * Presign, PUT, finalize, in order, reporting the PUT's progress. Stopped
 * through signal, it rejects with abortError and nothing is finalised.
 */
export async function presignedUpload<P extends Presigned>(
  file: File,
  presign: () => Promise<P>,
  finalize: (p: P) => Promise<void>,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<P> {
  const p = await presign()
  await uploadToPresignedURL(p.upload_url, file, p.headers, onProgress, signal)
  if (signal?.aborted) throw abortError()
  await finalize(p)
  return p
}
