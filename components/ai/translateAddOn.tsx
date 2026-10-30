"use client"

import { useCallback, useState } from "react"
import { Languages, Loader2 } from "@/lib/icons"
import { useAIAvailable } from "@/hooks/useClientConfig"
import { useTranslateText } from "@/services/aiService"
import { NO_MESSAGE_ADD_ON, provideAddOns } from "@/lib/addOns/core"

/**
 * Translate (C33), the AI edition's message add-on: the reader's language in a
 * card under the original, with the way back. An edit puts the original back.
 * Offered only while AI is on.
 */
function useTranslate(text: string) {
    const available = useAIAvailable()
    const { translateText, isSubmitting } = useTranslateText()
    const [done, setDone] = useState<{ of: string; text: string } | null>(null)
    const [shown, setShown] = useState(false)
    const words = text.trim()
    const translation = done?.of === words ? done.text : null
    const run = useCallback(async () => {
        const res = await translateText(words, typeof navigator !== "undefined" ? navigator.language : "English")
        if (res?.translation) {
            setDone({ of: words, text: res.translation })
            setShown(true)
        }
    }, [translateText, words])
    if (!available || !words) return NO_MESSAGE_ADD_ON
    return {
        actions: translation ? [] : [{ key: "translate", label: isSubmitting ? "Translating…" : "Translate", icon: Languages, busy: isSubmitting, run }],
        below:
            isSubmitting || (translation && shown) ? (
                <div className="mt-2 max-w-[760px] rounded-[10px] bg-sunken px-3 py-2 animate-fade-in">
                    <div className="mb-0.5 flex items-center gap-1.5 text-meta font-medium text-ink-3">
                        <Languages className="size-3" aria-hidden="true" />
                        {isSubmitting ? "Translating…" : "Translated"}
                        {translation && !isSubmitting && (
                            <>
                                <span aria-hidden="true">·</span>
                                <button type="button" onClick={() => setShown(false)} className="text-ink-3 underline-offset-2 hover:text-ink hover:underline">
                                    Show original
                                </button>
                            </>
                        )}
                    </div>
                    {isSubmitting && !translation ? (
                        <Loader2 className="size-3.5 animate-spin text-ink-3" />
                    ) : (
                        <p className="whitespace-pre-line text-body text-ink">{translation}</p>
                    )}
                </div>
            ) : translation ? (
                <button type="button" onClick={() => setShown(true)} className="mt-1 text-meta font-medium text-brand-text underline-offset-2 hover:underline">
                    Show translation
                </button>
            ) : null,
    }
}

provideAddOns({ useMessage: useTranslate })
