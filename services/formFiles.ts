// A public form's files: each file a visitor picks is sent on its own, as it
// is picked (POST /public/form/{token}/file), with the claim the page holds
// once the first one has come back. Plain XMLHttpRequest, never the signed-in
// axios instance, as every public call: fetch can't say how far an upload
// has got.

import type { SentFile } from "@/lib/forms/forms"
import { backendBase, sendFailedText, type PublicResult } from "@/services/publicApi"

/** A file the server kept, and the claim the page sends its form with. */
export interface Uploaded {
  claim: string
  file: SentFile
}

/** Sends one file to a form's question, saying how far it has got (0 to 100); a refusal carries the server's words. */
export function uploadFormFile(token: string, question: string, file: File, claim: string, onProgress: (pct: number) => void, signal?: AbortSignal): Promise<PublicResult<Uploaded>> {
  return new Promise((resolve) => {
    const body = new FormData()
    body.append("question", question)
    if (claim) body.append("claim", claim)
    body.append("file", file, file.name)
    const xhr = new XMLHttpRequest()
    xhr.open("POST", `${backendBase}/public/form/${encodeURIComponent(token)}/file`)
    xhr.setRequestHeader("Accept", "application/json")
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)))
    }
    // In the words every public call fails in (sendFailedText): wait and try
    // again for a busy or unreachable server, or the server's own words.
    const failed = (status: number, msg: string) => resolve({ ok: false, status, msg: sendFailedText({ status, msg }) })
    xhr.onload = () => {
      let parsed: { data?: Uploaded; msg?: string } = {}
      try {
        parsed = JSON.parse(xhr.responseText || "{}")
      } catch {
        // A proxy's page, not ours: said below.
      }
      if (xhr.status >= 200 && xhr.status < 300 && parsed.data) {
        onProgress(100)
        resolve({ ok: true, data: parsed.data })
      } else failed(xhr.status, parsed.msg || (xhr.status === 413 ? "This file is too big to send." : "The file couldn't be sent. Try again."))
    }
    xhr.onerror = () => failed(0, "")
    xhr.onabort = () => failed(0, "Stopped.")
    signal?.addEventListener("abort", () => xhr.abort(), { once: true })
    xhr.send(body)
  })
}
