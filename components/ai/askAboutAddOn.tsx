"use client"

import { useCallback, useState } from "react"
import { Sparkles } from "@/lib/icons"
import { useAIAvailable } from "@/hooks/useClientConfig"
import { useAnalyzeDocument, useAnalyzeImage } from "@/services/aiService"
import { NO_ATTACHMENT_ADD_ON, provideAddOns, type AttachmentSource } from "@/lib/addOns/core"
import type { AttachmentMediaReq } from "@/types/attachment"

// Documents the server can read for a summary; a scanned or locked PDF still
// gets a plain answer from it.
const READABLE = ["pdf", "txt", "md", "markdown", "csv", "json", "xml", "log", "docx"]

/**
 * Ask AI about a picture, or a summary of a document, open in the viewer: the
 * AI edition's add-on (lib/addOns/attachments), for a file posted where the
 * reader can read it. Offered only while AI is on.
 */
function useAskAbout(media: AttachmentMediaReq | undefined, image: boolean, source: AttachmentSource | undefined) {
    const available = useAIAvailable()
    const { analyzeImage, isSubmitting: looking } = useAnalyzeImage()
    const { analyzeDocument, isSubmitting: reading } = useAnalyzeDocument()
    const [said, setSaid] = useState<{ of: string; text: string } | null>(null)
    const id = media?.attachment_uuid
    const run = useCallback(async () => {
        if (!id || !source) return
        const res = image ? await analyzeImage(id, source.srcKey, source.srcRef) : await analyzeDocument(id, source.srcKey, source.srcRef)
        if (res?.description) setSaid({ of: id, text: res.description })
    }, [id, source, image, analyzeImage, analyzeDocument])
    const readable = image || READABLE.includes((media?.attachment_file_name?.split(".").pop() || "").toLowerCase())
    if (!available || !id || !source || !readable) return NO_ATTACHMENT_ADD_ON
    return {
        actions: [{ key: "ask-about", label: image ? "Ask AI about this image" : "Summarise with AI", icon: Sparkles, busy: image ? looking : reading, run }],
        note: said?.of === id ? { title: "AI summary", text: said.text } : null,
    }
}

provideAddOns({ useAttachment: useAskAbout })
