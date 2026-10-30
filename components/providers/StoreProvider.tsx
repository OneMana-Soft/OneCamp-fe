"use client"

import { useContext, type ReactNode } from "react"
import { Provider, ReactReduxContext } from "react-redux"
import store from "@/store/store"

/**
 * The app's Redux store, for the part of a page that reads it. The signed-in
 * app's layout provides it to every page under /app (app/app/ClientProviders).
 * A part that also shows outside /app and reads the store (a guest's call, a
 * shared doc, a guest's timeline) provides it itself, so the store's code
 * comes with that part, never with the first load of every page (the root
 * layout). Under a provider already, it adds none.
 */
export function StoreProvider({ children }: { children: ReactNode }) {
  if (useContext(ReactReduxContext)) return children
  return <Provider store={store}>{children}</Provider>
}
