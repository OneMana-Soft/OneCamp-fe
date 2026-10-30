"use client"

import type React from "react"
import { ErrorState } from "@/components/ui/error-state"
import { lazyPart } from "@/lib/lazy/lazyPart"

/**
 * A panel of the shell whose code is a chunk of its own: the right panel's
 * bodies, a thread. While its code comes it draws its placeholder (nothing by
 * default) and the rest of the screen stays as it was (V-39: next/dynamic
 * with no boundary of its own held up the shell around it until its chunk
 * landed). When its code can't come, the panel says so in its own room with
 * Try again (lazyPart also tries again when the browser is back online).
 */
export function lazyPanel<P extends object>(load: () => Promise<React.ComponentType<P>>, subject: string, placeholder?: React.ComponentType<P>): React.FC<P> {
  return lazyPart<P>(load, {
    placeholder,
    failed: ({ retry }) => <ErrorState className="h-full" subject={subject} onRetry={retry} />,
  }).Part
}
