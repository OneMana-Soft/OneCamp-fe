"use client"

import { createContext, useContext, type ReactNode } from "react"
import type { Target } from "@/lib/conversation/types"

const ComposerTargetContext = createContext<Target | null>(null)

/**
 * Where a composer writes (chat A1 host, PROGRAM.md §3.6: frozen once A1
 * merges, its slots the integrator's). Every composer in a conversation or a
 * thread sits in one, so whatever reaches a composer (a command, a draft, a
 * share) reaches the one on the surface it was typed in, never another
 * conversation's.
 *
 * Step 1 (A1): it holds the target for today's composers inside it
 * (textInput reads it). CHAT-A1B moves the per-kind composers in.
 */
export function ComposerHost({ target, children }: { target: Target | null; children: ReactNode }) {
    return <ComposerTargetContext.Provider value={target}>{children}</ComposerTargetContext.Provider>
}

/** The conversation or thread the composer here writes to, or null outside a host (a doc's or task's comments). */
export function useComposerTarget(): Target | null {
    return useContext(ComposerTargetContext)
}
