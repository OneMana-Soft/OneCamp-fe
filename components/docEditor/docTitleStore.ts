"use client"

import * as React from "react"

/**
 * A doc's title while it's typed. It lived in the doc page's state, so each
 * key typed in the title rendered the page, the editor and everything in it
 * again. Now only what shows the title (the title field, the breadcrumb)
 * subscribes, and the page reads it when it saves or exports.
 */
export interface TitleStore {
    get: () => string
    set: (title: string) => void
    subscribe: (listener: () => void) => () => void
}

export function createTitleStore(initial: string): TitleStore {
    let title = initial
    const listeners = new Set<() => void>()
    return {
        get: () => title,
        set: (next) => {
            if (next === title) return
            title = next
            listeners.forEach((l) => l())
        },
        subscribe: (listener) => {
            listeners.add(listener)
            return () => {
                listeners.delete(listener)
            }
        },
    }
}

/** The title, rendering again only when it changes. */
export function useTitle(store: TitleStore): string {
    return React.useSyncExternalStore(store.subscribe, store.get, store.get)
}
