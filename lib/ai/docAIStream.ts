/**
 * The doc AI bar's stream (docs programme B9): POST /ai/doc/complete/stream,
 * read with the one SSE reader (lib/ai/sseReader.ts). The server names the
 * model first, then sends the answer as it is written, a "replace" with the
 * clean answer when its cleaning changed what was streamed, a notice when the
 * input was shortened, and "done" (business/AI docAI.go, the controller's
 * header says the frames).
 */

import { authedStreamFetch } from "@/lib/utils/streamFetch"
import { readSSE } from "@/lib/ai/sseReader"
import { PostEndpointUrl } from "@/services/endPoints"
import type { DocAIActionId, DocAIModel } from "@/lib/ai/docAIActions"

/** What an action runs on. */
export interface DocAIRequest {
  action: DocAIActionId
  /** The selection, as Markdown. */
  text?: string
  prompt?: string
  doc_id?: string
  /** The text around the selection, or before the caret. */
  context?: string
  tone?: string
  language?: string
  /** "doc": the whole doc. */
  scope?: "doc"
  /** The doc as Markdown, from the live editor. */
  doc_text?: string
  /** The answer being refined. */
  previous?: string
  project_uuid?: string
}

export interface DocAIProgress {
  step: "reading" | "writing"
  done: number
  of: number
}

export interface DocAIStreamHandlers {
  onModel?(model: DocAIModel): void
  onProgress?(progress: DocAIProgress): void
  /** The answer so far, after each piece. */
  onText?(text: string): void
  onNotice?(notice: string): void
}

export interface DocAIResult {
  /** The whole answer, cleaned. */
  text: string
  model: DocAIModel | null
  notice: string
  /** The person stopped it. */
  stopped: boolean
  /** What went wrong, in words; "" when nothing did. */
  error: string
}

const UNREACHABLE = "Couldn't reach the server. Check your connection and try again."

/** Runs one action, telling handlers as it goes; resolves when it ends, however it ends. */
export async function streamDocAI(req: DocAIRequest, handlers: DocAIStreamHandlers, signal?: AbortSignal): Promise<DocAIResult> {
  const out: DocAIResult = { text: "", model: null, notice: "", stopped: false, error: "" }
  let response: Response
  try {
    response = await authedStreamFetch(PostEndpointUrl.AIDocCompleteStream, { jsonBody: req, signal })
  } catch (e) {
    if (signal?.aborted || (e as Error)?.name === "AbortError") return { ...out, stopped: true }
    return { ...out, error: UNREACHABLE }
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { msg?: string }
    return { ...out, error: body?.msg || "Doc AI couldn't start. Try again in a moment." }
  }
  const reader = response.body?.getReader()
  if (!reader) return { ...out, error: "Doc AI couldn't start. Try again in a moment." }
  let done = false
  try {
    for await (const frame of readSSE(reader)) {
      if (frame.model) {
        out.model = frame.model as DocAIModel
        handlers.onModel?.(out.model)
      }
      if (frame.progress) handlers.onProgress?.(frame.progress as DocAIProgress)
      if (typeof frame.content === "string" && frame.content) {
        out.text += frame.content
        handlers.onText?.(out.text)
      }
      if (typeof frame.replace === "string") {
        out.text = frame.replace
        handlers.onText?.(out.text)
      }
      if (typeof frame.notice === "string" && frame.notice) {
        out.notice = frame.notice
        handlers.onNotice?.(frame.notice)
      }
      if (typeof frame.error === "string" && frame.error) return { ...out, error: frame.error }
      if (frame.done) {
        done = true
        break
      }
    }
  } catch (e) {
    if (signal?.aborted || (e as Error)?.name === "AbortError") return { ...out, stopped: true }
    return { ...out, error: UNREACHABLE }
  }
  if (signal?.aborted) return { ...out, stopped: true }
  if (!done) return { ...out, error: out.text ? "The answer was cut off. Try again." : UNREACHABLE }
  out.text = out.text.trim()
  if (!out.text) return { ...out, error: "The model sent back nothing. Try again, or pick another model." }
  return out
}
