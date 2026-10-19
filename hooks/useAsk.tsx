"use client"

import { useCallback, useRef, useState, type ReactNode } from "react"

/**
 * A question asked as a promise, for a dialog that answers one: ask(q) shows
 * it and resolves with the answer, or null when it was closed unanswered. A
 * new question closes the one before it, unanswered. The host renders
 * `prompt` where it renders its dialogs; `asking` says one is open.
 */
export function useAsk<Q, A>(render: (question: Q, answer: (a: A | null) => void) => ReactNode) {
  const [question, setQuestion] = useState<{ q: Q } | null>(null)
  const resolver = useRef<((a: A | null) => void) | null>(null)
  const ask = useCallback((q: Q) => {
    resolver.current?.(null)
    setQuestion({ q })
    return new Promise<A | null>((resolve) => {
      resolver.current = resolve
    })
  }, [])
  const answer = useCallback((a: A | null) => {
    resolver.current?.(a)
    resolver.current = null
    setQuestion(null)
  }, [])
  return { ask, prompt: question ? render(question.q, answer) : null, asking: !!question }
}
